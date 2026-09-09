"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";

export function BarcodeScanner({
  facilities,
  initialFacility = "",
}: {
  facilities: { id: string; name: string }[];
  initialFacility?: string;
}) {
  const router = useRouter();
  const [facility, setFacility] = useState(initialFacility);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
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
  function found(value: string) {
    stop();
    const code = value.trim();
    if (!code || code.length > 160 || /[\x00-\x1f\x7f]/.test(code)) {
      setMessage(
        "This code is not a valid equipment identifier. Enter the printed identifier manually.",
      );
      return;
    }
    setMessage(`Found ${code}. Looking up equipment...`);
    router.push(
      `/assets?facility=${encodeURIComponent(facility)}&barcode=${encodeURIComponent(code)}&scan=1`,
    );
  }
  async function start() {
    stop();
    setMessage("");
    setRunning(true);
    const token = generation.current;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (token !== generation.current) return;
      const reader = new BrowserMultiFormatReader();
      const handle = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current!,
        (result) => {
          if (result && token === generation.current) found(result.getText());
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
    setMessage("Reading barcode image...");
    const token = generation.current;
    if (file.size > 15 * 1024 * 1024) {
      setMessage("Choose an image smaller than 15 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(
        url,
      );
      if (token === generation.current) found(result.getText());
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
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Scan equipment</h2>
      <p className="text-sm">
        Read common 1D barcodes and QR codes on your device. No AI credits.
        Select the building first; the same code can exist in different
        buildings.
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
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="cl-btn-primary"
          disabled={!facility || running}
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
            disabled={!facility || running}
            className="block max-w-64 text-sm"
            onChange={(e) => {
              void scanImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <video
        ref={video}
        muted
        playsInline
        className={running ? "max-h-80 w-full rounded-lg bg-black" : "hidden"}
      />
      <p role="status">{message}</p>
    </section>
  );
}
