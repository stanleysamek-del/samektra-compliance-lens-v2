"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/card";
import { resizeImageForUpload } from "@/lib/resize-image";
import { fetchWithRetry } from "@/lib/retry";

type Props = {
  inspectionId: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; previewUrl: string }
  | { kind: "analyzing"; filename: string; previewUrl: string }
  | { kind: "error"; message: string };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// Rotating "thinking" messages shown while AI analysis is in flight.
// Generic compliance-inspection language so they read sensibly regardless of
// what the photo actually contains (extinguisher close-up, sprinkler valve,
// hallway with decorations, electrical panel, exit sign, etc.). The AI doesn't
// see these — they're just a friendly progress indicator.
const THINKING_MESSAGES = [
  "Identifying objects and code-relevant features in the frame…",
  "Reading any visible labels, tags, gauges, or signage…",
  "Estimating clearances, mounting heights, and surface coverage…",
  "Looking for fire, electrical, life-safety, and egress hazards…",
  "Checking for obstructions or anything blocking required equipment…",
  "Cross-checking applicable codes (NFPA, IBC, IFC, NEC, ADA, Title 25)…",
  "Considering the most likely occupancy classification…",
  "Drafting findings with code citations and remediation…",
  "Tightening bounding boxes around any deficiencies…",
  "Compiling a \"what to look for\" checklist for the on-site inspector…",
];

export function PhotoUploader({ inspectionId }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [photoLocation, setPhotoLocation] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);

  // Rotate the thinking message every 2.2s while analyzing.
  useEffect(() => {
    if (status.kind !== "analyzing") return;
    setThinkingIdx(0);
    const interval = setInterval(() => {
      setThinkingIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [status.kind]);

  const busy = status.kind === "uploading" || status.kind === "analyzing";

  function reset() {
    if (status.kind !== "idle" && "previewUrl" in status) {
      URL.revokeObjectURL(status.previewUrl);
    }
    setStatus({ kind: "idle" });
  }

  async function handleFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      setStatus({
        kind: "error",
        message: `Unsupported file type (${file.type}). Use JPEG, PNG, or WebP.`,
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({
        kind: "error",
        message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 10 MB).`,
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setStatus({ kind: "uploading", filename: file.name, previewUrl });

    // Resize before upload to cut bandwidth + AI input-token cost.
    // Falls back to original if the browser can't decode the file.
    const resized = await resizeImageForUpload(file, 1024);

    const formData = new FormData();
    formData.append("inspection_id", inspectionId);
    formData.append("image", resized, resized.name);
    if (photoLocation) formData.append("photo_location", photoLocation);

    setStatus({ kind: "analyzing", filename: file.name, previewUrl });

    try {
      // Retry on transient network / 502/503/504 — uploads are the most
      // failure-prone path (large body, AI call, multiple DB writes) so
      // it's worth giving the request a couple shots before giving up.
      const res = await fetchWithRetry(
        "/api/photos/upload",
        { method: "POST", body: formData },
        {
          retries: 2,
          backoffMs: 1200,
          onAttempt: (attempt, reason) => {
            // Surface retry state to the user so the spinner doesn't look
            // hung. Keep the same preview image.
            setStatus({
              kind: "analyzing",
              filename: file.name,
              previewUrl,
            });
            console.warn(
              `[upload] retry ${attempt} (${reason}) — retrying…`,
            );
          },
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        photoId?: string;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.photoId) {
        URL.revokeObjectURL(previewUrl);
        setStatus({
          kind: "error",
          message: json.error ?? `Upload failed (HTTP ${res.status}).`,
        });
        return;
      }

      URL.revokeObjectURL(previewUrl);
      setStatus({ kind: "idle" });
      router.refresh();
      router.push(`/inspections/${inspectionId}/photos/${json.photoId}`);
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      const raw = err instanceof Error ? err.message : "Upload failed";
      // Map low-level network errors to a friendly message.
      const message = /fetch|network|failed/i.test(raw)
        ? "Network hiccup — we retried but couldn't reach the server. Check your connection and try again."
        : raw;
      setStatus({ kind: "error", message });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <Card variant="tinted-teal">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-[var(--fg)]">
          Add a photo
        </h2>
        <p className="text-xs text-[var(--fg-muted)]">
          We&apos;ll run AI analysis the moment it uploads. Aim for clear,
          straight-on shots — bounding boxes get tighter that way.
        </p>
      </div>

      <input
        type="text"
        value={photoLocation}
        onChange={(e) => setPhotoLocation(e.target.value)}
        placeholder="Optional: photo location (e.g., 'Stair B landing')"
        className="cl-input mt-4"
        disabled={busy}
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraInputRef.current?.click()}
          className="cl-btn-accent w-full"
        >
          <CameraIcon /> Take photo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => libraryInputRef.current?.click()}
          className="cl-btn-outline w-full"
        >
          <LibraryIcon /> From library
        </button>
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={[
          "mt-3 hidden items-center justify-center rounded-lg border border-dashed py-6 text-sm transition lg:flex",
          isDragging
            ? "border-[var(--primary)] bg-[rgba(200,155,60,0.06)] text-[var(--fg)]"
            : "border-[var(--border-strong)] text-[var(--fg-muted)]",
        ].join(" ")}
      >
        <span>
          Or drag a photo here ·{" "}
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
          >
            browse
          </button>
        </span>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />

      {/* In-flight status with photo preview + rotating "thinking" message */}
      {status.kind === "uploading" || status.kind === "analyzing" ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-input)]">
          <div className="relative aspect-video w-full" style={{ background: "#0a0d12" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={status.previewUrl}
              alt="Uploading preview"
              className="h-full w-full object-contain"
            />
            {/* Scanning beam animation */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute left-0 right-0 h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(200,155,60,0.85), transparent)",
                  boxShadow: "0 0 16px 4px rgba(200,155,60,0.55)",
                  animation: "cl-scan 2.4s ease-in-out infinite",
                }}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--primary)]">
                <Spinner small />
                {status.kind === "uploading" ? (
                  <span>Uploading {status.filename}…</span>
                ) : (
                  <span className="truncate">
                    {THINKING_MESSAGES[thinkingIdx]}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div
          className="mt-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.08)",
            color: "#a8362b",
          }}
        >
          <span className="min-w-0">{status.message}</span>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <style>{`
        @keyframes cl-scan {
          0%   { top: 0%; opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </Card>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  );
}
function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      <path d="m6 16 4-4 3 3 2-2 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="9" cy="10" r="1.2" fill="currentColor"/>
    </svg>
  );
}
function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? 14 : 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="rgba(148,163,184,0.25)" strokeWidth="2.4"/>
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}
