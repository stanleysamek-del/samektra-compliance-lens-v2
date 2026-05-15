"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithRetry } from "@/lib/retry";
import type { Annotation } from "@/app/inspections/[id]/photos/[photoId]/actions";

type Turn = {
  id: string;
  turn_index: number;
  role: "inspector" | "ai";
  text: string;
  annotation_ref: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    type?: string;
    color?: string | null;
  } | null;
  ai_meta: {
    findingsCount?: number;
    findingsPreserved?: number;
    ratingsRestored?: number;
    whatToLookForCount?: number;
    notVisibleCount?: number;
    confidence?: number | null;
    model?: string;
    costUsd?: number;
    durationMs?: number;
    error?: boolean;
    errorMessage?: string;
    // Phase 3 — when present, render below the AI bubble as a follow-up
    // question with clickable answer chips.
    clarifyingQuestion?: {
      question: string;
      rationale?: string;
      options?: string[];
    } | null;
  } | null;
  created_at: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading-history" }
  | { kind: "sending"; pendingText: string }
  | { kind: "error"; message: string };

type Props = {
  photoId: string;
  /** Existing annotations on the photo. User can attach one to a hint so
   *  the AI gets both the burned-on-image shape AND a text reference to
   *  the specific region. */
  annotations?: Annotation[];
};

const MAX_TEXTAREA_LEN = 4000;
// Soft warn threshold — past this we start nudging the user toward
// summarizing/closing the conversation to keep token costs bounded.
const SOFT_TURN_LIMIT = 16;

