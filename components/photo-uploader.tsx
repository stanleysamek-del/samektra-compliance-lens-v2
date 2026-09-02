"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/card";
import { showToast } from "@/components/toaster";
import { resizeImageForUpload } from "@/lib/resize-image";
import { extractPhotoIntegrity } from "@/lib/photo-integrity";
import { formatDuration } from "@/lib/format-duration";

type Props = {
  inspectionId: string;
};

/**
 * Multi-photo uploader with a sequential queue.
 *
 *  - Pick / shoot several photos at once; each becomes a row.
 *  - Files upload ONE AT A TIME (the route runs the AI per photo and is
 *    capped at 90s — parallel uploads would just queue on the server and
 *    make every timer lie).
 *  - The page does NOT navigate away. After each success we
 *    router.refresh() so the new photo card appears below, toast the
 *    finding count, and leave a "View analysis" link on the row.
 *  - NO automatic retry on the upload POST. A retried POST after a dropped
 *    connection can duplicate the photo AND the AI charge (the server has
 *    no idempotency key). Failed rows get a manual Retry button instead.
 */

type ItemStatus = "queued" | "uploading" | "analyzing" | "done" | "failed";

type QueueItem = {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  /** Captured at enqueue time so a location typed later doesn't leak backwards. */
  photoLocation: string;
  status: ItemStatus;
  error?: string;
  photoId?: string;
  findingsCount?: number;
  /** Wall-clock ms the upload + analysis took (set on done/failed). */
  tookMs?: number;
  /** Date.now() when this item went in flight — drives the live timer. */
  startedAt?: number;
};

// Raw camera files are accepted up to 40 MB — modern phones routinely
// shoot 12-25 MB JPEGs — because everything is downscaled in the browser
// before upload (1024px analysis copy + 2560px zoom copy). The server's own
// 10 MB cap applies to those downscaled uploads, not the file picked.
const MAX_BYTES = 40 * 1024 * 1024;
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

let seq = 0;
function nextId() {
  seq += 1;
  return `q${Date.now().toString(36)}-${seq}`;
}

