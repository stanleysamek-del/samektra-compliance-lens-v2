import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendActionEmail } from "@/lib/email/send-action-notification";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * Daily corrective-action digest cron (vercel.json schedules it).
 *
 * Two sweeps over active actions (open / in_progress) with a due date:
 *   - due TOMORROW  → heads-up email to the assignee
 *   - overdue       → nudge, on an escalating cadence (1, 3, 7, 14, 30
 *     days past due, then monthly) so a stale action doesn't generate
 *     an email every single morning forever. The cadence is stateless —
 *     computed from the date gap — so no bookkeeping table is needed.
 *
 * Auth (lib/cron-auth.ts): when CRON_SECRET is set, Vercel sends it as a
 * Bearer token on cron invocations and we require it (constant-time
 * compare); unset in local dev the route runs open — it only sends
 * emails, and only if Resend is also configured; unset in production it
 * refuses with 500.
 *
 * Assignees are emailed at assigned_email (set on every assignment,
 * member or not — assignAction resolves member emails at assign time),
 * with auth.admin lookup as the fallback for member-assigned rows that
 * predate that behavior.
 */

export const dynamic = "force-dynamic";

const NUDGE_DAYS = new Set([1, 3, 7, 14, 30]);

function shouldNudge(daysPast: number): boolean {
  if (daysPast <= 0) return false;
  if (NUDGE_DAYS.has(daysPast)) return true;
  return daysPast > 30 && daysPast % 30 === 0;
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    console.warn("[cron/overdue] SUPABASE_SERVICE_ROLE_KEY not set — skipping.");
    return NextResponse.json({ ok: true, skipped: "no service key" });
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("findings")
    .select(
      "id, inspection_id, photo_id, title, severity, cap_status, cap_target_date, assigned_to, assigned_email, inspections!inner(facility_name)",
    )
    .in("cap_status", ["open", "in_progress"])
    .not("cap_target_date", "is", null)
    .lte("cap_target_date", iso(tomorrow))
    .limit(500);

  if (error) {
    console.error("[cron/overdue] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sentDueSoon = 0;
  let sentOverdue = 0;
  let skippedNoEmail = 0;

  for (const row of (data ?? []) as unknown as Array<{
    id: string;
    inspection_id: string;
    photo_id: string | null;
    title: string;
    severity: string;
    cap_target_date: string;
    assigned_to: string | null;
    assigned_email: string | null;
    inspections: { facility_name: string } | null;
  }>) {
    // Resolve the recipient. assigned_email is authoritative; fall back
    // to an auth.admin lookup for member assignments missing it.
    let email = row.assigned_email;
    if (!email && row.assigned_to) {
      const { data: u } = await supabase.auth.admin.getUserById(row.assigned_to);
      email = u?.user?.email ?? null;
    }
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    const due = row.cap_target_date;
    const daysPast = Math.floor(
      (Date.parse(iso(today)) - Date.parse(due)) / (24 * 60 * 60 * 1000),
    );

    const kind =
      daysPast < 0 ? ("assigned" as const) : ("overdue" as const);
    // daysPast === -1 → due tomorrow (heads-up). daysPast >= 1 → nudge
    // on cadence. daysPast === 0 (due today) stays quiet — the heads-up
    // already went out yesterday.
    if (daysPast === -1) {
      await sendActionEmail({
        kind,
        toEmail: email,
        findingTitle: row.title,
        severity: row.severity,
        facilityName: row.inspections?.facility_name ?? "your facility",
        dueDate: due,
        actorName: "Compliance Lens",
        inspectionId: row.inspection_id,
        photoId: row.photo_id,
        findingId: row.id,
      });
      sentDueSoon += 1;
    } else if (shouldNudge(daysPast)) {
      await sendActionEmail({
        kind: "overdue",
        toEmail: email,
        findingTitle: row.title,
        severity: row.severity,
        facilityName: row.inspections?.facility_name ?? "your facility",
        dueDate: due,
        actorName: "Compliance Lens",
        inspectionId: row.inspection_id,
        photoId: row.photo_id,
        findingId: row.id,
      });
      sentOverdue += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: data?.length ?? 0,
    sentDueSoon,
    sentOverdue,
    skippedNoEmail,
  });
}
