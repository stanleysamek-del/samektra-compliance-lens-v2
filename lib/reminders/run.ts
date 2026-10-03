import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assetPhase,
  daysPastDue,
  describeDue,
  groupByRecipient,
  maskEmail,
  schedulePhase,
} from "@/lib/reminders/logic";
import { sendReminderEmail, type ReminderRow } from "@/lib/email/send-reminder";

/**
 * Daily reminder sweep for scheduled inspections and equipment checks.
 * Called from the daily /api/cron/overdue job (alongside the corrective-
 * action reminders), so it adds no cron entry of its own.
 *
 * Recipients
 *   schedules  the person who created the schedule
 *   equipment  the facility's creator, plus the admins of its team when
 *              the facility belongs to one — one digest each, never one
 *              email per item
 *
 * `dry` builds exactly what would be sent but sends nothing, and masks the
 * addresses it reports — for checking the logic against real data safely.
 */

type Result = {
  schedulesScanned: number;
  scheduleEmails: number;
  assetsScanned: number;
  equipmentEmails: number;
  equipmentItems: number;
  skippedNoEmail: number;
  failed: number;
  preview?: Array<{ to: string; subject: string; items: number }>;
};

const MAX_EMAILS_PER_RUN = 200;

export async function runReminders(
  supabase: SupabaseClient,
  opts: { dry?: boolean; todayIso?: string } = {},
): Promise<Result> {
  const today = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const result: Result = {
    schedulesScanned: 0,
    scheduleEmails: 0,
    assetsScanned: 0,
    equipmentEmails: 0,
    equipmentItems: 0,
    skippedNoEmail: 0,
    failed: 0,
    ...(opts.dry ? { preview: [] } : {}),
  };
  let budget = MAX_EMAILS_PER_RUN;

  const emailCache = new Map<string, string | null>();
  async function emailOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const { data } = await supabase.auth.admin.getUserById(userId);
    const email = data?.user?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }

  async function deliver(
    to: string,
    email: Parameters<typeof sendReminderEmail>[0],
    count: number,
    counter: "scheduleEmails" | "equipmentEmails",
  ) {
    if (budget <= 0) return;
    budget -= 1;
    if (opts.dry) {
      result.preview!.push({ to: maskEmail(to), subject: email.subject, items: count });
      result[counter] += 1;
      return;
    }
    const res = await sendReminderEmail(email);
    if (res.ok) result[counter] += 1;
    else result.failed += 1;
  }

  // ---- Scheduled inspections --------------------------------------------
  try {
    // Anything due tomorrow or earlier; the phase function decides which
    // of those actually get a message today.
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const { data: schedules, error } = await supabase
      .from("inspection_schedules")
      .select("id, name, cadence, next_due, created_by, inspections!inner(facility_name)")
      .eq("enabled", true)
      .lte("next_due", tomorrow)
      .limit(1000);
    if (error) throw new Error(error.message);

    const entries: Array<{ email: string; item: ReminderRow }> = [];
    for (const s of (schedules ?? []) as unknown as Array<{
      id: string;
      name: string;
      cadence: string;
      next_due: string;
      created_by: string | null;
      inspections: { facility_name: string | null } | null;
    }>) {
      result.schedulesScanned += 1;
      const past = daysPastDue(today, s.next_due);
      const phase = schedulePhase(past);
      if (!phase) continue;
      const email = await emailOf(s.created_by);
      if (!email) {
        result.skippedNoEmail += 1;
        continue;
      }
      entries.push({
        email,
        item: {
          title: s.name,
          detail: `${s.inspections?.facility_name ?? "Your facility"} · ${s.cadence} · ${describeDue(past)}`,
          overdue: phase === "overdue",
          href: "/schedules",
        },
      });
    }

    for (const [to, rows] of groupByRecipient(entries)) {
      const overdue = rows.some((r) => r.overdue);
      await deliver(
        to,
        {
          to,
          subject:
            rows.length === 1
              ? `${overdue ? "Overdue" : "Due soon"}: ${rows[0].title}`
              : `${rows.length} scheduled inspections ${overdue ? "need attention" : "are due"}`,
          eyebrow: "Scheduled inspections",
          heading: overdue ? "Scheduled inspections need attention" : "Scheduled inspections are coming due",
          intro: "Open Schedules and tap Start to begin each round — the checklist and sections are copied from last time.",
          rows,
          ctaLabel: "Open Schedules",
          ctaHref: "/schedules",
        },
        rows.length,
        "scheduleEmails",
      );
    }
  } catch (err) {
    console.error("[reminders] schedules sweep failed:", err instanceof Error ? err.message : err);
  }

  // ---- Equipment checks --------------------------------------------------
  try {
    const weekOut = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, label, type, barcode, location_text, next_due_at, facilities!inner(name, organization_id, created_by)")
      .eq("status", "in_service")
      .not("next_due_at", "is", null)
      .lte("next_due_at", `${weekOut}T23:59:59Z`)
      .limit(2000);
    if (error) throw new Error(error.message);

    type AssetRow = {
      id: string;
      label: string | null;
      type: string;
      barcode: string | null;
      location_text: string | null;
      next_due_at: string;
      facilities: { name: string | null; organization_id: string | null; created_by: string | null } | null;
    };
    const rowsIn = (assets ?? []) as unknown as AssetRow[];
    result.assetsScanned = rowsIn.length;

    // Team admins, once per organization represented in the batch.
    const orgIds = Array.from(
      new Set(rowsIn.map((a) => a.facilities?.organization_id).filter((x): x is string => Boolean(x))),
    );
    const adminsByOrg = new Map<string, string[]>();
    if (orgIds.length > 0) {
      const { data: admins } = await supabase
        .from("organization_members")
        .select("organization_id, user_id")
        .in("organization_id", orgIds)
        .eq("role", "admin");
      for (const m of (admins ?? []) as Array<{ organization_id: string; user_id: string }>) {
        const list = adminsByOrg.get(m.organization_id) ?? [];
        list.push(m.user_id);
        adminsByOrg.set(m.organization_id, list);
      }
    }

    const entries: Array<{ email: string; item: ReminderRow }> = [];
    for (const a of rowsIn) {
      const past = daysPastDue(today, a.next_due_at);
      const phase = assetPhase(past);
      if (!phase) continue;
      const f = a.facilities;
      const userIds = new Set<string>();
      if (f?.created_by) userIds.add(f.created_by);
      for (const id of (f?.organization_id ? adminsByOrg.get(f.organization_id) : undefined) ?? []) userIds.add(id);

      let delivered = false;
      for (const uid of userIds) {
        const email = await emailOf(uid);
        if (!email) continue;
        delivered = true;
        entries.push({
          email,
          item: {
            title: a.label ?? a.barcode ?? a.type.replace(/_/g, " "),
            detail: `${f?.name ?? "—"}${a.location_text ? ` · ${a.location_text}` : ""} · ${describeDue(past)}`,
            overdue: phase === "overdue",
            href: `/assets/${a.id}`,
          },
        });
      }
      if (!delivered) result.skippedNoEmail += 1;
    }

    for (const [to, rows] of groupByRecipient(entries)) {
      const overdue = rows.filter((r) => r.overdue).length;
      const shown = rows.slice(0, 25);
      result.equipmentItems += rows.length;
      await deliver(
        to,
        {
          to,
          subject:
            overdue > 0
              ? `${overdue} equipment check${overdue === 1 ? " is" : "s are"} overdue (${rows.length} need attention)`
              : `${rows.length} equipment check${rows.length === 1 ? " is" : "s are"} coming due`,
          eyebrow: "Equipment checks",
          heading: "Equipment checks need attention",
          intro:
            rows.length > shown.length
              ? `Showing ${shown.length} of ${rows.length}. Open Equipment for the full list, scan a barcode to record a check.`
              : "Scan a barcode or open an item to record the check and set the next due date.",
          rows: shown,
          ctaLabel: "Open Equipment",
          ctaHref: "/assets",
        },
        rows.length,
        "equipmentEmails",
      );
    }
  } catch (err) {
    console.error("[reminders] equipment sweep failed:", err instanceof Error ? err.message : err);
  }

  return result;
}
