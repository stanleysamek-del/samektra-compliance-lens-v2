// Read-only spending check for the Codex notification. Never prints credentials.
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
for (const file of [".env.local", ".env.audit"]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (value && !process.env[key]) process.env[key] = value;
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(JSON.stringify({ status: "waiting_for_configuration", message: "Live database credential is not available locally; spending has not been checked." }));
} else {
  try {
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
    const { data: plans, error } = await service.from("ai_entitlements")
      .select("id,user_id,monthly_budget_usd").eq("payment_reference", "operator-owner-complimentary");
    if (error) throw new Error("Could not read owner allowance; migration or database access needs checking.");
    let plan;
    for (const candidate of plans ?? []) {
      const { data } = await service.auth.admin.getUserById(candidate.user_id);
      if (data.user?.email?.toLowerCase() === "stanley.samek@proton.me") plan = candidate;
    }
    if (!plan) {
      console.log(JSON.stringify({ status: "not_activated", message: "Owner allowance is not activated in the database." }));
    } else {
      let spent = 0, held = 0;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await service.from("ai_usage_reservations").select("id,reserved_usd,settled")
          .eq("entitlement_id", plan.id).order("id").range(offset, offset + 999);
        if (error) throw new Error("Could not read complete spending history.");
        for (const row of data ?? []) { if (row.settled) spent += Number(row.reserved_usd); else held += Number(row.reserved_usd); }
        if (!data || data.length < 1000) break;
      }
      const used = spent + held, limit = Number(plan.monthly_budget_usd);
      console.log(JSON.stringify({ status: used >= limit ? "limit_reached" : used >= 8 ? "near_limit" : "below_warning",
        spentUsd: spent, heldUsd: held, usedUsd: used, warningUsd: 8, limitUsd: limit }));
    }
  } catch (error) {
    console.log(JSON.stringify({ status: "check_failed", message: error instanceof Error ? error.message : "Budget check failed" }));
    process.exitCode = 1;
  }
}
