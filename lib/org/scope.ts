/**
 * Restrict an inspections query to the workspace chosen in the org
 * switcher — the same rule the campus dashboard uses:
 *
 *   team workspace     → inspections with that organization_id
 *   personal workspace → the user's own inspections with no organization
 *
 * RLS alone would mix every workspace the user can read into one list.
 * Pass `prefix` "inspections." when filtering photos/findings through an
 * `inspections!inner(organization_id, created_by)` embed.
 */
type Filterable = {
  eq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
};

// PostgREST builder types are too deep to constrain generically (TS2589),
// so accept any builder and hand the same type back.
export function scopeToWorkspace<T>(
  query: T,
  orgId: string | null,
  userId: string,
  prefix = "",
): T {
  const q = query as unknown as Filterable;
  const scoped = orgId
    ? q.eq(`${prefix}organization_id`, orgId)
    : q.is(`${prefix}organization_id`, null).eq(`${prefix}created_by`, userId);
  return scoped as unknown as T;
}
