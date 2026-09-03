import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/plans/[id]/image — signed-URL proxy for a plan page image.
 *
 * Lets a plain `<img src="/api/plans/<id>/image">` work from any client
 * component without minting signed URLs in the browser. RLS on
 * facility_plans decides who can see the plan; the storage policy on
 * the `drawings` bucket follows the same facility. 302 to a 60-minute
 * signed URL; the redirect itself is cacheable for 5 minutes per user.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data: plan, error } = await supabase
    .from("facility_plans")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !plan) {
    return NextResponse.json({ ok: false, error: "Plan not found" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("drawings")
    .createSignedUrl(plan.storage_path as string, 60 * 60);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signErr?.message ?? "Could not sign the plan image" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
