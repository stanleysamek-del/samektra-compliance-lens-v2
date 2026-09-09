import { persistAnalysis } from "@/lib/jobs/persist-analysis";
import { requireInspectionWrite } from "@/lib/inspection-access";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage } from "@/lib/ai/client";
import { assertAiBudget, settleAiBudget } from "@/lib/ai/budget";
import { loadChecklistFocus } from "@/lib/checklists/focus";
import { burnAnnotationsOnImage } from "@/lib/ai/burn-annotations";
import { formatCoachThread, type CoachTurn } from "@/lib/prompts/coach";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * GET /api/photos/[id]/coach
 *
 * List all coach turns for a photo, oldest first. Used by the client to
 * hydrate the panel on page load and after navigation.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: photoId } = await ctx.params;
  if (!photoId) {
    return NextResponse.json({ ok: false, error: "Missing photo id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("photo_coach_turns")
    .select("id, turn_index, role, text, annotation_ref, ai_meta, created_at")
    .eq("photo_id", photoId)
    .order("turn_index", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, turns: data ?? [] });
}

/**
 * POST /api/photos/[id]/coach
 *
 * Body: { text: string, annotationRef?: { x1, y1, x2, y2, type?, color? } }
 *
 * 1. Insert inspector turn at turn_index = N
 * 2. Load conversation history (now including the new inspector turn)
 * 3. Burn annotations onto the image (same as reanalyze)
 * 4. Call Sonnet with the photo + the conversation as authoritative context
 * 5. Insert AI turn at turn_index = N+1 with text = summary.text
 * 6. Replace findings (delete non-edited, insert new) — preserves inspector edits
 * 7. Log ai_calls row + update photos.raw_analysis
 *
 * Returns the two newly-created turns + an "updated N findings" count.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: photoId } = await ctx.params;
  if (!photoId) {
    return NextResponse.json({ ok: false, error: "Missing photo id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    annotationRef?: CoachTurn["annotationRef"];
  };
  const hintText = String(body.text ?? "").trim();
  if (!hintText) {
    return NextResponse.json(
      { ok: false, error: "Hint text is required" },
      { status: 400 },
    );
  }
  if (hintText.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "Hint text is too long (max 4000 chars)" },
      { status: 400 },
    );
  }
  const annotationRef = body.annotationRef ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // ---- Load photo + parent inspection ----
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, storage_path, photo_location, annotations, created_by, analyzed_at")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }
  const access = await requireInspectionWrite(supabase, photo.inspection_id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });


  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status, organization_id")
    .eq("id", photo.inspection_id)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json(
      { ok: false, error: "Inspection not found" },
      { status: 404 },
    );
  }
  if (inspection.status === "completed") {
    return NextResponse.json(
      { ok: false, error: "Inspection is finalized" },
      { status: 409 },
    );
  }

  // Daily AI spend cap — metered against the photo's owner + the org.
  const budget = await assertAiBudget(supabase, {
    userId: user.id,
    orgId: inspection.organization_id as string | null,
  });
  if (!budget.ok) {
    return NextResponse.json({ ok: false, error: budget.error }, { status: 429 });
  }

  // ---- Load existing turns to build the conversation ----
  const { data: priorTurns } = await supabase
    .from("photo_coach_turns")
    .select("turn_index, role, text, annotation_ref")
    .eq("photo_id", photoId)
    .order("turn_index", { ascending: true });

  const history: CoachTurn[] = (priorTurns ?? []).map((t) => ({
    role: t.role as "inspector" | "ai",
    text: t.text,
    annotationRef: (t.annotation_ref as CoachTurn["annotationRef"]) ?? null,
  }));

  const lastIndex = (priorTurns ?? []).reduce(
    (max, t) => Math.max(max, t.turn_index),
    -1,
  );
  const inspectorTurnIndex = lastIndex + 1;
  const aiTurnIndex = lastIndex + 2;

  // ---- Insert the inspector turn FIRST so it survives even if AI fails ----
  const { data: inspectorTurnRow, error: insTurnErr } = await supabase
    .from("photo_coach_turns")
    .insert({
      photo_id: photoId,
      inspection_id: photo.inspection_id,
      turn_index: inspectorTurnIndex,
      role: "inspector",
      text: hintText,
      annotation_ref: annotationRef,
    })
    .select("id, turn_index, role, text, annotation_ref, ai_meta, created_at")
    .maybeSingle();
  if (insTurnErr || !inspectorTurnRow) {
    return NextResponse.json(
      { ok: false, error: insTurnErr?.message ?? "Couldn't save hint" },
      { status: 500 },
    );
  }

  // ---- Existing findings — pulled with title + user_rating so we can BOTH
  // burn the bboxes AND tell the AI which of its prior calls the inspector
  // thumbs-up'd vs thumbs-down'd. The ratings are the highest-value signal
  // the AI gets next to the conversation itself. ----
  const { data: existingFindings } = await supabase
    .from("findings")
    .select(
      "title, severity, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill, user_rating, edited, created_at",
    )
    .eq("photo_id", photoId)
    .order("created_at", { ascending: true });
  const burnableBboxes = (existingFindings ?? [])
    .filter(
      (f) =>
        (f.severity === "Medium" || f.severity === "High") &&
        f.bbox_x1 != null &&
        f.bbox_y1 != null &&
        f.bbox_x2 != null &&
        f.bbox_y2 != null,
    )
    .map((f, idx) => ({
      x1: Number(f.bbox_x1),
      y1: Number(f.bbox_y1),
      x2: Number(f.bbox_x2),
      y2: Number(f.bbox_y2),
      color: (f.bbox_color as string | null) ?? null,
      strokeWidth: (f.bbox_stroke_width as number | null) ?? null,
      fill: (f.bbox_fill as string | null) ?? null,
      severity: f.severity as "Low" | "Medium" | "High",
      index: idx,
    }));

  // Pull just the rated findings for the prompt — both up and down.
  const ratedFindings = (existingFindings ?? [])
    .filter((f) => f.user_rating === 1 || f.user_rating === -1)
    .map((f) => ({
      title: String(f.title ?? ""),
      severity: f.severity as "Low" | "Medium" | "High",
      rating: f.user_rating as 1 | -1,
    }));

  // ---- Download photo and burn annotations + AI bboxes ----
  const { data: blob, error: dlErr } = await supabase.storage
    .from("photos")
    .download(photo.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { ok: false, error: `Could not download photo: ${dlErr?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  let imgBuffer: Buffer = Buffer.from(arrayBuffer);
  let mimeType = blob.type || "image/jpeg";

  const photoAnnotations =
    (photo.annotations as import("@/app/inspections/[id]/photos/[photoId]/actions").Annotation[] | null) ??
    [];

  // Phase 2: if the inspector attached an annotationRef to THIS hint, burn it
  // onto the image too so the AI literally sees it as a colored shape.
  const ephemeralAnnotation = annotationRef
    ? [
        {
          id: `coach-${inspectorTurnIndex}`,
          type: (annotationRef.type as "rect" | "circle" | "arrow" | "text") ?? "rect",
          color: annotationRef.color ?? "#b8902f",
          x1: annotationRef.x1,
          y1: annotationRef.y1,
          x2: annotationRef.x2,
          y2: annotationRef.y2,
        },
      ]
    : [];
  const allAnnotations = [...photoAnnotations, ...ephemeralAnnotation] as import("@/app/inspections/[id]/photos/[photoId]/actions").Annotation[];

  if (allAnnotations.length > 0 || burnableBboxes.length > 0) {
    try {
      imgBuffer = await burnAnnotationsOnImage(
        imgBuffer,
        allAnnotations,
        burnableBboxes,
      );
      mimeType = "image/jpeg";
    } catch (err) {
      console.warn("[coach] burn-annotations failed, falling back to raw image:", err);
    }
  }

  const base64 = imgBuffer.toString("base64");

  // ---- Build coaching context and call AI ----
  // ratedFindings carries the thumbs-up / thumbs-down signal; formatCoachThread
  // prepends it as its own authoritative block so the model treats those calls
  // as confirmed (keep) or wrong (drop) regardless of what it sees in the image.
  const coachContext = formatCoachThread(
    history,
    hintText,
    annotationRef,
    ratedFindings,
  );

  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" | "google" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiCostComplete = false;
  let aiDurationMs = 0;

  // Fetch org house rules so Chip applies team-taught knowledge on every
  // coach turn too, not just on the initial photo upload. RLS limits the
  // select to rules on orgs the caller is a member of.
  let orgRules: string[] = [];
  if (inspection.organization_id) {
    const { data: ruleRows } = await supabase
      .from("learned_rules")
      .select("rule_text")
      .eq("organization_id", inspection.organization_id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(50);
    orgRules = (ruleRows ?? [])
      .map((r) => String(r.rule_text ?? "").trim())
      .filter((s) => s.length > 0);
  }

  try {
    // Coach turns use HAIKU by default — they are clarifications layered on
    // top of a previous analysis, not a fresh deep look, so Haiku's speed
    // (~3x faster than Sonnet) is more valuable than Sonnet's extra reasoning.
    // Users who want the deep model can run /api/photos/[id]/reanalyze
    // explicitly. Env override AI_COACH_TIER=deep restores the old behavior
    // for A/B testing.
    const coachTier =
      process.env.AI_COACH_TIER === "deep" ? "deep" : "default";
    const checklistFocus = await loadChecklistFocus(supabase, photo.inspection_id);
    const result = await analyzeImage(
      base64,
      mimeType,
      coachTier,
      coachContext,
      [], // no two-stage focus hint for coach turns (already focused via conversation)
      orgRules,
      checklistFocus,
    );
    aiCostComplete = result.costComplete === true;
    analysis = result.analysis;
    aiProvider = result.provider;
    aiModel = result.model;
    aiInputTokens = result.usage.inputTokens;
    aiOutputTokens = result.usage.outputTokens;
    aiCostUsd = result.usage.costUsd;
    aiDurationMs = result.durationMs;
  } catch (err) {
    console.error("[coach]", err);
    const message = err instanceof Error ? err.message : "Coach re-analysis failed";

    // Log the failed call
    const { data: failedCall } = await supabase
      .from("ai_calls")
      .insert({
        inspection_id: photo.inspection_id,
        photo_id: photo.id,
        provider: aiProvider,
        model: aiModel || "unknown",
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        duration_ms: 0,
        status: "error",
        error_message: message,
      })
      .select("id")
      .maybeSingle();

    // Persist a placeholder AI turn so the inspector sees what happened
    // and the thread doesn't end on a dangling inspector turn.
    await supabase.from("photo_coach_turns").insert({
      photo_id: photo.id,
      inspection_id: photo.inspection_id,
      turn_index: aiTurnIndex,
      role: "ai",
      text: `Sorry — I couldn't complete that analysis. (${message}) Try again, or rephrase the hint.`,
      ai_meta: { error: true, errorMessage: message },
      ai_call_id: failedCall?.id ?? null,
    });

    return NextResponse.json(
      { ok: false, error: message, inspectorTurn: inspectorTurnRow },
      { status: 502 },
    );
  }

  if (aiCostComplete) await settleAiBudget(budget.reservationId, aiCostUsd);

  // ---- Log the successful AI call (so we can link the turn to it) ----
  const { data: callRow } = await supabase
    .from("ai_calls")
    .insert({
      inspection_id: photo.inspection_id,
      photo_id: photo.id,
      provider: aiProvider,
      model: aiModel,
      input_tokens: aiInputTokens,
      output_tokens: aiOutputTokens,
      cost_usd: aiCostUsd,
      duration_ms: aiDurationMs,
      status: "success",
    })
    .select("id")
    .maybeSingle();

  const persisted = await persistAnalysis(supabase, photo.id, photo.inspection_id,
    analysis, true, photo.analyzed_at ?? null);
  if (!persisted.ok) return NextResponse.json({ ok: false, error: persisted.error }, { status: persisted.status });
  const preservedCount = persisted.saved.preservedCount;
  const restoredRatings = 0; // Rated findings retain their IDs and feedback.
  const autoResolvedCount = 0; // Only an inspector can verify missing evidence.

  // ---- Insert the AI turn — text comes from analysis.summary.text ----
  const aiText =
    (analysis.summary?.text ?? "").trim() ||
    `Re-analyzed with your hint. Updated findings (${analysis.violations.length}).`;

  const aiMeta = {
    findingsCount: persisted.saved.findingsCount,
    findingsPreserved: preservedCount ?? 0,
    ratingsRestored: restoredRatings,
    autoResolvedPunchList: autoResolvedCount,
    whatToLookForCount: analysis.whatToLookFor.length,
    notVisibleCount: analysis.notVisible.length,
    confidence: analysis.summary?.confidence ?? null,
    imageQuality: analysis.summary?.imageQuality ?? null,
    model: aiModel,
    provider: aiProvider,
    costUsd: aiCostUsd,
    durationMs: aiDurationMs,
    // Phase 3 — the optional clarifying question, surfaced to the UI as
    // a chip-style question bubble. Null/absent on most turns.
    clarifyingQuestion: analysis.clarifyingQuestion ?? null,
  };

  const { data: aiTurnRow, error: aiTurnErr } = await supabase
    .from("photo_coach_turns")
    .insert({
      photo_id: photo.id,
      inspection_id: photo.inspection_id,
      turn_index: aiTurnIndex,
      role: "ai",
      text: aiText,
      ai_meta: aiMeta,
      ai_call_id: callRow?.id ?? null,
    })
    .select("id, turn_index, role, text, annotation_ref, ai_meta, created_at")
    .maybeSingle();

  if (aiTurnErr || !aiTurnRow) {
    // The AI call succeeded and findings were already written, but the
    // turn row itself didn't land. Log loudly so we can see this in the
    // Vercel function logs and tell the client to re-hydrate from server
    // rather than trusting the inline payload.
    console.error("[coach] AI turn insert failed:", aiTurnErr, {
      photoId: photo.id,
      aiTurnIndex,
      aiTextLen: aiText.length,
    });
  }

  console.log("[coach] success", {
    photoId: photo.id,
    inspectorTurnIndex,
    aiTurnIndex,
    findingsCount: persisted.saved.findingsCount,
    preservedCount: preservedCount ?? 0,
    costUsd: aiCostUsd,
    durationMs: aiDurationMs,
    model: aiModel,
  });

  return NextResponse.json({
    ok: true,
    inspectorTurn: inspectorTurnRow,
    aiTurn: aiTurnRow ?? null,
    aiTurnInsertError: aiTurnErr?.message ?? null,
    findingsCount: persisted.saved.findingsCount,
    preservedUserFindings: preservedCount ?? 0,
    model: aiModel,
    costUsd: aiCostUsd,
  });
}
