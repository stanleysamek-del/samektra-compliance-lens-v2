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
    whatToLookForCount?: number;
    notVisibleCount?: number;
    confidence?: number | null;
    model?: string;
    costUsd?: number;
    error?: boolean;
    errorMessage?: string;
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

  async function send() {
    const text = draft.trim();
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
      <div>
        <p className="font-medium text-[var(--fg)]">Coach the AI</p>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Tell the AI what to look at — &ldquo;Check the deflector clearance
          on the upper-right sprinkler,&rdquo; or &ldquo;The wall is 1-hour
          rated, re-examine the penetrations.&rdquo; Each hint triggers a deep
          re-analysis with the whole conversation as context. Your edited and
          custom findings are preserved.
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
          {turns.map((t) => (
            <li key={t.id} className="flex">
              {t.role === "inspector" ? (
                <InspectorBubble text={t.text} annotation={t.annotation_ref} />
              ) : (
                <AIBubble
                  text={t.text}
                  meta={t.ai_meta}
                />
              )}
            </li>
          ))}
        </ul>
      ) : !isLoading ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--fg-subtle)]">
          No hints yet. Start by telling the AI what it&apos;s missing or
          what to focus on in this photo.
        </p>
      ) : null}

      {/* Pending inspector turn (optimistic) */}
      {isSending ? (
        <>
          <InspectorBubble text={pendingText} annotation={null} />
          <div className="flex items-center gap-2 self-start text-xs text-[var(--fg-muted)]">
            <Spinner /> Re-analyzing with your hint…
          </div>
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
            onClick={send}
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
}: {
  text: string;
  meta: Turn["ai_meta"];
}) {
  const isError = meta?.error === true;
  return (
    <div className="mr-auto flex max-w-[85%] flex-col items-start gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        Compliance Lens AI
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
          </div>
        ) : null}
      </div>
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
