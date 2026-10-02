"use client";

import { useEffect, useState } from "react";

/**
 * The current workspace as the browser sees it (GET /api/team/context),
 * shared by everything in the shell — the org switcher and the
 * role-aware Start inspection buttons — so it's fetched once per page
 * load, not once per component.
 */

export type WorkspaceRole = "admin" | "member" | "viewer";
export type WorkspaceContext = {
  current: { id: string; name: string; role: WorkspaceRole } | null;
  all: Array<{ id: string; name: string; role: WorkspaceRole }>;
};

let pending: Promise<WorkspaceContext | null> | null = null;

function load(): Promise<WorkspaceContext | null> {
  pending ??= fetch("/api/team/context")
    .then((r) => (r.ok ? (r.json() as Promise<WorkspaceContext>) : null))
    .catch(() => null)
    .finally(() => {
      // Allow a fresh fetch on the next navigation that remounts the shell
      // (workspace switches reload the page anyway).
      setTimeout(() => {
        pending = null;
      }, 5_000);
    });
  return pending;
}

export function useWorkspace(): WorkspaceContext | null {
  const [ctx, setCtx] = useState<WorkspaceContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then((data) => {
      if (!cancelled && data) setCtx(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ctx;
}

/**
 * false only once we KNOW the user is a viewer in the current team
 * workspace; while loading, create buttons stay visible (the common case)
 * and the server still refuses a viewer's write.
 */
export function useCanCreate(): boolean {
  const ctx = useWorkspace();
  return ctx?.current?.role !== "viewer";
}
