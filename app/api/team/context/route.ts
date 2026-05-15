import { NextResponse } from "next/server";
import { getCurrentOrg, listMyOrganizations } from "@/lib/org/current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/team/context
 *
 * Lightweight endpoint the AppShell's OrgSwitcher hits after mounting to
 * find out which workspace the user is in (and which others they could
 * switch to). Cached on the response with no-store so org-membership
 * changes show up immediately without a hard refresh.
 */
export async function GET() {
  const [current, all] = await Promise.all([
    getCurrentOrg(),
    listMyOrganizations(),
  ]);
  return NextResponse.json(
    { current, all },
    { headers: { "Cache-Control": "no-store" } },
  );
}
