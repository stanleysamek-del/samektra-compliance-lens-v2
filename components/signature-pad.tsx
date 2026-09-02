"use client";

/**
 * SignaturePad — canvas sign-off for inspector + manager.
 *
 * Pointer events (mouse, touch, stylus all work), devicePixelRatio-aware
 * so strokes stay crisp on phones. Save renders to PNG, uploads to the
 * `signatures` bucket under the caller's own folder (the storage policy
 * requires it), and records the path + timestamp via saveSignature.
 *
 * Once signed, shows the signature image (signed URL, fetched by the
 * server page) with the signed-at date and a re-sign option.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveSignature, clearSignature } from "@/app/inspections/[id]/actions";
import { showToast } from "@/components/toaster";
import { formatDateTime } from "@/lib/format-date";

export function SignaturePad({
  inspectionId,
  role,
  label,
  signedUrl,
  signedAt,
  userId,
}: {
  inspectionId: string;
  role: "inspector" | "manager";
  label: string;
  /** Pre-signed display URL when a signature already exists. */
  signedUrl: string | null;
  signedAt: string | null;
  userId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!signing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f1518";
  }, [signing]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
    if (!dirty) setDirty(true);
  }

  function onUp() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setDirty(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    setError(null);
    startTransition(async () => {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) {
        setError("Could not read the signature — try again.");
        return;
      }
      const path = `${userId}/${inspectionId}/${role}-signature-${Date.now()}.png`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("signatures")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const res = await saveSignature({ inspectionId, role, storagePath: path });
      if (!res.ok) {
        // The canvas keeps its ink — the inspector can just tap Save again.
        setError(res.error);
        showToast({ kind: "error", message: res.error });
        return;
      }
      setSigning(false);
      setDirty(false);
      hasInk.current = false;
    });
  }

  function removeSignature() {
    if (
      !window.confirm(
        `Remove the ${label.toLowerCase()} signature? The report will show it as unsigned until someone signs again.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await clearSignature({ inspectionId, role });
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({ kind: "success", message: "Signature removed." });
    });
  }

  if (signedUrl && !signing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
          {label}
        </span>
        <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt={`${label} signature`}
            className="h-16 w-auto max-w-full object-contain"
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--fg-subtle)]">
          {signedAt ? <span>Signed {formatDateTime(signedAt)}</span> : null}
          <button
            type="button"
            className="min-h-[40px] underline-offset-2 hover:text-[var(--fg)] hover:underline sm:min-h-0"
            onClick={() => setSigning(true)}
          >
            Re-sign
          </button>
          <button
            type="button"
            className="min-h-[40px] underline-offset-2 hover:text-[#a8362b] hover:underline disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            disabled={isPending}
            aria-busy={isPending}
            onClick={removeSignature}
          >
            {isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  if (!signing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setSigning(true)}
          className="flex h-20 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-sm font-medium text-[var(--fg-muted)] transition hover:border-[var(--primary)] hover:text-[var(--fg)]"
        >
          Tap to sign
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <canvas
        ref={canvasRef}
        className="h-32 w-full touch-none rounded-lg border border-[var(--border-strong)] bg-white"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending || !dirty}
          onClick={save}
          className="cl-btn-primary text-xs"
        >
          {isPending ? "Saving…" : "Save signature"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={clearCanvas}
          className="cl-btn-outline text-xs"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            clearCanvas();
            setSigning(false);
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-xs font-medium" style={{ color: "#a8362b" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
