import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Called by navigator.sendBeacon() from SessionGuard when the user signed in
// without "remember me" and is closing the tab. Clears the Supabase session
// cookie server-side. Returns 204 (sendBeacon ignores the response body).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Best-effort — if this fails the cookie expires naturally.
  }
  return new NextResponse(null, { status: 204 });
}
