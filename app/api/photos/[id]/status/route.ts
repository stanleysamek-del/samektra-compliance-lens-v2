import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isMissingRelationError,
  queuePositionForPhoto,
  requeuePhoto,
  runAnalysisForPhoto,
  runWorker,
} from "@/lib/jobs/analysis";

/**
 * Analysis status for one photo (or one inspection) — the poll target for
 * the uploader's queue rows and the inspection page's progress strip.
 *
 * GET /api/photos/[id]/status
 *   [id] = photo id. →
 *   { status: 'queued'|'analyzing'|'done'|'failed', error: string|null,
 *     findingsCount: number, position: number|null }
 *   position = queued jobs older than this one + 1; null unless queued.
 *
 * GET /api/photos/[id]/status?inspection=1
 *   [id] = INSPECTION id. →
 *   { queued: number, analyzing: number, failed: number, done: number }
 *
 * POST /api/photos/[id]/status
 *   [id] = photo id. Re-queues a failed (or stuck) photo. The caller's RLS
 *   client proves access to the photo; the service client does the write
 *   (analysis_jobs has no user write policy). Without a service key the
 *   analysis runs inline on the user client so local dev still works. →
 *   { ok: true, status: 'queued', position } | { ok: true, status:
 *   'done'|'failed', findingsCount?, error? } | { ok: false, error }
 *
 * Pre-migration (0024 not applied): a photo reads as 'done', an
 * inspection reads all zeros, and POST answers 503.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const ANALYSIS_COLUMN_RE = /analysis_status|analysis_error/;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("inspection") === "1") {
    const { data, error } = await supabase
      .from("photos")
      .select("id, analysis_status")
      .eq("inspection_id", id);
    if (error) {
      if (ANALYSIS_COLUMN_RE.test(error.message ?? "")) {
        return NextResponse.json({ queued: 0, analyzing: 0, failed: 0, done: 0, preMigration: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const counts = { queued: 0, analyzing: 0, failed: 0, done: 0 };
    for (const row of data ?? []) {
      const s = String(row.analysis_status ?? "done");
      if (s === "queued") counts.queued += 1;
      else if (s === "analyzing") counts.analyzing += 1;
      else if (s === "failed") counts.failed += 1;
      else counts.done += 1;
    }
    return NextResponse.json(counts);
  }

  let status = "done";
  let errorText: string | null = null;
  let found = false;
  {
    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, analysis_status, analysis_error")
      .eq("id", id)
      .maybeSingle();
    if (error && ANALYSIS_COLUMN_RE.test(error.message ?? "")) {
      const { data: slim } = await supabase.from("photos").select("id").eq("id", id).maybeSingle();
      found = Boolean(slim);
    } else if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    } else if (photo) {
      found = true;
      status = String(photo.analysis_status ?? "done");
      errorText = (photo.analysis_error as string | null) ?? null;
    }
  }
  if (!found) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }

  const { count } = await supabase
    .from("findings")
    .select("id", { count: "exact", head: true })
    .eq("photo_id", id);

  let position: number | null = null;
  if (status === "queued") {
    try {
      position = await queuePositionForPhoto(supabase, id);
    } catch {
      position = null;
    }
  }

  return NextResponse.json({
    status,
    error: errorText,
    findingsCount: count ?? 0,
    position,
  });
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // RLS proves the caller can see this photo; a completed inspection is
  // locked (matches the upload route's 409).
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, inspections!inner(status)")
    .eq("id", id)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }
  const inspectionRel = photo.inspections as { status?: string } | { status?: string }[] | null;
  const inspectionStatus = Array.isArray(inspectionRel)
    ? inspectionRel[0]?.status
    : inspectionRel?.status;
  if (inspectionStatus === "completed") {
    return NextResponse.json({ ok: false, error: "Inspection is finalized" }, { status: 409 });
  }
  const inspectionId = photo.inspection_id as string;

  const service = createServiceClient();
  if (!service) {
    // No service key (local dev): run the analysis right here on the
    // caller's own client rather than answering 503 and stranding the photo.
    const result = await runAnalysisForPhoto(supabase, id);
    if (result.ok) {
      return NextResponse.json({ ok: true, status: "done", findingsCount: result.findingsCount });
    }
    return NextResponse.json({ ok: true, status: "failed", error: result.error });
  }

  const requeued = await requeuePhoto(service, id, inspectionId);
  if (!requeued.ok) {
    const status = isMissingRelationError(requeued.error) ? 503 : requeued.status;
    return NextResponse.json({ ok: false, error: requeued.error }, { status });
  }

  after(async () => {
    try {
      await runWorker(service, { budgetMs: 70_000, workerId: `retry-${id.slice(0, 8)}` });
    } catch (err) {
      console.error("[status] after() worker", err);
    }
  });

  return NextResponse.json({ ok: true, status: "queued", position: requeued.position });
}
