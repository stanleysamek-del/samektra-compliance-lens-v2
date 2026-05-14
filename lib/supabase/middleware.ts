import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);

/**
 * Hard cap on the Supabase auth call inside the middleware. If Supabase is
 * unreachable / slow, we fail OPEN (let the request through with no user
 * context) so the entire site doesn't 504 with MIDDLEWARE_INVOCATION_TIMEOUT.
 * Server components and API routes do their own auth check; this middleware
 * only handles the redirect-to-login shortcut.
 */
const SUPABASE_AUTH_TIMEOUT_MS = 3000;

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/auth");
  const isApiRoute = path.startsWith("/api");
  const isPublic = PUBLIC_PATHS.has(path) || isAuthRoute;

  // Fast path: public pages and API routes don't need a session refresh in
  // the middleware. API routes auth themselves; the public marketing
  // pages don't need any auth at all. Skipping Supabase here keeps the
  // middleware response near-instant for the homepage and asset-like calls.
  if (isPublic || isApiRoute) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Race the auth check against a 3s timeout. If Supabase is slow, fail
  // open — the destination page's server component will perform its own
  // auth check and redirect if needed. We just lose the early redirect.
  let user: { id: string } | null = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("supabase-auth-timeout")),
          SUPABASE_AUTH_TIMEOUT_MS,
        ),
      ),
    ]);
    user = result.data.user ?? null;
  } catch (err) {
    console.warn(
      "[middleware] Supabase auth check failed, failing open:",
      err instanceof Error ? err.message : err,
    );
    // Let the request through — page-level auth will handle it.
    return supabaseResponse;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
