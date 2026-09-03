import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAnalysisForPhoto, runWorker } from "@/lib/jobs/analysis";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/photos/upload
 *
 * Multipart body:
 *   image          — File (jpeg/png/webp, ≤ 10 MB)
 *   original       — optional zoom copy (same rules)
 *   inspection_id  — UUID of the parent inspection
 *   photo_location — optional string
 *
 * Uploads to Supabase Storage, inserts the photo row, and ENQUEUES the AI
 * analysis (migration 0024 `analysis_jobs`) — the vision call no longer
 * runs inline, so N inspectors at once queue instead of racing one API
 * key. Responds `{ ok, photoId, queued: true, position }` immediately,
 * then kicks the worker via `after()` so the no-contention case still
 * finishes in the same invocation; the minute cron covers everything else.
 *
 * Graceful degrade: enqueueing needs the service-role client (the table
 * has no user write policy). Without SUPABASE_SERVICE_ROLE_KEY, or before
 * 0024 is applied, the route falls back to the old inline behavior and
 * returns `{ ok, photoId, findingsCount }`.
 *
 * Replaces the previous server action approach (which 400'd intermittently
 * in Next.js 16 due to cross-origin checks during the action invocation).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!inspectionId) {
    return NextResponse.json({ ok: false, error: "Missing inspection_id" }, { status: 400 });
  }

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status, organization_id")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json({ ok: false, error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.status === "completed") {
    return NextResponse.json({ ok: false, error: "Inspection is finalized" }, { status: 409 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing image" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported image type ${file.type}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image too large (max 10 MB)" },
      { status: 413 },
    );
  }

  // Full-resolution original (migration 0023) — optional and best-effort.
  // Same mime/size rules as the resized copy; a bad or missing original
  // never fails the upload, it just means no zoom-in copy gets kept.
  const originalFile = formData.get("original");
  let validOriginal: File | null = null;
  if (originalFile instanceof File) {
    if (ALLOWED_MIMES.has(originalFile.type) && originalFile.size <= MAX_BYTES) {
      validOriginal = originalFile;
    } else {
      console.warn("[upload] rejecting original: bad mime/size", originalFile.type, originalFile.size);
    }
  }

  const photoLocation =
    typeof formData.get("photo_location") === "string"
      ? (formData.get("photo_location") as string).trim() || null
      : null;

  // Integrity fields the client read from the ORIGINAL file before its
  // resize stripped EXIF (migration 0020). All optional + validated —
  // an upload never fails over missing/garbled integrity data.
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const numOrNull = (k: string, min: number, max: number) => {
    const v = str(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  const originalSha256Raw = str("original_sha256");
  const originalSha256 =
    originalSha256Raw && /^[0-9a-f]{64}$/.test(originalSha256Raw)
      ? originalSha256Raw
      : null;
  const exifLat = numOrNull("exif_lat", -90, 90);
  const exifLng = numOrNull("exif_lng", -180, 180);
  const exifTakenAtRaw = str("exif_taken_at");
  const exifTakenAt =
    exifTakenAtRaw && !Number.isNaN(Date.parse(exifTakenAtRaw))
      ? new Date(exifTakenAtRaw).toISOString()
      : null;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const storagePath = `${user.id}/${inspectionId}/${filename}`;
  let originalStoragePath: string | null = null;
  let originalBytes: Uint8Array | null = null;
  if (validOriginal) {
    const origExt =
      validOriginal.type === "image/png" ? "png" : validOriginal.type === "image/webp" ? "webp" : "jpg";
    originalStoragePath = `${user.id}/${inspectionId}/${filename.replace(/\.[^.]+$/, "")}-original.${origExt}`;
    originalBytes = new Uint8Array(await validOriginal.arrayBuffer());
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // ---- Storage uploads (resized + zoom copy) run in parallel ----
  const uploadPromise = supabase.storage
    .from("photos")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  // Best-effort — a failed original upload must never fail the request or
  // roll back the (successful) resized upload. Logged, not awaited into the
  // failure path below.
  const originalUploadPromise: Promise<void> = originalStoragePath && originalBytes
    ? supabase.storage
        .from("photos")
        .upload(originalStoragePath, originalBytes, { contentType: validOriginal!.type, upsert: false })
        .then(({ error }) => {
          if (error) {
            console.warn("[upload] original storage upload failed", error.message);
            originalStoragePath = null;
          }
        })
        .catch((err) => {
          console.warn("[upload] original storage upload threw", err);
          originalStoragePath = null;
        })
    : Promise.resolve();

  const [uploadSettled] = await Promise.all([
    uploadPromise.then(
      (v) => ({ status: "fulfilled" as const, value: v }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
    originalUploadPromise,
  ]);

  if (uploadSettled.status === "rejected" || uploadSettled.value.error) {
    const msg =
      uploadSettled.status === "rejected"
        ? String(uploadSettled.reason)
        : uploadSettled.value.error?.message || "unknown";
    console.error("[upload] storage", msg);
    if (originalStoragePath) {
      await supabase.storage.from("photos").remove([originalStoragePath]).catch(() => undefined);
    }
    return NextResponse.json(
      { ok: false, error: `Storage upload failed: ${msg}` },
      { status: 502 },
    );
  }

  // ---- Persist photo (analysis pending) ----
  const photoRow: Record<string, unknown> = {
    inspection_id: inspectionId,
    storage_path: storagePath,
    width: null,
    height: null,
    photo_location: photoLocation,
    raw_analysis: null,
    analyzed_at: null,
    analysis_status: "queued",
    analysis_error: null,
    original_sha256: originalSha256,
    exif_lat: exifLat,
    exif_lng: exifLng,
    exif_taken_at: exifTakenAt,
    original_storage_path: originalStoragePath,
  };
  // True once we know migration 0024 isn't applied (no analysis_status
  // column) — the queue can't exist either, so analyze inline.
  let preMigration = false;
  const insertPhoto = async (row: Record<string, unknown>) =>
    supabase.from("photos").insert(row).select("id").single();
  let { data: photo, error: photoErr } = await insertPhoto(photoRow);
  for (let attempt = 0; photoErr && attempt < 2; attempt += 1) {
    const msg = photoErr.message ?? "";
    if (/analysis_status|analysis_error/.test(msg)) {
      preMigration = true;
      delete photoRow.analysis_status;
      delete photoRow.analysis_error;
    } else if (/original_sha256|exif_|original_storage_path/.test(msg)) {
      // Migration 0020 not applied yet — save the photo without integrity
      // fields rather than failing the upload.
      delete photoRow.original_sha256;
      delete photoRow.original_storage_path;
      delete photoRow.exif_lat;
      delete photoRow.exif_lng;
      delete photoRow.exif_taken_at;
    } else {
      break;
    }
    ({ data: photo, error: photoErr } = await insertPhoto(photoRow));
  }
  if (photoErr || !photo) {
    console.error("[upload] photo insert", photoErr);
    await supabase.storage
      .from("photos")
      .remove(originalStoragePath ? [storagePath, originalStoragePath] : [storagePath]);
    return NextResponse.json(
      { ok: false, error: `Could not save photo: ${photoErr?.message ?? "unknown"}` },
      { status: 502 },
    );
  }
  const photoId = photo.id as string;

  // ---- Enqueue (service role) ----
  const service = preMigration ? null : createServiceClient();
  if (service) {
    const { data: job, error: jobErr } = await service
      .from("analysis_jobs")
      .insert({ photo_id: photoId, inspection_id: inspectionId })
      .select("id, created_at")
      .single();

    if (!jobErr && job) {
      // Place in line: queued/running jobs created before this one.
      const { count } = await service
        .from("analysis_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "running"])
        .lt("created_at", job.created_at as string);
      const position = count ?? 0;

      // Fire-and-forget after the response: drain the queue now so the
      // common case doesn't wait for the cron. Budget leaves headroom
      // under this route's maxDuration.
      after(async () => {
        try {
          await runWorker(service, { budgetMs: 70_000, workerId: `upload-${photoId.slice(0, 8)}` });
        } catch (err) {
          console.error("[upload] after() worker", err);
        }
      });

      return NextResponse.json({ ok: true, photoId, queued: true, position });
    }

    // Relation missing (0024 not applied) or any other enqueue failure:
    // never strand a saved photo — analyze inline below.
    console.warn("[upload] enqueue failed, analyzing inline:", jobErr?.message);
  } else if (!preMigration) {
    console.warn("[upload] SUPABASE_SERVICE_ROLE_KEY not set — analyzing inline (no queue).");
  }

  // ---- Inline fallback (pre-migration / no service key) ----
  const result = await runAnalysisForPhoto(supabase, photoId);
  if (!result.ok) {
    // The photo row stays (status 'failed' where the column exists) so the
    // inspector can Retry analysis instead of re-uploading.
    return NextResponse.json({ ok: false, error: result.error, photoId }, { status: 502 });
  }
  return NextResponse.json({ ok: true, photoId, findingsCount: result.findingsCount });
}
