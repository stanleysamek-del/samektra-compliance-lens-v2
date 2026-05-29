"use client";

import { useEffect } from "react";

// Key written by LoginForm when the user signs in without "remember me".
const SESSION_ONLY_KEY = "cl_session_only";

/**
 * Mounts invisibly in the app-shell. If the user signed in without
 * "remember me", a beforeunload listener fires navigator.sendBeacon to
 * /auth/sign-out-beacon, clearing the Supabase session cookie before
 * sessionStorage (and its flag) are discarded by the browser.
 */
export function SessionGuard() {
  useEffect(() => {
    function onUnload() {
      if (sessionStorage.getItem(SESSION_ONLY_KEY)) {
        navigator.sendBeacon("/auth/sign-out-beacon");
      }
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return null;
}
