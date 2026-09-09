import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export const AI_BUDGET_EXCEEDED_MESSAGE =
  "AI allowance reached. Manual inspections remain available.";
export type AiBudgetResult =
  | { ok: true; reservationId: string; plan: string }
  | { ok: false; error: string };

/** Fail closed. A browser cannot create entitlements or alter usage reservations. */
export async function assertAiBudget(
  _supabase: SupabaseClient,
  ids: {
    userId: string | null | undefined;
    orgId: string | null | undefined;
    tier?: "default" | "deep";
  },
): Promise<AiBudgetResult> {
  try {
    const service = createServiceClient();
    if (!service || !ids.userId)
      return {
        ok: false,
        error: "Paid AI is unavailable. Manual inspections remain available.",
      };
    const configured = Number(process.env.AI_GLOBAL_DAILY_BUDGET_USD ?? "25");
    const cap = Number.isFinite(configured) && configured >= 0 ? configured : 0;
    const { data, error } = await service.rpc("reserve_paid_ai", {
      _user_id: ids.userId,
      _org_id: ids.orgId ?? null,
      _tier: ids.tier ?? "default",
      _global_daily_cap: cap,
    });
    if (error || data?.ok !== true || !data.reservationId)
      return {
        ok: false,
        error: error
          ? "AI access could not be verified. Manual inspections remain available."
          : (data?.error ?? AI_BUDGET_EXCEEDED_MESSAGE),
      };
    return { ok: true, reservationId: data.reservationId, plan: data.plan };
  } catch {
    return {
      ok: false,
      error:
        "AI access could not be verified. Manual inspections remain available.",
    };
  }
}

/** Only server-confirmed provider usage can release a reservation. Failures keep the hold. */
export async function settleAiBudget(reservationId: string, costUsd: number) {
  const service = createServiceClient();
  if (!service || !Number.isFinite(costUsd) || costUsd <= 0) return;
  const { error } = await service.rpc("settle_paid_ai", {
    _id: reservationId,
    _cost: costUsd,
  });
  if (error)
    console.warn("[ai-budget] Could not settle reservation", error.code);
}
