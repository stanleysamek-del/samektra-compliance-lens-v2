import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/actions/export/csv
 *
 * CSV export of the corrective-actions board — same filters as /actions
 * (status / priority / who / overdue via the query string) so the file
 * matches what the user is looking at. Mirrors /api/findings/export/csv.
 *
 * Columns:
 *   Status, Priority, Severity, Category, Code, Title, Facility, Due Date,
 *   Overdue, Assigned To, Closed At, Created At, Inspection ID, Finding ID
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Not signed in", { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const who = url.searchParams.get("who");
  const overdue = url.searchParams.get("overdue");
  const today = new Date().toISOString().slice(0, 10);

  const STATUSES = ["open", "in_progress", "done", "verified", "wont_fix"];
  const PRIORITIES = ["high", "medium", "low"];

  let q = supabase
    .from("findings")
    .select(
      "id, inspection_id, title, category, code, severity, cap_status, priority, cap_target_date, assigned_email, action_closed_at, created_at, inspections!inner(facility_name)",
    )
    .order("cap_target_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  if (status === "active") {
    q = q.in("cap_status", ["open", "in_progress", "done"]);
  } else if (status && STATUSES.includes(status)) {
    q = q.eq("cap_status", status);
  }
  if (priority && PRIORITIES.includes(priority)) q = q.eq("priority", priority);
  if (who === "me") q = q.eq("assigned_to", user.id);
  if (overdue === "1") {
    q = q.lt("cap_target_date", today).in("cap_status", ["open", "in_progress"]);
  }

  const { data, error } = await q;
  if (error) {
    return new Response(`Query failed: ${error.message}`, { status: 500 });
  }

  type Row = {
    id: string;
    inspection_id: string;
    title: string;
    category: string;
    code: string | null;
    severity: string;
    cap_status: string | null;
    priority: string | null;
    cap_target_date: string | null;
    assigned_email: string | null;
    action_closed_at: string | null;
    created_at: string;
    inspections: { facility_name: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const STATUS_LABEL: Record<string, string> = {
    open: "Open",
    in_progress: "In progress",
    done: "Done — awaiting verify",
    verified: "Verified",
    wont_fix: "Won't fix",
  };

  const headers = [
    "Status",
    "Priority",
    "Severity",
    "Category",
    "Code",
    "Title",
    "Facility",
    "Due Date",
    "Overdue",
    "Assigned To",
    "Closed At",
    "Created At",
    "Inspection ID",
    "Finding ID",
  ];

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n\r]/.test(s) || /^\s/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvLines: string[] = [];
  csvLines.push(headers.map(escape).join(","));
  for (const r of rows) {
    const st = r.cap_status ?? "open";
    const isOverdue =
      Boolean(r.cap_target_date) &&
      (r.cap_target_date as string) < today &&
      (st === "open" || st === "in_progress");
    csvLines.push(
      [
        STATUS_LABEL[st] ?? st,
        r.priority ?? "medium",
        r.severity,
        r.category,
        r.code ?? "",
        r.title,
        r.inspections?.facility_name ?? "",
        r.cap_target_date ?? "",
        isOverdue ? "Yes" : "",
        r.assigned_email ?? "",
        r.action_closed_at ? new Date(r.action_closed_at).toISOString().slice(0, 10) : "",
        new Date(r.created_at).toISOString().slice(0, 10),
        r.inspection_id,
        r.id,
      ]
        .map(escape)
        .join(","),
    );
  }
  // BOM so Excel/Numbers picks up UTF-8 cleanly.
  const body = "﻿" + csvLines.join("\r\n");

  const filename = `compliance-lens-actions-${today}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
