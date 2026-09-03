import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeImage, analyzeImageTwoStage, type TwoStageResult } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";
import { prefillChecklistFromFindings } from "@/lib/checklists/engine";
import { loadChecklistFocus } from "@/lib/checklists/focus";

/**
 * Analysis queue — the "analyze + persist" body that the upload route used
 * to run inline, plus the worker loop that drains `analysis_jobs`
 * (migration 0024).
 *
 *   runAnalysisForPhoto(supabase, photoId)
 *     Loads the photo + inspection (+ the org's learned rules), pulls the
 *     resized copy back from the `photos` bucket, calls the vision model,
 *     and writes findings / what_to_look_for / not_visible / ai_calls /
 *     checklist pre-fill / photos.raw_analysis. Works with EITHER the
 *     user (RLS) client or the service-role client. Every row that
 *     carries a `default auth.uid()` NOT NULL column (findings.created_by,
 *     ai_calls.user_id) is set explicitly from photos.created_by — under
 *     the service role auth.uid() is NULL and the insert would fail.
 *
 *   runWorker(service, opts)
 *     Sweeps dead `running` jobs back to `queued`, then claims and runs
 *     jobs one at a time (Postgres FOR UPDATE SKIP LOCKED via
 *     claim_analysis_job) while under the global concurrency cap and the
 *     wall-clock budget. Service role only — the RPC is revoked from
 *     public and analysis_jobs has no write policy.
 *
 * Pre-migration posture: photos.analysis_status / analysis_error may not
 * exist yet. Every photo update here retries without those columns when
 * Postgres complains about them, so the analysis still lands.
 */

export type AnalysisRunResult =
  | { ok: true; findingsCount: number }
  | { ok: false; error: string; retryable: boolean };

export type WorkerSummary = {
  processed: number;
  requeued: number;
  failed: number;
  remaining: number;
  swept: number;
  /** Set when the loop stopped for a reason other than "queue empty". */
  stoppedBecause?: "budget" | "concurrency" | "migration-missing" | "error";
  error?: string;
};

/** Lock older than this = the function that claimed it is dead. */
export const STALE_LOCK_MS = 3 * 60 * 1000;

/** Default wall-clock budget for one worker invocation (route maxDuration 90). */
export const DEFAULT_WORKER_BUDGET_MS = 70 * 1000;

const ANALYSIS_COLUMN_RE = /analysis_status|analysis_error/;

/** True when Postgres says the analysis_jobs relation / RPC isn't there yet. */
export function isMissingRelationError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /analysis_jobs|claim_analysis_job/.test(message)
    && /does not exist|not exist|schema cache|not found|42P01|PGRST20/i.test(message);
}

/**
 * Should the worker try this photo again? Transient provider trouble
 * (timeouts, rate limits, overload, 5xx, a malformed reply) — yes.
 * Auth / validation problems — no, they won't fix themselves.
 */
export function isRetryableAnalysisError(message: string): boolean {
  if (/\b(401|403)\b|unauthorized|invalid (api )?key|authentication|forbidden/i.test(message)) {
    return false;
  }
  if (/unsupported|invalid image|too large|not found|validation/i.test(message)) {
    return false;
  }
  return /aborted|429|529|overloaded|rate|50[0-4]|JSON|timeout|timed out|ECONNRESET|fetch failed|all providers/i.test(
    message,
  );
}

/** Backoff after the Nth failed attempt: 15s / 45s / 2m / 5m. */
export function backoffMs(attempts: number): number {
  if (attempts <= 1) return 15_000;
  if (attempts === 2) return 45_000;
  if (attempts === 3) return 120_000;
  return 300_000;
}

/** Short, inspector-facing version of a raw provider error. */
export function friendlyAnalysisError(raw: string): string {
  if (/429|rate/i.test(raw)) return "Chip is rate-limited right now — the photo will be retried shortly.";
  if (/529|overloaded/i.test(raw)) return "The AI provider is overloaded — the photo will be retried shortly.";
  if (/aborted|timeout|timed out/i.test(raw)) return "Analysis timed out — the photo will be retried.";
  if (/JSON/i.test(raw)) return "Chip returned an unreadable answer — the photo will be retried.";
  if (/\b(401|403)\b|unauthorized|invalid (api )?key|authentication/i.test(raw)) {
    return "The AI provider rejected our credentials. Contact support.";
  }
  const trimmed = raw.trim();
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed || "Analysis failed.";
}

function mimeFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Update a photo row, dropping the 0024 columns when the migration hasn't
 * been applied yet. Returns the error message (if any) for logging.
 */
export async function updatePhotoTolerant(
  supabase: SupabaseClient,
  photoId: string,
  fields: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await supabase.from("photos").update(fields).eq("id", photoId);
  if (!error) return null;
  if (ANALYSIS_COLUMN_RE.test(error.message ?? "")) {
    const slim = { ...fields };
    delete slim.analysis_status;
    delete slim.analysis_error;
    if (Object.keys(slim).length === 0) return null;
    const { error: err2 } = await supabase.from("photos").update(slim).eq("id", photoId);
    return err2 ? err2.message : null;
  }
  return error.message;
}

export async function runAnalysisForPhoto(
  supabase: SupabaseClient,
  photoId: string,
): Promise<AnalysisRunResult> {
  // ---- Load photo + inspection ----
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, storage_path, created_by")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return {
      ok: false,
      error: photoErr?.message ? `Could not load photo: ${photoErr.message}` : "Photo not found",
      retryable: Boolean(photoErr),
    };
  }
  const inspectionId = photo.inspection_id as string;
  const createdBy = photo.created_by as string;
  const storagePath = photo.storage_path as string;

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status, organization_id")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) {
    return { ok: false, error: "Inspection not found", retryable: false };
  }

  // Records an ai_calls error row + marks the photo failed, then returns.
  const fail = async (rawMessage: string, retryableOverride?: boolean): Promise<AnalysisRunResult> => {
    const retryable = retryableOverride ?? isRetryableAnalysisError(rawMessage);
    const friendly = friendlyAnalysisError(rawMessage);
    await supabase
      .from("ai_calls")
      .insert({
        user_id: createdBy,
        inspection_id: inspectionId,
        photo_id: photoId,
        provider: "anthropic",
        model: "unknown",
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        duration_ms: 0,
        status: "error",
        error_message: rawMessage.slice(0, 2000),
      })
      .then(
        ({ error }) => {
          if (error) console.warn("[analysis] ai_calls error row", error.message);
        },
        (err) => console.warn("[analysis] ai_calls error row threw", err),
      );
    const updErr = await updatePhotoTolerant(supabase, photoId, {
      analysis_status: "failed",
      analysis_error: friendly,
    });
    if (updErr) console.warn("[analysis] mark failed", updErr);
    return { ok: false, error: friendly, retryable };
  };

  // ---- Org learned rules (Chip's memory) — same lookup the upload route ran ----
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
      .limit(50);
    orgRules = (ruleRows ?? [])
      .map((r) => String(r.rule_text ?? "").trim())
      .filter((s) => s.length > 0);
    orgRuleIds = (ruleRows ?? []).map((r) => r.id as string);
  }

  // ---- Pull the resized copy back from storage ----
  const { data: blob, error: dlErr } = await supabase.storage.from("photos").download(storagePath);
  if (dlErr || !blob) {
    return fail(`Could not download photo: ${dlErr?.message ?? "unknown"}`, true);
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const mimeType = blob.type && blob.type.startsWith("image/") ? blob.type : mimeFromPath(storagePath);

  // Open checklist questions ride along so Chip knows what this walk is
  // verifying (see formatChecklistFocus). Empty when no template.
  const checklistFocus = await loadChecklistFocus(supabase, inspectionId);
  const useTwoStage = process.env.AI_TWO_STAGE === "1";

  // ---- Run the AI ----
  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" | "google" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiDurationMs = 0;
  try {
    const result = useTwoStage
      ? await analyzeImageTwoStage(base64, mimeType, "default", [], orgRules, checklistFocus)
      : await analyzeImage(base64, mimeType, "default", [], [], orgRules, checklistFocus);

    // Two-stage adds a detect call whose cost is reported in result.detection.
    let detectInputTokens = 0;
    let detectOutputTokens = 0;
    let detectCostUsd = 0;
    const detection: TwoStageResult["detection"] = useTwoStage
      ? ((result as TwoStageResult).detection ?? null)
      : null;
    if (detection) {
      detectInputTokens = detection.usage.inputTokens;
      detectOutputTokens = detection.usage.outputTokens;
      detectCostUsd = detection.usage.costUsd;
    }

    analysis = result.analysis;
    aiProvider = result.provider;
    aiModel = result.model;
    aiInputTokens = result.usage.inputTokens + detectInputTokens;
    aiOutputTokens = result.usage.outputTokens + detectOutputTokens;
    aiCostUsd = result.usage.costUsd + detectCostUsd;
    aiDurationMs = result.durationMs;
  } catch (err) {
    console.error("[analysis] analyze", photoId, err);
    return fail(err instanceof Error ? err.message : "AI analysis failed");
  }

  // ---- Persist ----
  await supabase
    .from("ai_calls")
    .insert({
      user_id: createdBy,
      inspection_id: inspectionId,
      photo_id: photoId,
      provider: aiProvider,
      model: aiModel,
      input_tokens: aiInputTokens,
      output_tokens: aiOutputTokens,
      cost_usd: aiCostUsd,
      duration_ms: aiDurationMs,
      status: "success",
    })
    .then(
      ({ error }) => {
        if (error) console.warn("[analysis] ai_calls success row", error.message);
      },
      (err) => console.warn("[analysis] ai_calls success row threw", err),
    );

  // Bump times_applied on every rule that contributed to this analysis.
  // Best-effort — failure here doesn't break the flow.
  if (orgRuleIds.length > 0) {
    await supabase
      .rpc("increment_learned_rules_applied", { _rule_ids: orgRuleIds })
      .then(
        () => undefined,
        (err) => {
          console.warn("[analysis] increment_learned_rules_applied", err);
        },
      );
  }

  if (analysis.violations.length > 0) {
    const { data: insertedFindings, error: findErr } = await supabase
      .from("findings")
      .insert(
        analysis.violations.map((v) => ({
          inspection_id: inspectionId,
          photo_id: photoId,
          created_by: createdBy,
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
      )
      .select("id, title, description, code");
    if (findErr) {
      console.error("[analysis] findings insert", findErr.message);
      return fail(`Could not save findings: ${findErr.message}`, true);
    }

    // Checklist AI pre-fill: file each finding under the best-matching
    // open question (mark "no", link photo + finding). Best-effort —
    // no-op when the inspection has no checklist.
    if (insertedFindings && insertedFindings.length > 0) {
      try {
        await prefillChecklistFromFindings(supabase, inspectionId, insertedFindings, photoId);
      } catch (err) {
        console.warn("[analysis] checklist prefill", err);
      }
    }
  }
  if (analysis.whatToLookFor.length > 0) {
    const { error } = await supabase.from("what_to_look_for").insert(
      analysis.whatToLookFor.map((w) => ({
        photo_id: photoId,
        inspection_id: inspectionId,
        item: w.item,
        details: w.details,
      })),
    );
    if (error) console.warn("[analysis] what_to_look_for insert", error.message);
  }
  if (analysis.notVisible.length > 0) {
    const { error } = await supabase.from("not_visible").insert(
      analysis.notVisible.map((n) => ({
        photo_id: photoId,
        inspection_id: inspectionId,
        item: n.item,
        reason: n.reason,
      })),
    );
    if (error) console.warn("[analysis] not_visible insert", error.message);
  }

  const updErr = await updatePhotoTolerant(supabase, photoId, {
    raw_analysis: analysis,
    width: analysis.image.width,
    height: analysis.image.height,
    analyzed_at: new Date().toISOString(),
    analysis_status: "done",
    analysis_error: null,
  });
  if (updErr) {
    console.error("[analysis] photo update", updErr);
    return fail(`Could not save analysis: ${updErr}`, true);
  }

  return { ok: true, findingsCount: analysis.violations.length };
}

// ---- Worker -------------------------------------------------------------

type JobRow = {
  id: string;
  photo_id: string;
  inspection_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
};

function concurrencyCap(): number {
  const n = Number(process.env.AI_MAX_CONCURRENCY ?? "2");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

async function countRunning(service: SupabaseClient): Promise<number | null> {
  const since = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { count, error } = await service
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .gte("locked_at", since);
  if (error) {
    console.warn("[worker] count running", error.message);
    return null;
  }
  return count ?? 0;
}

async function countRemaining(service: SupabaseClient): Promise<number> {
  const { count } = await service
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  return count ?? 0;
}

/**
 * Re-queue jobs whose lock is older than STALE_LOCK_MS — the function that
 * claimed them was killed mid-analysis. Their photos go back to 'queued'
 * so the UI stops saying "Analyzing…" for something nobody is analyzing.
 */
async function sweepStale(service: SupabaseClient): Promise<{ swept: number; error?: string }> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data: stale, error } = await service
    .from("analysis_jobs")
    .select("id, photo_id")
    .eq("status", "running")
    .lt("locked_at", cutoff);
  if (error) return { swept: 0, error: error.message };
  if (!stale || stale.length === 0) return { swept: 0 };

  const ids = stale.map((j) => j.id as string);
  const photoIds = stale.map((j) => j.photo_id as string);
  const { error: updErr } = await service
    .from("analysis_jobs")
    .update({
      status: "queued",
      locked_at: null,
      locked_by: null,
      run_after: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (updErr) return { swept: 0, error: updErr.message };
  await service
    .from("photos")
    .update({ analysis_status: "queued", analysis_error: null })
    .in("id", photoIds)
    .then(({ error: e }) => {
      if (e) console.warn("[worker] sweep photo status", e.message);
    });
  return { swept: ids.length };
}

export async function runWorker(
  service: SupabaseClient,
  opts: { budgetMs?: number; workerId?: string } = {},
): Promise<WorkerSummary> {
  const startedAt = Date.now();
  const budgetMs = opts.budgetMs ?? DEFAULT_WORKER_BUDGET_MS;
  const workerId = opts.workerId ?? `w-${crypto.randomUUID().slice(0, 8)}`;
  const summary: WorkerSummary = { processed: 0, requeued: 0, failed: 0, remaining: 0, swept: 0 };

  const sweep = await sweepStale(service);
  if (sweep.error) {
    if (isMissingRelationError(sweep.error)) {
      return { ...summary, stoppedBecause: "migration-missing", error: sweep.error };
    }
    console.warn("[worker] sweep", sweep.error);
  }
  summary.swept = sweep.swept;

  const cap = concurrencyCap();

  while (Date.now() - startedAt < budgetMs) {
    const running = await countRunning(service);
    if (running === null) {
      summary.stoppedBecause = "error";
      break;
    }
    if (running >= cap) {
      summary.stoppedBecause = "concurrency";
      break;
    }

    const { data: claimed, error: claimErr } = await service.rpc("claim_analysis_job", {
      _worker: workerId,
    });
    if (claimErr) {
      if (isMissingRelationError(claimErr.message)) {
        return { ...summary, stoppedBecause: "migration-missing", error: claimErr.message };
      }
      console.error("[worker] claim", claimErr.message);
      summary.stoppedBecause = "error";
      summary.error = claimErr.message;
      break;
    }
    // The RPC returns the composite row, or a row of NULLs when nothing
    // was claimable — PostgREST serializes `return null` of a composite as
    // an object whose fields are all null.
    const job = (Array.isArray(claimed) ? claimed[0] : claimed) as JobRow | null;
    if (!job || !job.id) break;

    await updatePhotoTolerant(service, job.photo_id, {
      analysis_status: "analyzing",
      analysis_error: null,
    });

    let result: AnalysisRunResult;
    try {
      result = await runAnalysisForPhoto(service, job.photo_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[worker] runAnalysisForPhoto threw", job.photo_id, message);
      result = { ok: false, error: friendlyAnalysisError(message), retryable: isRetryableAnalysisError(message) };
    }

    const nowIso = new Date().toISOString();
    if (result.ok) {
      await service
        .from("analysis_jobs")
        .update({ status: "done", locked_at: null, locked_by: null, last_error: null, updated_at: nowIso })
        .eq("id", job.id);
      summary.processed += 1;
    } else if (result.retryable && job.attempts < job.max_attempts) {
      const runAfter = new Date(Date.now() + backoffMs(job.attempts)).toISOString();
      await service
        .from("analysis_jobs")
        .update({
          status: "queued",
          locked_at: null,
          locked_by: null,
          run_after: runAfter,
          last_error: result.error,
          updated_at: nowIso,
        })
        .eq("id", job.id);
      // runAnalysisForPhoto marked the photo failed; it's only WAITING.
      await updatePhotoTolerant(service, job.photo_id, {
        analysis_status: "queued",
        analysis_error: result.error,
      });
      summary.requeued += 1;
    } else {
      await service
        .from("analysis_jobs")
        .update({ status: "failed", locked_at: null, locked_by: null, last_error: result.error, updated_at: nowIso })
        .eq("id", job.id);
      await updatePhotoTolerant(service, job.photo_id, {
        analysis_status: "failed",
        analysis_error: result.error,
      });
      summary.failed += 1;
    }
  }

  if (!summary.stoppedBecause && Date.now() - startedAt >= budgetMs) {
    summary.stoppedBecause = "budget";
  }
  summary.remaining = await countRemaining(service);
  return summary;
}

/**
 * Put a photo back on the queue (fresh attempts). Used by the Retry
 * button. Refuses while a worker actively holds the job — re-queueing a
 * live job would double-run the analysis and double-charge the call.
 */
export async function requeuePhoto(
  service: SupabaseClient,
  photoId: string,
  inspectionId: string,
): Promise<{ ok: true; position: number } | { ok: false; error: string; status: number }> {
  const { data: existing, error: readErr } = await service
    .from("analysis_jobs")
    .select("id, status, locked_at")
    .eq("photo_id", photoId)
    .maybeSingle();
  if (readErr) {
    if (isMissingRelationError(readErr.message)) {
      return { ok: false, error: "Analysis queue not available (migration 0024 pending).", status: 503 };
    }
    return { ok: false, error: readErr.message, status: 500 };
  }
  if (existing?.status === "running" && existing.locked_at) {
    const age = Date.now() - Date.parse(existing.locked_at as string);
    if (age < STALE_LOCK_MS) {
      return { ok: false, error: "This photo is being analyzed right now.", status: 409 };
    }
  }

  const nowIso = new Date().toISOString();
  const { error: upsertErr } = await service
    .from("analysis_jobs")
    .upsert(
      {
        photo_id: photoId,
        inspection_id: inspectionId,
        status: "queued",
        attempts: 0,
        run_after: nowIso,
        locked_at: null,
        locked_by: null,
        last_error: null,
        // Fresh created_at so a retry takes its place at the BACK of the line.
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "photo_id" },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message, status: 500 };

  await updatePhotoTolerant(service, photoId, { analysis_status: "queued", analysis_error: null });
  const position = await queuePositionForPhoto(service, photoId);
  return { ok: true, position: position ?? 1 };
}

/**
 * 1-based place in line for a queued photo: queued jobs created before
 * this one + 1. Null when the photo has no queued job.
 */
export async function queuePositionForPhoto(
  supabase: SupabaseClient,
  photoId: string,
): Promise<number | null> {
  const { data: job, error } = await supabase
    .from("analysis_jobs")
    .select("id, status, created_at")
    .eq("photo_id", photoId)
    .maybeSingle();
  if (error || !job || job.status !== "queued") return null;
  const { count } = await supabase
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("created_at", job.created_at as string);
  return (count ?? 0) + 1;
}
