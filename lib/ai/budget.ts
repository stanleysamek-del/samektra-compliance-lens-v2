import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Daily AI spend cap (migration 0027, `public.check_ai_budget`).
 *
 * Every AI entry point calls `assertAiBudget()` before spending money.
 * The RPC sums `ai_calls.cost_usd` over the trailing 24 hours for the
 * user AND (when the inspection belongs to an org) for the whole org,
 * and answers true only when both are under their caps.
 *
 * Caps come from env so they can be tuned without a deploy of code:
 *   AI_DAILY_BUDGET_USER_USD  per-user cap, default 10
 *   AI_DAILY_BUDGET_ORG_USD   per-org cap,  default 50
 *
 * Fail-open on RPC error: before the migration is applied (or if the
 * function is ever dropped) the RPC errors, and we'd rather keep analysis
 * working than silently brick every upload. The condition is logged once
 * per process so the console isn't flooded but the gap is visible.
 */

export const AI_BUDGET_EXCEEDED_MESSAGE =
  "Daily AI budget reached — try again tomorrow or contact support";

export type AiBudgetResult = { ok: true } | { ok: false; error: string };

function readCap(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

let loggedRpcFailure = false;

export async function assertAiBudget(
  supabase: SupabaseClient,
  ids: { userId: string | null | undefined; orgId: string | null | undefined },
): Promise<AiBudgetResult> {
  // No user to attribute spend to → nothing to meter against. This only
  // happens for malformed rows; every real photo has created_by.
  if (!ids.userId) return { ok: true };

  const userCap = readCap("AI_DAILY_BUDGET_USER_USD", 10);
  const orgCap = readCap("AI_DAILY_BUDGET_ORG_USD", 50);

  const { data, error } = await supabase.rpc("check_ai_budget", {
    _user_id: ids.userId,
    _org_id: ids.orgId ?? null,
    _user_cap: userCap,
    _org_cap: orgCap,
  });

  if (error) {
    if (!loggedRpcFailure) {
      loggedRpcFailure = true;
      console.warn(
        "[ai-budget] check_ai_budget RPC failed — failing open (apply migration 0027):",
        { code: error.code, message: error.message?.slice(0, 200) },
      );
    }
    return { ok: true };
  }

  if (data === false) {
    return { ok: false, error: AI_BUDGET_EXCEEDED_MESSAGE };
  }
  return { ok: true };
}
