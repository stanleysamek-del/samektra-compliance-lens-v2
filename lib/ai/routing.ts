import type { ComplianceAnalysis } from "@/lib/prompts/types";
export function escalationReason(analysis: ComplianceAnalysis): string | null {
  if (analysis.summary.imageQuality !== "clear") return null;
  if (analysis.summary.confidence < 0.65)
    return "The first pass could not make a confident assessment.";
  if (
    analysis.violations.some(
      (v) => v.severity === "High" && v.confidence < 0.85,
    )
  )
    return "A potentially serious finding needs a stronger review.";
  return null;
}