export function PhotoUploader({ inspectionId }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [photoLocation, setPhotoLocation] = useState("");
  // The queue lives in a ref (source of truth the async pump can read
  // without stale closures) and is mirrored into state for rendering.
  const queueRef = useRef<QueueItem[]>([]);
  const [queue, setQueueState] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  // Wall clock, ticked every 100ms while an item is in flight; the
  // elapsed time is DERIVED from it and the item's startedAt.
  const [now, setNow] = useState(0);
  // Guards the sequential pump so two triggers can't start two uploads.
  const pumpingRef = useRef(false);

  const active = queue.find((q) => q.status === "uploading" || q.status === "analyzing") ?? null;
  const busy = active !== null;
  const pendingCount = queue.filter((q) => q.status === "queued").length;
  const elapsedMs = active?.startedAt ? Math.max(0, now - active.startedAt) : 0;

  // Rotate the thinking message every 2.2s while analyzing. (Reset to 0
  // happens in processItem, an event context — not here.)
  useEffect(() => {
    if (active?.status !== "analyzing") return;
    const interval = setInterval(() => {
      setThinkingIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [active?.status]);

  // Tick the clock every 100ms while an item is in flight.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [active]);

  const update = useCallback((fn: (prev: QueueItem[]) => QueueItem[]) => {
    const next = fn(queueRef.current);
    queueRef.current = next;
    setQueueState(next);
  }, []);

  const patch = useCallback(
    (id: string, p: Partial<QueueItem>) => {
      update((prev) => prev.map((q) => (q.id === id ? { ...q, ...p } : q)));
    },
    [update],
  );

  const processItem = useCallback(
    async (item: QueueItem) => {
      const startedAt = Date.now();
      setThinkingIdx(0);
      setNow(startedAt);
      patch(item.id, { status: "uploading", error: undefined, startedAt });

      try {
        // Integrity capture FIRST — GPS + timestamp + SHA-256 come from the
        // ORIGINAL bytes; the resize below re-encodes and strips EXIF.
        const integrity = await extractPhotoIntegrity(item.file);

        // Resize before upload to cut bandwidth + AI input-token cost.
        // Falls back to original if the browser can't decode the file.
        const resized = await resizeImageForUpload(item.file, 1024);

        const formData = new FormData();
        formData.append("inspection_id", inspectionId);
        formData.append("image", resized, resized.name);
        // Zoom copy alongside the 1024px analysis copy — capped at 2560px
        // on the long edge (~1 MB) rather than the raw camera file (which
        // can be 10-25 MB on modern phones and would fill storage fast).
        // 2560px is plenty to read a gauge needle or a label; the SHA-256
        // above still fingerprints the untouched original. Best-effort on
        // the server. Skipped when it would be the same bytes as the
        // analysis copy (small photos skip resizing entirely).
        const zoom = await resizeImageForUpload(item.file, 2560, 0.85);
        if (zoom !== resized && zoom.size <= 10 * 1024 * 1024) {
          formData.append("original", zoom, zoom.name);
        }
        if (item.photoLocation) formData.append("photo_location", item.photoLocation);
        if (integrity.sha256) formData.append("original_sha256", integrity.sha256);
        if (integrity.lat !== null) formData.append("exif_lat", String(integrity.lat));
        if (integrity.lng !== null) formData.append("exif_lng", String(integrity.lng));
        if (integrity.takenAt) formData.append("exif_taken_at", integrity.takenAt);

        patch(item.id, { status: "analyzing" });

        // Single attempt, on purpose — see the header comment. If the
        // connection drops mid-request we cannot know whether the server
        // already saved the photo, so we never re-POST automatically.
        const res = await fetch("/api/photos/upload", { method: "POST", body: formData });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          photoId?: string;
          findingsCount?: number;
          error?: string;
        };

        if (!res.ok || !json.ok || !json.photoId) {
          patch(item.id, {
            status: "failed",
            error: json.error ?? `Upload failed (HTTP ${res.status}).`,
            tookMs: Date.now() - startedAt,
          });
          return;
        }

        const findingsCount = typeof json.findingsCount === "number" ? json.findingsCount : undefined;
        patch(item.id, {
          status: "done",
          photoId: json.photoId,
          findingsCount,
          tookMs: Date.now() - startedAt,
        });
        showToast({
          kind: "success",
          message:
            findingsCount === undefined
              ? "Photo analyzed."
              : `Photo analyzed — ${findingsCount} finding${findingsCount === 1 ? "" : "s"}.`,
        });
        // Pull the new photo card into the page without leaving it.
        router.refresh();
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Upload failed";
        // Map low-level network errors to a friendly message. We do NOT
        // retry: the request may have reached the server.
        const message = /fetch|network|failed/i.test(raw)
          ? "Network hiccup — couldn't reach the server. Check your connection, then tap Retry. (If the photo shows up below anyway, it went through — don't retry.)"
          : raw;
        patch(item.id, { status: "failed", error: message, tookMs: Date.now() - startedAt });
      }
    },
    [inspectionId, router, patch],
  );

  // The pump: start the next queued item when nothing is in flight, then
  // call itself again when that item settles. Triggered from event
  // handlers (enqueue / retry) — never from an effect. Sequential by design.
  function pump() {
    if (pumpingRef.current) return;
    const next = queueRef.current.find((q) => q.status === "queued");
    if (!next) return;
    pumpingRef.current = true;
    processItem(next).finally(() => {
      pumpingRef.current = false;
      pump();
    });
  }

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const q of queueRef.current) URL.revokeObjectURL(q.previewUrl);
    };
  }, []);

  function enqueue(files: File[]) {
    const additions: QueueItem[] = [];
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) {
        additions.push({
          id: nextId(),
          file,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          photoLocation,
          status: "failed",
          error: `Unsupported file type (${file.type || "unknown"}). Use JPEG, PNG, or WebP.`,
        });
        continue;
      }
      if (file.size > MAX_BYTES) {
        additions.push({
          id: nextId(),
          file,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          photoLocation,
          status: "failed",
          error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 40 MB).`,
        });
        continue;
      }
      additions.push({
        id: nextId(),
        file,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        photoLocation,
        status: "queued",
      });
    }
    if (additions.length > 0) {
      update((prev) => [...prev, ...additions]);
      pump();
    }
  }

  function retry(id: string) {
    update((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        // Type/size rejections can't be fixed by retrying.
        if (!ALLOWED.includes(q.file.type) || q.file.size > MAX_BYTES) return q;
        return { ...q, status: "queued", error: undefined, tookMs: undefined, startedAt: undefined };
      }),
    );
    pump();
  }

  function remove(id: string) {
    update((prev) => {
      const row = prev.find((q) => q.id === id);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  }

  function clearFinished() {
    update((prev) => {
      for (const q of prev) if (q.status === "done") URL.revokeObjectURL(q.previewUrl);
      return prev.filter((q) => q.status !== "done");
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) enqueue(files);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) enqueue(files);
  }

  const doneCount = queue.filter((q) => q.status === "done").length;
  const failedCount = queue.filter((q) => q.status === "failed").length;

  return (
    <Card variant="tinted-teal">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight text-[var(--fg)]">
          Add photos
        </h2>
        <p className="text-xs text-[var(--fg-muted)]">
          Take several at once — they upload one after another and Chip
          analyzes each the moment it lands. Aim for clear, straight-on
          shots; bounding boxes get tighter that way.
        </p>
      </div>

      <input
        type="text"
        value={photoLocation}
        onChange={(e) => setPhotoLocation(e.target.value)}
        placeholder="Optional: photo location (e.g., 'Stair B landing') — applies to the next photos you add"
        className="cl-input mt-4"
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="cl-btn-accent w-full"
        >
          <CameraIcon /> Take photo
        </button>
        <button
          type="button"
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
          Or drag photos here ·{" "}
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
        multiple
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {/* In-flight preview for the ACTIVE item, with the rotating
          "thinking" message + live elapsed timer. */}
      {active ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-input)]">
          <div className="relative aspect-video w-full" style={{ background: "#0a0d12" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.previewUrl}
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
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-6">
              <div
                className="flex items-center gap-2 text-xs font-medium text-white"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
              >
                <Spinner small />
                {active.status === "uploading" ? (
                  <span className="truncate">Uploading {active.name}…</span>
                ) : (
                  <span className="truncate">{THINKING_MESSAGES[thinkingIdx]}</span>
                )}
              </div>
              <div
                className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 tabular-nums"
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                }}
              >
                <span
                  className="text-[9px] uppercase tracking-[0.18em]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  Elapsed
                </span>
                <span className="text-base font-semibold" style={{ color: "var(--gold)" }}>
                  {formatDuration(elapsedMs)}
                </span>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  · usually under 30 seconds per photo
                  {pendingCount > 0 ? ` · ${pendingCount} more waiting` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Per-file status rows */}
      {queue.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--fg-subtle)]">
            <span>
              {queue.length} photo{queue.length === 1 ? "" : "s"}
              {doneCount > 0 ? ` · ${doneCount} done` : ""}
              {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              {pendingCount > 0 ? ` · ${pendingCount} waiting` : ""}
            </span>
            {doneCount > 0 ? (
              <button
                type="button"
                onClick={clearFinished}
                className="font-medium underline-offset-2 hover:underline"
              >
                Clear finished
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {queue.map((q) => (
              <QueueRow
                key={q.id}
                item={q}
                inspectionId={inspectionId}
                busy={busy}
                onRetry={() => retry(q.id)}
                onRemove={() => remove(q.id)}
              />
            ))}
          </ul>
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

function QueueRow({
  item,
  inspectionId,
  busy,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  inspectionId: string;
  busy: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const retryable =
    item.status === "failed" && ALLOWED.includes(item.file.type) && item.file.size <= MAX_BYTES;
  const statusLabel: Record<ItemStatus, string> = {
    queued: "Waiting",
    uploading: "Uploading…",
    analyzing: "Chip is analyzing…",
    done:
      item.findingsCount === undefined
        ? "Analyzed"
        : `${item.findingsCount} finding${item.findingsCount === 1 ? "" : "s"}`,
    failed: "Failed",
  };
  const tone =
    item.status === "done"
      ? "#607a3a"
      : item.status === "failed"
        ? "#a8362b"
        : item.status === "queued"
          ? "var(--fg-subtle)"
          : "#b8762a";

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded object-cover"
        style={{ background: "#0a0d12" }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium text-[var(--fg)]">{item.name}</span>
          {item.photoLocation ? (
            <span className="hidden truncate text-[var(--fg-subtle)] sm:inline">· {item.photoLocation}</span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium" style={{ color: tone }}>
            {item.status === "uploading" || item.status === "analyzing" ? (
              <span className="inline-flex items-center gap-1">
                <Spinner small dark />
                {statusLabel[item.status]}
              </span>
            ) : (
              statusLabel[item.status]
            )}
          </span>
          {item.status === "done" && item.tookMs ? (
            <span className="text-[var(--fg-subtle)]">· {formatDuration(item.tookMs)}</span>
          ) : null}
          {item.status === "done" && item.photoId ? (
            <Link
              href={`/inspections/${inspectionId}/photos/${item.photoId}`}
              className="font-medium text-[var(--primary)] underline-offset-2 hover:underline"
            >
              View analysis →
            </Link>
          ) : null}
        </div>
        {item.status === "failed" && item.error ? (
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "#a8362b" }}>
            {item.error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {retryable ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="cl-btn-outline px-2.5 py-1 text-[11px]"
          >
            Retry
          </button>
        ) : null}
        {item.status === "failed" || item.status === "queued" || item.status === "done" ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name} from the list`}
            className="flex h-8 w-8 items-center justify-center rounded text-[var(--fg-subtle)] transition hover:text-[var(--fg)]"
          >
            ✕
          </button>
        ) : null}
      </div>
    </li>
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
function Spinner({ small = false, dark = false }: { small?: boolean; dark?: boolean }) {
  const size = small ? 14 : 22;
  // Gold active arc stays visible on BOTH light (queue rows) and dark
  // (photo-preview) surfaces; the track color flips with `dark`.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={dark ? "rgba(15,21,24,0.18)" : "rgba(255,255,255,0.25)"}
        strokeWidth="2.4"
      />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}
