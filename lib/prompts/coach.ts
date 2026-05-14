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
export type RatedFinding = {
  title: string;
  severity: "Low" | "Medium" | "High";
  rating: 1 | -1;
};

export function formatCoachThread(
  turns: CoachTurn[],
  currentHintText: string,
  currentAnnotationRef?: CoachTurn["annotationRef"],
  ratedFindings: RatedFinding[] = [],
): ContextAnswer[] {
  if (turns.length === 0 && !currentHintText && ratedFindings.length === 0) {
    return [];
  }

  const result: ContextAnswer[] = [];

  // Block 1: thumbs feedback on prior findings — extremely high signal.
  if (ratedFindings.length > 0) {
    const liked = ratedFindings.filter((f) => f.rating === 1);
    const disliked = ratedFindings.filter((f) => f.rating === -1);
    const feedbackLines: string[] = [];
    if (liked.length > 0) {
      feedbackLines.push(
        "THUMBS-UP (the inspector confirmed these were correct calls — keep finding things like this; do NOT remove these from your output if the underlying condition is still visible):",
      );
      liked.forEach((f, i) =>
        feedbackLines.push(`  ${i + 1}. [${f.severity}] ${f.title}`),
      );
    }
    if (disliked.length > 0) {
      feedbackLines.push(
        "THUMBS-DOWN (the inspector marked these as INCORRECT — do NOT re-emit these findings or anything substantively equivalent; the inspector knows the site context and is overruling your prior call):",
      );
      disliked.forEach((f, i) =>
        feedbackLines.push(`  ${i + 1}. [${f.severity}] ${f.title}`),
      );
    }
    result.push({
      question:
        "INSPECTOR FEEDBACK ON YOUR PRIOR FINDINGS (treat as authoritative — the inspector has rated each call as correct or incorrect):",
      answer: feedbackLines.join("\n"),
    });
  }

  // Block 2: the conversation itself.
  if (turns.length > 0 || currentHintText) {
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

    result.push({
      question:
        "INSPECTOR-AI COACHING THREAD (treat the whole dialogue below as authoritative — the inspector is teaching you what to see in this photo; their hints OVERRIDE any default assumption you would make from the image alone)",
      answer: lines.join("\n"),
    });

    // Final instruction: shape the AI's response so it FEELS like a reply.
    // The summary.text field already exists in the schema and is rendered
    // as the AI bubble in the conversation — we just tell the model to use
    // it conversationally on coach turns instead of describing the whole
    // photo. This doesn't change the JSON shape, just the tone of one field.
    result.push({
      question:
        "RESPONSE STYLE FOR THIS COACH TURN (applies to the `summary.text` field of your JSON response only — leave the other fields in their normal format):",
      answer: [
        "Start `summary.text` with a one-sentence acknowledgment of the inspector's most recent hint, in first person and conversational tone. Examples:",
        "  - \"Got it — I missed the pendant sprinkler in the upper-right. Re-examining now: yes, the deflector sits ~28 in below the deck, which exceeds NFPA 13 §10.2.6.\"",
        "  - \"Understood, the wall is 1-hour rated. That promotes the unsealed MC-cable penetration from Medium-conditional to High per NFPA 101 §8.3.5.1.\"",
        "  - \"You're right that finding was wrong — dropping it. I had read the gauge needle as deep recharge but on closer look it's borderline green/recharge.\"",
        "After the acknowledgment, add 1-2 sentences summarizing what changed (e.g., 'Added one High and one Low. Removed the earlier Medium dry-pipe call you thumbs-down'd.'). Keep it under 5 sentences total. Avoid restating the entire photo description — the inspector already knows what's in the photo.",
        "If the inspector's hint contradicts a thumbs-up'd finding from earlier in the thread, the inspector's NEW hint wins — explain the change briefly.",
        "If the inspector's hint contradicts a thumbs-down'd finding (they're un-doing their downvote), keep the finding but say so.",
      ].join("\n"),
    });
  }

  return result;
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
