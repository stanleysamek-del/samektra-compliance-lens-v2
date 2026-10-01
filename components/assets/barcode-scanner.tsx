"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";

export function BarcodeScanner({
  facilities,
  initialFacility = "",
  sourceImageUrl,
  compact = false,
}: {
  facilities: { id: string; name: string }[];
  initialFacility?: string;
  sourceImageUrl?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [facility, setFacility] = useState(initialFacility);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [decoded, setDecoded] = useState<{ text: string; format: string; hex: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    if (timer.current) clearTimeout(timer.current);
    setRunning(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function found(value: string, format: string, bytes?: Uint8Array | null) {
    stop();
    setDecoded({ text: value, format, hex: bytes ? Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ") : "" });
    setMessage("Barcode read. The complete decoded content is shown below.");
  }
  const canLookup = !!decoded?.text && decoded.text === decoded.text.trim() && decoded.text.length <= 160 && !/[\x00-\x1f\x7f]/.test(decoded.text);
  function lookup() {
    if (!facility || !canLookup || !decoded) return;
    router.push(
      `/assets?facility=${encodeURIComponent(facility)}&barcode=${encodeURIComponent(decoded.text)}&scan=1`,
    );
  }
  async function start() {
    stop();
    setDecoded(null);
    setMessage("");
    setRunning(true);
    const token = generation.current;
    try {
      const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
      if (token !== generation.current) return;
      const reader = new BrowserMultiFormatReader();
      const handle = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        video.current!,
        (result) => {
          if (result && token === generation.current) found(result.getText(), BarcodeFormat[result.getBarcodeFormat()], result.getRawBytes());
        },
      );
      if (token !== generation.current) {
        handle.stop();
        return;
      }
      controls.current = handle;
      timer.current = setTimeout(() => {
        stop();
        setMessage(
          "Camera stopped after 60 seconds. Try again, upload a close-up image, or enter the code manually.",
        );
      }, 60000);
    } catch {
      if (token === generation.current) {
        stop();
        setMessage(
          "Camera unavailable. Allow camera access over HTTPS, upload a barcode image, or use the manual search.",
        );
      }
    }
  }
  async function scanImage(file?: File) {
    if (!file) return;
    stop();
    setDecoded(null);
    setMessage("Reading barcode image...");
    const token = generation.current;
    if (file.size > 15 * 1024 * 1024) {
      setMessage("Choose an image smaller than 15 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const img = new Image();
      img.src = url;
      await img.decode();
      if (img.naturalWidth * img.naturalHeight > 50_000_000) throw new Error("Image too large to decode");
      // Try the original first, then scaled/rotated copies. Portrait camera
      // photos often contain a vertical 1D code which a horizontal scan misses.
      try {
        const result = await reader.decodeFromImageElement(img);
        if (token === generation.current) found(result.getText(), BarcodeFormat[result.getBarcodeFormat()], result.getRawBytes());
        return;
      } catch { /* Continue with normalized orientations. */ }
      for (const angle of [0, 90, 180, 270]) {
        if (token !== generation.current) return;
        const scale = Math.min(2, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = angle % 180 ? h : w;
        canvas.height = angle % 180 ? w : h;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        try {
          const result = reader.decodeFromCanvas(canvas);
          if (token === generation.current) found(result.getText(), BarcodeFormat[result.getBarcodeFormat()], result.getRawBytes());
          return;
        } catch { /* Try the next orientation. */ }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      throw new Error("No code decoded");
    } catch {
      if (token === generation.current)
        setMessage(
          "No readable barcode found. Crop to one barcode, use a sharper image, or enter its printed value.",
        );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <section className={compact ? "space-y-3 border-t p-4" : "space-y-3 rounded-xl border p-5"}>
      {!compact && <>
      <h2 className="text-xl font-semibold">Scan equipment</h2>
      <p className="text-sm">
        Read common 1D barcodes and QR codes on your device. No AI credits.
        Scan without a building to see the full content. Choose a building
        only when looking up an equipment record.
      </p>
      <label className="block">
        Building
        <select
          className="cl-input"
          value={facility}
          onChange={(e) => {
            stop();
            setFacility(e.target.value);
          }}
        >
          <option value="">Choose a building</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      </>}
      {compact && <p className="text-xs">Barcode content is separate from safety findings. Reading it uses no AI credits.</p>}
      <div className="flex flex-wrap gap-3">
        {sourceImageUrl && <button type="button" className="cl-btn-primary" disabled={running || loadingPhoto} onClick={async () => {
          setLoadingPhoto(true);
          setDecoded(null);
          setMessage("Loading this photo...");
          try {
            const response = await fetch(sourceImageUrl);
            if (!response.ok) throw new Error("Photo unavailable");
            const blob = await response.blob();
            await scanImage(new File([blob], "inspection-photo", { type: blob.type }));
          } catch { setMessage("Could not load this photo. Refresh the page or upload the original image below."); }
          finally { setLoadingPhoto(false); }
        }}>{loadingPhoto ? "Reading photo..." : "Read barcode from this photo"}</button>}
        {!compact && <><button
          type="button"
          className="cl-btn-primary"
          disabled={running || loadingPhoto}
          onClick={start}
        >
          Start camera
        </button>
        {running && (
          <button type="button" className="cl-btn-outline" onClick={stop}>
            Stop camera
          </button>
        )}
        <label className="cl-btn-outline">
          Read barcode image
          <input
            aria-label="Barcode image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={running || loadingPhoto}
            className="block max-w-64 text-sm"
            onChange={(e) => {
              void scanImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label></>}
      </div>
      <video
        ref={video}
        muted
        playsInline
        className={running ? "max-h-80 w-full rounded-lg bg-black" : "hidden"}
      />
      <p role="status">{message}</p>
      {decoded && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Decoded barcode</h3>
          <p>Format: {decoded.format} · {decoded.text.length} characters</p>
          <label className="block">Complete barcode content
            <textarea aria-label="Complete barcode content" className="cl-input min-h-32 font-mono" readOnly value={decoded.text} />
          </label>
          <details><summary className="cursor-pointer">Inspect spaces, line breaks, and control characters</summary>
            <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(decoded.text)}</pre>
          </details>
          {decoded.hex && <details><summary className="cursor-pointer">Decoder-provided bytes (hex)</summary><pre className="whitespace-pre-wrap break-all text-xs">{decoded.hex}</pre></details>}
          <p className="text-sm">This is the content encoded in the barcode. Product specifications, service history, and other details are available only if encoded here or saved in a matching equipment record. Links are displayed without opening them.</p>
          <button type="button" className="cl-btn-outline" onClick={async () => {
            try { await navigator.clipboard.writeText(decoded.text); setMessage("Complete barcode content copied."); }
            catch { setMessage("Select and copy the barcode content above."); }
          }}>Copy full content</button>
          {!compact && <><button type="button" className="cl-btn-primary" disabled={!facility || !canLookup} onClick={lookup}>Find matching equipment</button>
          {!facility && <p className="text-sm">Choose a building above to look up equipment. Scanning itself does not require one.</p>}
          {!canLookup && <p className="text-sm">The full content is readable above. Equipment identifiers must be single-line values of at most 160 characters without surrounding whitespace.</p>}</>}
        </div>
      )}
    </section>
  );
}