export function CoachTheAI({ photoId, annotations = [] }: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "loading-history" });
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const selectedAnnotation =
    annotations.find((a) => a.id === selectedAnnotationId) ?? null;

  // Initial load — pull any existing thread for this photo so we don't
  // lose context across page navigations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}/coach`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          turns?: Turn[];
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && json.ok) {
          setTurns(json.turns ?? []);
          setStatus({ kind: "idle" });
        } else {
          setStatus({
            kind: "error",
            message: json.error ?? "Couldn't load conversation.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  // Auto-scroll to the newest turn whenever the thread grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, status.kind]);

  async function send(override?: string) {
    // override is used by the "answer the AI's question" chips, which need
    // to send a specific text instead of whatever is in `draft`.
    const text = (override ?? draft).trim();
    if (!text || status.kind === "sending") return;
    setStatus({ kind: "sending", pendingText: text });
    setDraft("");

    // Build the annotationRef payload if the user attached one. We use
    // normalized bbox + type + color so the server route can both reference
    // it in the prompt AND burn it onto the image for the AI to see.
    const annotationRef = selectedAnnotation
      ? {
          x1: selectedAnnotation.x1,
          y1: selectedAnnotation.y1,
          x2: selectedAnnotation.x2,
          y2: selectedAnnotation.y2,
          type: selectedAnnotation.type,
          color: selectedAnnotation.color,
        }
      : undefined;

    try {
      const res = await fetchWithRetry(
        `/api/photos/${photoId}/coach`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, annotationRef }),
        },
        { retries: 1, backoffMs: 1500 },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inspectorTurn?: Turn;
        aiTurn?: Turn;
        error?: string;
        findingsCount?: number;
      };

      if (!res.ok || !json.ok) {
        setStatus({
          kind: "error",
          message: json.error ?? `Coach failed (HTTP ${res.status})`,
        });
        // Inspector turn was already saved server-side; reload the thread so
        // we don't lose the hint from the UI.
        if (json.inspectorTurn) {
          setTurns((prev) => [...prev, json.inspectorTurn!]);
        }
        return;
      }

      // Append both new turns to the local state.
      const newTurns: Turn[] = [];
      if (json.inspectorTurn) newTurns.push(json.inspectorTurn);
      if (json.aiTurn) newTurns.push(json.aiTurn);
      setTurns((prev) => [...prev, ...newTurns]);
      setStatus({ kind: "idle" });
      // Clear the annotation selection so the inspector doesn't accidentally
      // tag the next hint with the same region.
      setSelectedAnnotationId(null);

      // Refresh the page so the Findings panel reflects the new analysis.
      router.refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const isSending = status.kind === "sending";
  const pendingText = status.kind === "sending" ? status.pendingText : "";
  const isLoading = status.kind === "loading-history";
  const overSoftLimit = turns.length >= SOFT_TURN_LIMIT;

  return (
    <div className="flex flex-col gap-3">
      {/* Animations used throughout the panel — mounted once at the root
          so they survive even when TypingIndicator unmounts. */}
      <style>{`
        @keyframes cl-typing-dot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30%           { opacity: 1;    transform: translateY(-2px); }
        }
        @keyframes cl-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cl-pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.0); }
          50%      { box-shadow: 0 0 0 6px rgba(20, 184, 166, 0.15); }
        }
      `}</style>

      <div>
        <p className="flex items-center gap-1.5 font-medium text-[var(--fg)]">
          Coach{" "}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: "rgba(20,184,166,0.12)",
              color: "#5eead4",
              border: "1px solid rgba(20,184,166,0.3)",
            }}
            title="Compliance · Hazard · Identification · Partner"
          >
            <ChipIcon /> Chip
          </span>
        </p>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Tell Chip what to look at — &ldquo;Check the deflector clearance
          on the upper-right sprinkler,&rdquo; or &ldquo;The wall is 1-hour
          rated, re-examine the penetrations.&rdquo; Each hint triggers a deep
          re-analysis with the whole conversation as context. Your edited and
          custom findings are preserved. Chip stands for{" "}
          <span
            className="font-medium text-[var(--fg-muted)]"
            title="The four things Chip exists to help with"
          >
            Compliance · Hazard · Identification · Partner
          </span>
          .
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
          <Spinner /> Loading conversation…
        </div>
      ) : null}

      {/* Thread */}
      {turns.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {turns.map((t, idx) => {
            // Only the latest AI turn's clarifyingQuestion gets clickable
            // chips — older ones display as static "AI asked:" history.
            const isLatestAI =
              t.role === "ai" &&
              idx === turns.length - 1 &&
              status.kind !== "sending";
            return (
              <li
                key={t.id}
                className="flex animate-[cl-msg-in_0.22s_ease-out]"
              >
                {t.role === "inspector" ? (
                  <InspectorBubble text={t.text} annotation={t.annotation_ref} />
                ) : (
                  <AIBubble
                    text={t.text}
                    meta={t.ai_meta}
                    canAnswerClarification={isLatestAI}
                    onAnswerClarification={(answer) => {
                      setDraft(answer);
                      // Tiny defer so React commits the draft before send()
                      // reads it via state.
                      requestAnimationFrame(() => send(answer));
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : !isLoading ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--fg-subtle)]">
          No hints yet. Start by telling the AI what it&apos;s missing or
          what to focus on in this photo.
        </p>
      ) : null}

      {/* Pending inspector turn (optimistic) + animated typing indicator */}
      {isSending ? (
        <>
          <InspectorBubble text={pendingText} annotation={null} />
          <TypingIndicator />
        </>
      ) : null}

      <div ref={threadEndRef} />

      {status.kind === "error" ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
          }}
        >
          {status.message}
        </div>
      ) : null}

      {overSoftLimit ? (
        <p className="text-[11px] text-[var(--fg-subtle)]">
          Heads up: long conversations cost more in tokens. If you&apos;re
          done coaching, finalize the photo and start a fresh thread on the
          next one.
        </p>
      ) : null}

      {/* Composer */}
      <div className="flex flex-col gap-2">
        {/* Annotation chooser — show the existing photo annotations as
            selectable chips. Clicking attaches that region to the next
            hint; the server burns the shape onto the image AND tells the
            AI the bbox so it focuses there. */}
        {annotations.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
              Attach a region from the photo (optional)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {annotations.map((a, idx) => {
                const selected = a.id === selectedAnnotationId;
                const label = annotationLabel(a, idx);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() =>
                      setSelectedAnnotationId((prev) =>
                        prev === a.id ? null : a.id,
                      )
                    }
                    disabled={isSending}
                    className={[
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[#0a0d12]"
                        : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/[0.04] hover:text-[var(--fg)]",
                    ].join(" ")}
                    title={`${a.type} at (${Math.round(a.x1 * 100)}%, ${Math.round(a.y1 * 100)}%)`}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: selected ? "#0a0d12" : (a.color || "#22d3ee") }}
                    />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--fg-subtle)]">
            Tip: click <span className="font-medium text-[var(--fg-muted)]">Annotate</span> on
            the photo above to circle a region, then come back here to attach
            it to a hint — the AI will see exactly which spot you mean.
          </p>
        )}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_TEXTAREA_LEN))}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter sends.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder={
            selectedAnnotation
              ? "Describe what you want the AI to look at in the selected region…"
              : "e.g., There's a pendant sprinkler in the upper-right — check the deflector distance to the slab."
          }
          className="cl-input min-h-[72px] resize-y py-2.5 text-sm"
          disabled={isSending}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--fg-subtle)]">
            {draft.length}/{MAX_TEXTAREA_LEN} · ⌘/Ctrl+Enter to send
          </span>
          <button
            type="button"
            onClick={() => send()}
            disabled={isSending || draft.trim().length === 0}
            className="cl-btn-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              <>Send hint</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectorBubble({
  text,
  annotation,
}: {
  text: string;
  annotation: Turn["annotation_ref"];
}) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        You
      </span>
      <div
        className="rounded-2xl rounded-tr-md border px-3 py-2 text-sm"
        style={{
          borderColor: "rgba(20,184,166,0.35)",
          background: "rgba(20,184,166,0.10)",
          color: "var(--fg)",
        }}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        {annotation ? (
          <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
            📍 Annotation attached
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AIBubble({
  text,
  meta,
  canAnswerClarification = false,
  onAnswerClarification,
}: {
  text: string;
  meta: Turn["ai_meta"];
  /** True only on the LATEST AI turn — older clarifying questions still
   *  render as text but their chips are not actionable (already answered). */
  canAnswerClarification?: boolean;
  onAnswerClarification?: (answer: string) => void;
}) {
  const isError = meta?.error === true;
  const cq = meta?.clarifyingQuestion;
  const hasClarification = Boolean(cq && cq.question);

  return (
    <div className="mr-auto flex max-w-[85%] flex-col items-start gap-1">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        <ChipIcon /> Chip
      </span>
      <div
        className="rounded-2xl rounded-tl-md border px-3 py-2 text-sm"
        style={{
          borderColor: isError
            ? "rgba(239,68,68,0.35)"
            : "rgba(148,163,184,0.25)",
          background: isError
            ? "rgba(239,68,68,0.08)"
            : "var(--bg-elevated)",
          color: isError ? "#fca5a5" : "var(--fg)",
        }}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        {meta && !isError ? (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
            {typeof meta.findingsCount === "number" ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(20,184,166,0.12)",
                  color: "#5eead4",
                }}
              >
                {meta.findingsCount} finding{meta.findingsCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {typeof meta.findingsPreserved === "number" &&
            meta.findingsPreserved > 0 ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(148,163,184,0.12)",
                  color: "#cbd5e1",
                }}
              >
                {meta.findingsPreserved} preserved
              </span>
            ) : null}
            {typeof meta.ratingsRestored === "number" &&
            meta.ratingsRestored > 0 ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(168,85,247,0.12)",
                  color: "#d8b4fe",
                }}
                title="Inspector thumbs ratings carried forward by title match"
              >
                {meta.ratingsRestored} ratings kept
              </span>
            ) : null}
            {typeof meta.confidence === "number" ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(245,158,11,0.12)",
                  color: "#fde68a",
                }}
              >
                {Math.round(meta.confidence * 100)}% confidence
              </span>
            ) : null}
            {typeof meta.durationMs === "number" ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  background: "rgba(148,163,184,0.08)",
                  color: "var(--fg-subtle)",
                }}
                title={`${meta.model ?? "model"} · ${(meta.durationMs / 1000).toFixed(1)}s`}
              >
                {(meta.durationMs / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Phase 3 — clarifying question attached to this AI turn.
          Rendered as a sub-bubble below so it visually distinct from the
          AI's main reply. Chips are clickable only on the LATEST turn. */}
      {hasClarification && cq ? (
        <div
          className="mt-1 flex w-full flex-col gap-2 rounded-xl border px-3 py-2.5 text-sm"
          style={{
            borderColor: "rgba(20,184,166,0.35)",
            background: "rgba(20,184,166,0.06)",
          }}
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "rgba(20,184,166,0.18)", color: "#5eead4" }}
            >
              ?
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--fg)]">{cq.question}</p>
              {cq.rationale ? (
                <p className="mt-1 text-[11px] italic text-[var(--fg-subtle)]">
                  {cq.rationale}
                </p>
              ) : null}
            </div>
          </div>
          {cq.options && cq.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pl-7">
              {cq.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!canAnswerClarification}
                  onClick={() => onAnswerClarification?.(opt)}
                  className={[
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-[0.97]",
                    canAnswerClarification
                      ? "border-[var(--primary)] text-[var(--fg)] hover:bg-[var(--primary)] hover:text-[#0a0d12]"
                      : "border-[var(--border)] text-[var(--fg-subtle)] cursor-default",
                  ].join(" ")}
                  title={
                    canAnswerClarification
                      ? "Answer with this — sends as your next hint"
                      : "Already answered earlier in the thread"
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : canAnswerClarification ? (
            <p className="pl-7 text-[11px] text-[var(--fg-subtle)]">
              Type your answer in the box below.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
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

/**
 * Three-dot "AI is thinking" indicator with a rotating natural-language
 * status caption — mirrors the upload "thinking messages" approach.
 * Renders styled as an AI bubble so it visually slots into the thread.
 */
const COACH_THINKING_MESSAGES = [
  "Re-reading the photo with your hint in mind…",
  "Comparing what you said against what's visible…",
  "Checking which existing findings still hold…",
  "Cross-referencing applicable code sections…",
  "Updating bounding boxes on the new findings…",
  "Drafting an acknowledgment of what changed…",
];

function TypingIndicator() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(
      () => setIdx((i) => (i + 1) % COACH_THINKING_MESSAGES.length),
      2400,
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mr-auto flex max-w-[85%] flex-col items-start gap-1">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        <ChipIcon /> Chip
      </span>
      <div
        className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border px-3 py-2 text-xs"
        style={{
          borderColor: "rgba(148,163,184,0.25)",
          background: "var(--bg-elevated)",
          color: "var(--fg-muted)",
        }}
      >
        <span aria-hidden className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--primary)",
              animation: "cl-typing-dot 1.2s ease-in-out infinite",
              animationDelay: "0s",
            }}
          />
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--primary)",
              animation: "cl-typing-dot 1.2s ease-in-out infinite",
              animationDelay: "0.18s",
            }}
          />
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--primary)",
              animation: "cl-typing-dot 1.2s ease-in-out infinite",
              animationDelay: "0.36s",
            }}
          />
        </span>
        <span className="truncate">{COACH_THINKING_MESSAGES[idx]}</span>
      </div>

    </div>
  );
}

/**
 * Tiny "microchip" glyph for the Chip badge — silicon with pins, plays
 * on the C.H.I.P. (Compliance · Hazard · Identification · Partner) name
 * and quietly nods at the fact that Chip is an AI under the hood.
 */
function ChipIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3" />
    </svg>
  );
}

/**
 * Short human-readable label for an annotation chip. Prefers the annotation's
 * own text if present (text labels the inspector drew); otherwise falls back
 * to "[type] #N".
 */
function annotationLabel(a: Annotation, idx: number): string {
  if (a.text && a.text.trim().length > 0) {
    const t = a.text.trim();
    return t.length > 28 ? t.slice(0, 27) + "…" : t;
  }
  const typeName =
    a.type === "rect"
      ? "Rectangle"
      : a.type === "circle"
        ? "Circle"
        : a.type === "arrow"
          ? "Arrow"
          : "Text";
  return `${typeName} #${idx + 1}`;
}
