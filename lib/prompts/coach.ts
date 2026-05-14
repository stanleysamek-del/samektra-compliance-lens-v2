/**
 * "Coach the AI" — formatting helpers for the conversational re-analysis
 * thread on a single photo.
 *
 * The inspector adds hints one at a time. Each hint triggers a deep
 * re-analysis where the FULL conversation history (inspector hints + AI
 * acknowledgments) is fed back to Sonnet as authoritative ground truth.
 * The AI's natural-language acknowledgment for the new turn comes from
 * the `summary.text` field of the analysis response — no schema change.
 *
 * Phase 2 adds annotation_ref to inspector turns. Those refs are
 * formatted as "the inspector circled [bbox]" lines in the context.
 *
 * Phase 3 will extend ComplianceAnalysis with an optional
 * `requestClarification` field so the AI can ask a question back instead
 * of finalizing findings; this module exposes the slot now for forward-
 * compatibility but Phase 1 just renders `summary.text`.
 */

import { formatUserContext, type ContextAnswer } from "@/lib/prompts/compliance";

export type CoachTurn = {
  role: "inspector" | "ai";
  text: string;
  /** Phase 2: { x1, y1, x2, y2, color?, type? } */
  annotationRef?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    type?: string;
    color?: string | null;
  } | null;
};

/**
 * Render the full conversation history as one authoritative context block.
 * We piggyback on the existing INSPECTOR-PROVIDED CONTEXT machinery
 * (formatUserContext) so the system prompt's existing rules about
 * authoritative overrides still apply.
 *
 * We pack the whole thread into ONE ContextAnswer entry because the existing
 * formatter assumes Q/A pairs — here we encode the dialogue as the "answer"
 * to a synthetic "what has the inspector been telling you" question.
 */
export function formatCoachThread(
  turns: CoachTurn[],
  currentHintText: string,
  currentAnnotationRef?: CoachTurn["annotationRef"],
): ContextAnswer[] {
  if (turns.length === 0 && !currentHintText) return [];

  const lines: string[] = [];
  for (const t of turns) {
    if (t.role === "inspector") {
      lines.push(`INSPECTOR HINT: ${t.text}`);
      if (t.annotationRef) {
        const a = t.annotationRef;
        lines.push(
          `  (the inspector attached an annotation — ${a.type ?? "shape"} at normalized bbox x1=${a.x1.toFixed(3)} y1=${a.y1.toFixed(3)} x2=${a.x2.toFixed(3)} y2=${a.y2.toFixed(3)}${a.color ? `, color ${a.color}` : ""}. This shape has been burned onto the image you are looking at — focus your re-examination on this region.)`,
        );
      }
    } else {
      lines.push(`YOUR PRIOR RESPONSE: ${t.text}`);
    }
  }

  if (currentHintText) {
    lines.push(`NEW INSPECTOR HINT (most recent — this is what they want you to address now): ${currentHintText}`);
    if (currentAnnotationRef) {
      const a = currentAnnotationRef;
      lines.push(
        `  (attached annotation — ${a.type ?? "shape"} at normalized bbox x1=${a.x1.toFixed(3)} y1=${a.y1.toFixed(3)} x2=${a.x2.toFixed(3)} y2=${a.y2.toFixed(3)}${a.color ? `, color ${a.color}` : ""}; this shape is burned onto the image)`,
      );
    }
  }

  const conversation = lines.join("\n");

  return [
    {
      question:
        "INSPECTOR-AI COACHING THREAD (treat the whole dialogue below as authoritative — the inspector is teaching you what to see in this photo; their hints OVERRIDE any default assumption you would make from the image alone)",
      answer: conversation,
    },
  ];
}

/**
 * Optional: when the thread grows past N turns we'll summarize older turns
 * into a single "earlier conversation summary" line to keep tokens bounded.
 * Phase 1 doesn't call this yet — we'll wire it in once we see real-world
 * thread lengths. Reserved here so the route can plug it in later.
 */
export function summarizeOlderTurns(turns: CoachTurn[]): string {
  // Placeholder — wire in once we hit the 10-turn ceiling in practice.
  return turns
    .map((t, i) => `${i + 1}. ${t.role === "inspector" ? "Inspector" : "AI"}: ${truncate(t.text, 160)}`)
    .join(" | ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Re-export so the API route doesn't need to import from two places.
 * formatUserContext takes the ContextAnswer[] we built above and produces
 * the final prompt-section string the analyzer prepends to its user query.
 */
export { formatUserContext };
