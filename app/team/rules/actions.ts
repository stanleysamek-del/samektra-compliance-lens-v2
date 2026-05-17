"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";

/* =====================================================================
 * Learned-rules server actions — the persistent "Chip's memory" feature.
 *
 * All writes are admin-only at the RLS layer (migration 0017). We don't
 * re-check admin status in server actions because RLS would reject the
 * write anyway and surface a clean error; this keeps the codepath simple.
 *
 * After a write, we revalidate /team/rules so the admin page reflects
 * the change immediately, and /inspections so the next analyze call
 * fetches the updated rule set.
 * ===================================================================== */

export async function createLearnedRule(formData: FormData) {
  const ruleText = String(formData.get("rule_text") ?? "").trim();
  const sourceFindingId =
    String(formData.get("source_finding_id") ?? "").trim() || null;
  const sourcePhotoId =
    String(formData.get("source_photo_id") ?? "").trim() || null;
  const redirectTo =
    String(formData.get("redirect_to") ?? "").trim() || "/team/rules";

  if (!ruleText) {
    redirect(`${redirectTo}?error=${encodeURIComponent("Rule text is required")}`);
  }
  if (ruleText.length > 2000) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent(
        "Rule is too long (max 2000 characters)",
      )}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Rules require an active organization. Personal-workspace users can
  // still use per-photo Coach memory but cannot save org-wide rules.
  const org = await getCurrentOrg();
  if (!org) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent(
        "Switch to a team workspace before saving a rule",
      )}`,
    );
  }

  const { error } = await supabase.from("learned_rules").insert({
    organization_id: org!.id,
    rule_text: ruleText,
    source_finding_id: sourceFindingId,
    source_photo_id: sourcePhotoId,
    created_by: user.id,
    status: "active",
  });

  if (error) {
    console.error("[createLearnedRule]", error);
    redirect(
      `${redirectTo}?error=${encodeURIComponent(
        error.message || "Couldn't save the rule. Admins only.",
      )}`,
    );
  }

  revalidatePath("/team/rules");
  // /inspections so the next analyze call sees the new rule.
  revalidatePath("/inspections");
  redirect(redirectTo);
}

export async function editLearnedRule(formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "").trim();
  const ruleText = String(formData.get("rule_text") ?? "").trim();
  if (!ruleId || !ruleText) return;
  if (ruleText.length > 2000) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("learned_rules")
    .update({ rule_text: ruleText })
    .eq("id", ruleId);

  if (error) {
    console.error("[editLearnedRule]", error);
    redirect(
      `/team/rules?error=${encodeURIComponent(
        error.message || "Couldn't edit the rule",
      )}`,
    );
  }

  revalidatePath("/team/rules");
  revalidatePath("/inspections");
}

export async function archiveLearnedRule(formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("learned_rules")
    .update({ status: "archived" })
    .eq("id", ruleId);

  if (error) {
    console.error("[archiveLearnedRule]", error);
    redirect(
      `/team/rules?error=${encodeURIComponent(
        error.message || "Couldn't archive the rule",
      )}`,
    );
  }

  revalidatePath("/team/rules");
  revalidatePath("/inspections");
}

export async function unarchiveLearnedRule(formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("learned_rules")
    .update({ status: "active" })
    .eq("id", ruleId);

  revalidatePath("/team/rules");
  revalidatePath("/inspections");
}

export async function deleteLearnedRule(formData: FormData) {
  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("learned_rules").delete().eq("id", ruleId);

  revalidatePath("/team/rules");
  revalidatePath("/inspections");
}
