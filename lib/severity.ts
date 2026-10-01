/**
 * ONE severity palette for the whole app. Previously four components each
 * carried their own (and photo-editor rendered Medium identical to High).
 *
 *   fg      text / stroke color — ≥ 4.5:1 on white and on light paper
 *   bg      tinted fill for low-emphasis rows (fg still passes on it)
 *   solid   high-emphasis fill for badges — readable in glare
 *   onSolid text color on `solid`
 *   letter  + glyph: non-color cues, so severity never relies on hue alone
 *           (color-blind inspectors, washed-out screens outdoors)
 */
export type Severity = "Low" | "Medium" | "High";

export const SEVERITY_ORDER: Severity[] = ["High", "Medium", "Low"];

export type SeverityStyle = {
  fg: string;
  bg: string;
  solid: string;
  onSolid: string;
  letter: "H" | "M" | "L";
  glyph: "▲" | "◆" | "●";
};

export function severityColor(s: Severity | string | null | undefined): SeverityStyle {
  if (s === "High") {
    return { fg: "#b42318", bg: "#fdecea", solid: "#b42318", onSolid: "#ffffff", letter: "H", glyph: "▲" };
  }
  if (s === "Medium") {
    return { fg: "#8a5300", bg: "#fdf3dc", solid: "#e0a526", onSolid: "#0f1518", letter: "M", glyph: "◆" };
  }
  return { fg: "#2f6b2f", bg: "#e8f1e4", solid: "#2f6b2f", onSolid: "#ffffff", letter: "L", glyph: "●" };
}
