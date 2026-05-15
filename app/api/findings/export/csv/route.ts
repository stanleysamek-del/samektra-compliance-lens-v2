import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/findings/export/csv
 *
 * Streams a CSV export of every finding the current user can see, with the
 * same severity / category / rating filters as the /findings dashboard
 * (passed through the query string). Joined with the parent inspection so
 * each row carries facility + date for downstream pivot tables.
 *
 * Columns:
 *   Severity, Category, Code, Title, Description, Location, Remediation,
 *   Confidence (AI), Rating (👍 / 👎 / -), Created At, Facility, Inspection ID
 *
 * No size cap beyond what Supabase returns by default (RLS-scoped, so a
 * lone inspector typically won't exceed a few thousand findings).
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
  const severity = url.searchParams.get("severity");
  const category = url.searchParams.get("category");
  const rating = url.searchParams.get("rating");

  let q = supabase
    .from("findings")
    .select(
      "id, inspection_id, title, category, code, severity, description, location, remediation, ai_confidence, user_rating, created_at, inspections!inner(facility_name, date_of_inspection)",
    )
    .order("created_at", { ascending: false });

  if (severity === "High" || severity === "Medium" || severity === "Low") {
    q = q.eq("severity", severity);
  }
  if (category) q = q.eq("category", category);
  if (rating === "up") q = q.eq("user_rating", 1);
  else if (rating === "down") q = q.eq("user_rating", -1);
  else if (rating === "unrated") q = q.is("user_rating", null);

  const { data, error } = await q;
  if (error) {
    return new Response(`Query failed: ${error.message}`, { status: 500 });
  }

  type Row = {
    inspection_id: string;
    title: string;
    category: string;
    code: string | null;
    severity: string;
    description: string | null;
    location: string | null;
    remediation: string | null;
    ai_confidence: number | null;
    user_rating: number | null;
    created_at: string;
    inspections: { facility_name: string | null; date_of_inspection: string | null } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const headers = [
    "Severity",
    "Category",
    "Code",
    "Title",
    "Description",
    "Location",
    "Remediation",
    "AI Confidence",
    "Rating",
    "Created At",
    "Facility",
    "Inspection Date",
    "Inspection ID",
  ];

  const escape = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    // Quote when the value contains comma, quote, newline, or leading space.
    if (/[",\n\r]/.test(s) || /^\s/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvLines: string[] = [];
  csvLines.push(headers.map(escape).join(","));
  for (const r of rows) {
    const rating =
      r.user_rating === 1 ? "👍" : r.user_rating === -1 ? "👎" : "—";
    const confidence =
      typeof r.ai_confidence === "number"
        ? `${Math.round(r.ai_confidence * 100)}%`
        : "";
    csvLines.push(
      [
        r.severity,
        r.category,
        r.code ?? "",
        r.title,
        r.description ?? "",
        r.location ?? "",
        r.remediation ?? "",
        confidence,
        rating,
        new Date(r.created_at).toISOString().slice(0, 10),
        r.inspections?.facility_name ?? "",
        r.inspections?.date_of_inspection ?? "",
        r.inspection_id,
      ]
        .map(escape)
        .join(","),
    );
  }
  // BOM so Excel/Numbers picks up UTF-8 cleanly.
  const body = "﻿" + csvLines.join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `compliance-lens-findings-${today}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
