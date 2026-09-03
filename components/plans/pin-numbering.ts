/**
 * ONE rule for "finding #N" on plans, in the pin list, and on the PDF's
 * Plan-markup page: findings are numbered across the whole inspection in
 * the order they were created (photo upload order, then AI/inspector
 * order within a photo). The per-photo "#1, #2" badges on the photo page
 * are a different, photo-local numbering — the plan needs a single
 * inspection-wide sequence so a pin labelled 7 means the same thing on
 * every plan and on the printed report.
 */
export function numberFindings<T extends { id: string; created_at?: string | null }>(
  findings: T[],
): Map<string, number> {
  const sorted = findings
    .slice()
    .sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
  const map = new Map<string, number>();
  sorted.forEach((f, i) => map.set(f.id, i + 1));
  return map;
}
