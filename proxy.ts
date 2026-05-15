import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`. The
 * export name changes too (`middleware` → `proxy`), but the function
 * signature is identical. We keep the helper in lib/supabase/middleware.ts
 * so the rename here doesn't ripple through everywhere.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
