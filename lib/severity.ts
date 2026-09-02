/**
 * ONE severity palette for the whole app. Previously four components each
 * carried their own (and photo-editor rendered Medium identical to High).
 * `fg` is the ink/stroke color, `bg` the tinted fill, `letter` a
 * non-color cue for overlays and badges.
 */
export type Severity = "Low" | "Medium" | "High";

export const SEVERITY_ORDER: Severity[] = ["High", "Medium", "Low"];

export function severityColor(s: Severity | string | null | undefined): {
  fg: string;
  bg: string;
  letter: "H" | "M" | "L";
} {
  if (s === "High") return { fg: "#a8362b", bg: "rgba(168,54,43,0.10)", letter: "H" };
  if (s === "Medium") return { fg: "#b8762a", bg: "rgba(184,118,42,0.10)", letter: "M" };
  return { fg: "#607a3a", bg: "rgba(96,122,58,0.10)", letter: "L" };
}
