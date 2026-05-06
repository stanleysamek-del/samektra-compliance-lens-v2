"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  | { kind: "analyzing"; answers: Record<string, string>; questions: Question[] }
  | { kind: "done" }
  | { kind: "error"; message: string };

type Props = {
  photoId: string;
};

/**
 * Two-pass deep analysis UX.
 *
 * Pass 1: Sonnet looks at the photo and produces 3-6 clarifying questions.
 * The inspector picks answers (or "Unsure"). Pass 2: Sonnet re-analyzes
 * with the answers as authoritative context.
 *
 * "Quick re-analyze" path skips the questions and fires a Sonnet pass with
 * no inspector context — same as the old ReanalyzeButton behavior.
 */
export function DeepReanalyzeFlow({ photoId }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  async function startWithQuestions() {
    setStage({ kind: "fetching-questions" });
    try {
      const res = await fetch(`/api/photos/${photoId}/deep-questions`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        questions?: Question[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStage({
          kind: "error",
          message: json.error ?? `Could not generate questions (HTTP ${res.status})`,
        });
        return;
      }
      const questions = json.questions ?? [];
      if (questions.length === 0) {
        // No questions needed — go straight to deep analysis with no context.
        await runReanalyze({}, []);
        return;
      }
      setStage({ kind: "answering", questions, answers: {} });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  async function quickReanalyze() {
    if (
      !confirm(
        "Re-analyze with Sonnet 4.5 (no clarifying questions)? Existing findings on this photo will be replaced. Cost ≈ $0.020-0.040.",
      )
    ) {
      return;
    }
    await runReanalyze({}, []);
  }

  async function runReanalyze(
    answers: Record<string, string>,
    questions: Question[],
  ) {
    setStage({ kind: "analyzing", answers, questions });

    const payload = questions
      .map((q) => ({
        question: q.question,
        answer: (answers[q.id] ?? "").trim(),
      }))
      .filter((qa) => qa.answer.length > 0);

    try {
      const res = await fetch(`/api/photos/${photoId}/reanalyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "deep", answers: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStage({
          kind: "error",
          message: json.error ?? `Re-analysis failed (HTTP ${res.status})`,
        });
        return;
      }
      setStage({ kind: "done" });
      router.refresh();
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  /* -------------------- render -------------------- */

  if (stage.kind === "idle") {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={startWithQuestions}
          className="cl-btn-accent w-full sm:w-auto"
        >
          <SparkIcon /> Deep analyze (with questions)
        </button>
        <button
          type="button"
          onClick={quickReanalyze}
          className="cl-btn-outline w-full sm:w-auto"
        >
          Skip questions
        </button>
      </div>
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
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
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
            onClick={() => runReanalyze(stage.answers, stage.questions)}
            className="cl-btn-accent w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50"
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
        <Spinner /> Re-analyzing with Sonnet 4.5 using your answers…
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

  // error
  return (
    <div className="flex flex-col gap-2">
      <p
        className="rounded-lg border px-3 py-2 text-xs"
        style={{
          borderColor: "rgba(239,68,68,0.3)",
          background: "rgba(239,68,68,0.08)",
          color: "#fca5a5",
        }}
      >
        {stage.message}
      </p>
      <button
        type="button"
        onClick={() => setStage({ kind: "idle" })}
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
