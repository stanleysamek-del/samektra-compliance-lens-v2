"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Card } from "@/components/card";
import { uploadAndAnalyzePhoto } from "@/app/inspections/[id]/upload-action";

type Props = {
  inspectionId: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "preparing" }
  | { kind: "uploading"; filename: string }
  | { kind: "analyzing"; filename: string }
  | { kind: "error"; message: string };

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Camera + library picker + drag-and-drop. Mobile-first: the big
 * primary buttons are the two iOS-style capture options.
 */
export function PhotoUploader({ inspectionId }: Props) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [photoLocation, setPhotoLocation] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  const busy =
    status.kind === "preparing" ||
    status.kind === "uploading" ||
    status.kind === "analyzing" ||
    isPending;

  function reset() {
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

    setStatus({ kind: "uploading", filename: file.name });

    const formData = new FormData();
    formData.append("image", file, file.name);
    if (photoLocation) formData.append("photo_location", photoLocation);

    startTransition(async () => {
      // Tiny tick so the UI shows the "uploading" state before the action blocks.
      setStatus({ kind: "analyzing", filename: file.name });
      const result = await uploadAndAnalyzePhoto(inspectionId, formData);
      if (result.ok) {
        setStatus({ kind: "idle" });
        // Refresh the photo list and jump to the new photo.
        router.refresh();
        router.push(`/inspections/${inspectionId}/photos/${result.photoId}`);
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    });
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
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

      {/* Mobile-first capture row */}
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

      {/* Desktop drag-drop area */}
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
            ? "border-[var(--primary)] bg-[rgba(20,184,166,0.06)] text-[var(--fg)]"
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

      {/* Hidden file inputs */}
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

      {/* Status banner */}
      {status.kind !== "idle" ? (
        <div className="mt-4">
          {status.kind === "uploading" || status.kind === "analyzing" ? (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-4 py-3 text-sm">
              <Spinner />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--fg)]">
                  {status.kind === "uploading" ? "Uploading…" : "Analyzing with AI…"}
                </p>
                <p className="truncate text-xs text-[var(--fg-muted)]">
                  {status.filename}
                </p>
              </div>
            </div>
          ) : null}
          {status.kind === "error" ? (
            <div
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.08)",
                color: "#fca5a5",
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
        </div>
      ) : null}
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
function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="rgba(148,163,184,0.25)" strokeWidth="2.4"/>
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  );
}
