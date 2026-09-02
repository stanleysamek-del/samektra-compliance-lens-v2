"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithRetry } from "@/lib/retry";
import { showToast } from "@/components/toaster";
import { REANALYZE_CONFIRM } from "@/components/reanalyze-button";

// Centralized retry config for this flow — all three call paths
// (deep-questions, reanalyze, reanalyze-with-observation) hit the
// AI which can blip with 502/504 under load.
const RETRY_OPTS = {
  retries: 2,
  backoffMs: 1500,
} as const;

type Question = {
  id: string;
  question: string;
  rationale?: string;
  options?: string[];
  type: "single" | "free";
};

type Stage =
  | { kind: "idle" }
  | { kind: "fetching-questions" }
  | { kind: "answering"; questions: Question[]; answers: Record<string, string> }
  | { kind: "analyzing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

type Props = {
  photoId: string;
};

const OBSERVATION_PROMPT =
  "INSPECTOR OBSERVATION — what the inspector saw on site that you may have missed or under-rated. Treat this as authoritative ground truth and incorporate into your findings.";

/**
 * Two-pass deep analysis UX.
 *
 * Pass 1: the deeper model looks at the photo and produces 3-6 clarifying
 * questions. The inspector picks answers (or "Unsure"). Pass 2: it
 * re-analyzes with the answers as authoritative context.
 *
 * "Skip questions" fires the deep pass with no inspector context; "I saw
 * something the AI missed" sends the inspector's own observation as ground
 * truth. All three paths funnel through runReanalyze, which owns the ONE
 * confirmation gate — so the wording is identical everywhere and the
 * replace-findings warning can't be bypassed.
 *
 * The observation text lives here (not in the idle panel) so it survives
 * the analyzing → error transition and is still there after "Try again".
 */
export function DeepReanalyzeFlow({ photoId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [observation, setObservation] = useState("");
  const [showObservation, setShowObservation] = useState(false);

  async function startWithQuestions() {
    setStage({ kind: "fetching-questions" });
    try {
      const res = await fetchWithRetry(
        `/api/photos/${photoId}/deep-questions`,
        { method: "POST" },
        {
          ...RETRY_OPTS,
          onAttempt: (attempt, reason) =>
            console.warn(`[deep-questions] retry ${attempt} (${reason})`),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        questions?: Question[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        fail(json.error ?? `Could not generate questions (HTTP ${res.status})`);
        return;
      }
      const questions = json.questions ?? [];
      if (questions.length === 0) {
        // No questions needed — go straight to deep analysis with no context.
        await runReanalyze({ answers: {}, questions: [] });
        return;
      }
      setStage({ kind: "answering", questions, answers: {} });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Network error");
    }
  }

  function fail(message: string) {
    setStage({ kind: "error", message });
    showToast({ kind: "error", message });
  }

  /**
   * The single re-analysis entry point. Confirms ONCE (same wording as the
   * standalone re-analyze button), then posts the deep pass with whatever
   * context the caller supplied: answered questions, the inspector's own
   * observation, or nothing.
   */
  async function runReanalyze(input: {
    answers: Record<string, string>;
    questions: Question[];
    observation?: string;
  }) {
    if (!window.confirm(REANALYZE_CONFIRM)) return;

    setStage({ kind: "analyzing" });

    const payload = input.questions
      .map((q) => ({
        question: q.question,
        answer: (input.answers[q.id] ?? "").trim(),
      }))
      .filter((qa) => qa.answer.length > 0);

    const obs = (input.observation ?? "").trim();
    if (obs) payload.push({ question: OBSERVATION_PROMPT, answer: obs });

    try {
      const res = await fetchWithRetry(
        `/api/photos/${photoId}/reanalyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: "deep", answers: payload }),
        },
        {
          ...RETRY_OPTS,
          onAttempt: (attempt, reason) =>
            console.warn(`[reanalyze] retry ${attempt} (${reason})`),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        fail(json.error ?? `Re-analysis failed (HTTP ${res.status})`);
        return;
      }
      setStage({ kind: "done" });
      // The observation was consumed — clear it only now that it landed.
      if (obs) {
        setObservation("");
        setShowObservation(false);
      }
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Network error");
    }
  }

  /* -------------------- render -------------------- */

  if (stage.kind === "idle") {
    return (
      <IdlePanel
        onWithQuestions={startWithQuestions}
        onSkip={() => runReanalyze({ answers: {}, questions: [] })}
        onCustom={() =>
          runReanalyze({ answers: {}, questions: [], observation })
        }
        observation={observation}
        onObservationChange={setObservation}
        showObservation={showObservation}
        onToggleObservation={() => setShowObservation((v) => !v)}
        onCancelObservation={() => {
          setShowObservation(false);
          setObservation("");
        }}
      />
    );
  }

  if (stage.kind === "fetching-questions") {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
        <Spinner /> Reading the photo and figuring out what to ask…
      </div>
    );
  }

  if (stage.kind === "answering") {
    const allAnswered = stage.questions.every(
      (q) => (stage.answers[q.id] ?? "").trim().length > 0,
    );
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--fg-muted)]">
          A few clarifying questions before the deep analysis. Pick &ldquo;Unsure&rdquo;
          if you can&apos;t verify on site — the AI will note the assumption.
        </p>
        <ul className="flex flex-col gap-3">
          {stage.questions.map((q, idx) => (
            <li
              key={q.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3"
            >
              <p className="text-sm font-medium text-[var(--fg)]">
                <span className="text-[var(--fg-subtle)]">{idx + 1}.</span>{" "}
                {q.question}
              </p>
              {q.rationale ? (
                <p className="mt-1 text-[11px] italic text-[var(--fg-subtle)]">
                  {q.rationale}
                </p>
              ) : null}
              {q.type === "single" && q.options && q.options.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((opt) => {
                    const selected = stage.answers[q.id] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setStage((prev) =>
                            prev.kind === "answering"
                              ? {
                                  ...prev,
                                  answers: { ...prev.answers, [q.id]: opt },
                                }
                              : prev,
                          )
                        }
                        className={[
                          "min-h-[40px] rounded-full border px-2.5 py-1 text-xs font-medium transition sm:min-h-0",
                          selected
                            ? "border-[var(--primary)] bg-[var(--primary)] text-[#0a0d12]"
                            : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]",
                        ].join(" ")}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={stage.answers[q.id] ?? ""}
                  onChange={(e) =>
                    setStage((prev) =>
                      prev.kind === "answering"
                        ? {
                            ...prev,
                            answers: { ...prev.answers, [q.id]: e.target.value },
                          }
                        : prev,
                    )
                  }
                  placeholder="Type an answer or 'Unsure'"
                  className="cl-input mt-2"
                />
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setStage({ kind: "idle" })}
            className="cl-btn-outline w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!allAnswered}
            onClick={() =>
              runReanalyze({ answers: stage.answers, questions: stage.questions })
            }
            className="cl-btn-accent w-full sm:w-auto"
          >
            Run deep analysis
          </button>
        </div>
      </div>
    );
  }

  if (stage.kind === "analyzing") {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
        <Spinner /> Re-analyzing with the deeper model
        {observation.trim() ? " using your observation…" : "…"}
      </div>
    );
  }

  if (stage.kind === "done") {
    return (
      <p className="text-sm text-[var(--primary)]">
        Done. Findings have been refreshed.
      </p>
    );
  }

  // error — "Try again" returns to the idle panel with the observation
  // (if any) still filled in and open.
  return (
    <div className="flex flex-col gap-2">
      <p
        role="alert"
        className="rounded-lg border px-3 py-2 text-xs"
        style={{
          borderColor: "rgba(168,54,43,0.4)",
          background: "rgba(168,54,43,0.08)",
          color: "#a8362b",
        }}
      >
        {stage.message}
        {observation.trim()
          ? " Your observation is saved — tap Try again to send it again."
          : ""}
      </p>
      <button
        type="button"
        onClick={() => {
          if (observation.trim()) setShowObservation(true);
          setStage({ kind: "idle" });
        }}
        className="cl-btn-outline w-full sm:w-auto"
      >
        Try again
      </button>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="rgba(148,163,184,0.25)" strokeWidth="2.4" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- Subcomponents ---------- */

function IdlePanel({
  onWithQuestions,
  onSkip,
  onCustom,
  observation,
  onObservationChange,
  showObservation,
  onToggleObservation,
  onCancelObservation,
}: {
  onWithQuestions: () => void;
  onSkip: () => void;
  onCustom: () => void;
  observation: string;
  onObservationChange: (v: string) => void;
  showObservation: boolean;
  onToggleObservation: () => void;
  onCancelObservation: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onWithQuestions}
          className="cl-btn-accent w-full sm:w-auto"
        >
          <SparkIcon /> Deep analyze (with questions)
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="cl-btn-outline w-full sm:w-auto"
        >
          Skip questions
        </button>
        <button
          type="button"
          onClick={onToggleObservation}
          className="cl-btn-outline w-full sm:w-auto"
          aria-expanded={showObservation}
        >
          {showObservation ? "Hide observation" : "I saw something the AI missed"}
        </button>
      </div>

      {showObservation ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <label
            htmlFor="custom-observation"
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
          >
            What did you observe on site?
          </label>
          <textarea
            id="custom-observation"
            value={observation}
            onChange={(e) => onObservationChange(e.target.value)}
            placeholder="e.g., 'There's an unsealed penetration around the MC cable behind the plastic sheeting — the wall is rated 1-hour. Also, the door has a Williamsburg Hardware self-closer that's missing the door coordinator.'"
            rows={4}
            className="cl-input min-h-[88px] resize-y py-2.5 text-sm"
          />
          <p className="text-[11px] text-[var(--fg-subtle)]">
            Describe what you saw that the AI may have missed or under-rated.
            This will be sent to the deeper model as authoritative ground truth
            alongside the photo. Your custom findings and edits are preserved.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancelObservation}
              className="cl-btn-outline"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={observation.trim().length === 0}
              onClick={onCustom}
              className="cl-btn-accent"
            >
              Re-analyze with my observation
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
