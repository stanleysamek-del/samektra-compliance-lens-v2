import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage, analyzeImageTwoStage } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/photos/upload
 *
 * Multipart body:
 *   image          — File (jpeg/png/webp, ≤ 10 MB)
 *   inspection_id  — UUID of the parent inspection
 *   photo_location — optional string
 *
 * Uploads to Supabase Storage, calls the AI, persists photo + findings +
 * what_to_look_for + not_visible + ai_calls. Returns { ok, photoId }.
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

  // Fetch the org's active learned rules (Chip's memory). Personal-
  // workspace inspections have no organization_id, so we skip the lookup
  // for those. RLS limits the SELECT to active rules on orgs the caller
  // is a member of.
  let orgRules: string[] = [];
  let orgRuleIds: string[] = [];
  if (inspection.organization_id) {
    const { data: ruleRows } = await supabase
      .from("learned_rules")
      .select("id, rule_text")
      .eq("organization_id", inspection.organization_id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      // Hard cap so a runaway rule library doesn't blow up the prompt.
      // 50 rules at 2 KB each = 100 KB of extra prompt — already a lot.
      .limit(50);
    orgRules = (ruleRows ?? [])
      .map((r) => String(r.rule_text ?? "").trim())
      .filter((s) => s.length > 0);
    orgRuleIds = (ruleRows ?? []).map((r) => r.id as string);
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

  const photoLocation =
    typeof formData.get("photo_location") === "string"
      ? (formData.get("photo_location") as string).trim() || null
      : null;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const storagePath = `${user.id}/${inspectionId}/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // ---- AI analysis + Supabase Storage upload run IN PARALLEL ----
  //
  // The AI call doesn't need the file to be in Supabase Storage — it
  // only needs the base64 bytes. The storage upload doesn't need the AI
  // analysis to finish. Previously these ran sequentially (upload first,
  // then analyze), costing ~1-2s of wall-clock time for nothing.
  //
  // Now we kick off both and Promise.all the results. If either fails,
  // we surface the error and best-effort clean up the orphan upload.

  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" | "google" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiDurationMs = 0;

  const base64 = Buffer.from(bytes).toString("base64");
  const useTwoStage = process.env.AI_TWO_STAGE === "1";

  // Kick off both operations concurrently. We use allSettled so a
  // failure in one doesn't lose the result of the other (we need the
  // analysis result to clean up the upload on failure, and vice-versa).
  const uploadPromise = supabase.storage
    .from("photos")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  const analysisPromise: Promise<
    Awaited<ReturnType<typeof analyzeImage>>
    | Awaited<ReturnType<typeof analyzeImageTwoStage>>
  > = useTwoStage
    ? analyzeImageTwoStage(base64, file.type, "default", [], orgRules)
    : analyzeImage(base64, file.type, "default", [], [], orgRules);

  const [uploadSettled, analysisSettled] = await Promise.allSettled([
    uploadPromise,
    analysisPromise,
  ]);

  // Upload failure — abandon and surface the error. If the AI call
  // happened to succeed, we drop the result (no photo row to attach it
  // to). The AI call cost is logged below for the ledger.
  if (uploadSettled.status === "rejected" || uploadSettled.value.error) {
    const msg =
      uploadSettled.status === "rejected"
        ? String(uploadSettled.reason)
        : uploadSettled.value.error?.message || "unknown";
    console.error("[upload] storage", msg);
    return NextResponse.json(
      { ok: false, error: `Storage upload failed: ${msg}` },
      { status: 502 },
    );
  }

  // Analysis failure — clean up the orphan upload, log, return error.
  if (analysisSettled.status === "rejected") {
    console.error("[upload] analyze", analysisSettled.reason);
    const message =
      analysisSettled.reason instanceof Error
        ? analysisSettled.reason.message
        : "AI analysis failed";
    await supabase.storage.from("photos").remove([storagePath]);
    await supabase.from("ai_calls").insert({
      inspection_id: inspectionId,
      provider: aiProvider,
      model: aiModel || "unknown",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // Both succeeded — unpack the analysis result.
  try {
    const result = analysisSettled.value;

    // Two-stage adds a detect call whose cost is reported in result.detection.
    let detectInputTokens = 0;
    let detectOutputTokens = 0;
    let detectCostUsd = 0;
    if (useTwoStage && "detection" in result && result.detection) {
      detectInputTokens = result.detection.usage.inputTokens;
      detectOutputTokens = result.detection.usage.outputTokens;
      detectCostUsd = result.detection.usage.costUsd;
    }

    analysis = result.analysis;
    aiProvider = result.provider;
    aiModel = result.model;
    aiInputTokens = result.usage.inputTokens + detectInputTokens;
    aiOutputTokens = result.usage.outputTokens + detectOutputTokens;
    aiCostUsd = result.usage.costUsd + detectCostUsd;
    aiDurationMs = result.durationMs;
  } catch (err) {
    console.error("[upload] analyze unpack", err);
    const message = err instanceof Error ? err.message : "AI analysis failed";

    await supabase.from("ai_calls").insert({
      inspection_id: inspectionId,
      provider: aiProvider,
      model: aiModel || "unknown",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: message,
    });

    await supabase.storage.from("photos").remove([storagePath]);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // ---- Persist photo ----
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .insert({
      inspection_id: inspectionId,
      storage_path: storagePath,
      width: analysis.image.width,
      height: analysis.image.height,
      photo_location: photoLocation,
      raw_analysis: analysis,
      analyzed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (photoErr || !photo) {
    console.error("[upload] photo insert", photoErr);
    await supabase.storage.from("photos").remove([storagePath]);
    return NextResponse.json(
      { ok: false, error: `Could not save photo: ${photoErr?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  await supabase.from("ai_calls").insert({
    inspection_id: inspectionId,
    photo_id: photo.id,
    provider: aiProvider,
    model: aiModel,
    input_tokens: aiInputTokens,
    output_tokens: aiOutputTokens,
    cost_usd: aiCostUsd,
    duration_ms: aiDurationMs,
    status: "success",
  });

  // Bump times_applied on every rule that contributed to this analysis.
  // Done as a single RPC so it's one round-trip regardless of rule count.
  // Best-effort — failure here doesn't break the upload flow.
  if (orgRuleIds.length > 0) {
    await supabase
      .rpc("increment_learned_rules_applied", { _rule_ids: orgRuleIds })
      .then(
        () => undefined,
        (err) => {
          console.warn("[upload] increment_learned_rules_applied", err);
        },
      );
  }

  if (analysis.violations.length > 0) {
    await supabase.from("findings").insert(
      analysis.violations.map((v) => ({
        inspection_id: inspectionId,
        photo_id: photo.id,
        title: v.title,
        category: v.category,
        code: v.code,
        severity: v.severity,
        description: v.description,
        location: v.location,
        remediation: v.remediation,
        references: v.references,
        bbox_x1: v.coordinates.x1,
        bbox_y1: v.coordinates.y1,
        bbox_x2: v.coordinates.x2,
        bbox_y2: v.coordinates.y2,
        ai_confidence: v.confidence,
      })),
    );
  }
  if (analysis.whatToLookFor.length > 0) {
    await supabase.from("what_to_look_for").insert(
      analysis.whatToLookFor.map((w) => ({
        photo_id: photo.id,
        inspection_id: inspectionId,
        item: w.item,
        details: w.details,
      })),
    );
  }
  if (analysis.notVisible.length > 0) {
    await supabase.from("not_visible").insert(
      analysis.notVisible.map((n) => ({
        photo_id: photo.id,
        inspection_id: inspectionId,
        item: n.item,
        reason: n.reason,
      })),
    );
  }

  return NextResponse.json({ ok: true, photoId: photo.id });
}
