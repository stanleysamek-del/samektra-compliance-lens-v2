"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/toaster";
import { resizeImageForUpload } from "@/lib/resize-image";
import { createPlans, type NewPlanInput } from "@/app/actions/plans";

/* =====================================================================
 * PlanUploader — PDF or image → plan page(s) in the `drawings` bucket.
 *
 * PDFs are rasterized IN THE BROWSER with pdf.js from cdnjs (one PNG per
 * page, ~2000px on the long edge, capped at 6 pages) so the server never
 * has to parse a PDF. Each page uploads with the browser Supabase client
 * to <facilityId>/<uuid>-p<page>.png, the source PDF to
 * <facilityId>/<uuid>-source.pdf, and one createPlans() call records the
 * rows. Images go through the shared resize helper (≤ 3000px) and upload
 * as a single plan.
 *
 * pdf.js is loaded on demand via a runtime `import()` that the bundler
 * is told to leave alone (webpackIgnore / turbopackIgnore), so it ships
 * nothing until someone actually drops a PDF — and it works under a CSP
 * without 'unsafe-eval' (the previous `new Function` trick did not).
 * ===================================================================== */

const PDFJS_VERSION = "4.10.38";
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

const MAX_PAGES = 6;
const PAGE_LONG_EDGE = 2000;
const IMAGE_LONG_EDGE = 3000;
const MAX_BYTES = 40 * 1024 * 1024;

type Status = "queued" | "rendering" | "uploading" | "saving" | "done" | "failed";
type Item = {
  id: string;
  file: File;
  status: Status;
  detail: string;
  progress: number; // 0..1
};

/* pdf.js surface we use — typed minimally so the CDN module stays untyped. */
type PdfJsViewport = { width: number; height: number };
type PdfJsPage = {
  getViewport(opts: { scale: number }): PdfJsViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }): { promise: Promise<void> };
  cleanup?: () => void;
};
type PdfJsDocument = {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
};
type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
};

let pdfjsPromise: Promise<PdfJsLib> | null = null;
function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfjsPromise) {
    // Runtime dynamic import the bundler leaves alone. Subresource
    // Integrity can't be applied to a dynamic import() (no <script> tag
    // to carry the hash), so the URL is version-pinned and the origin is
    // allow-listed in the CSP. Vendoring pdfjs-dist is the follow-up that
    // would remove the CDN dependency entirely.
    pdfjsPromise = (
      import(
        /* webpackIgnore: true */
        /* turbopackIgnore: true */
        PDFJS_URL
      ) as Promise<PdfJsLib>
    )
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return lib;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "").slice(0, 120) || "Plan";
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
}

async function imageDimensions(file: File): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const dims = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  return dims;
}

export function PlanUploader({ facilityId }: { facilityId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  function patch(id: string, p: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  async function processFile(item: Item) {
    const supabase = createClient();
    const uid = crypto.randomUUID();
    const file = item.file;
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const plans: NewPlanInput[] = [];

    if (isPdf) {
      patch(item.id, { status: "rendering", detail: "Loading PDF engine…", progress: 0.05 });
      const pdfjs = await loadPdfJs();
      const data = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
      const pageCount = Math.min(doc.numPages, MAX_PAGES);
      if (doc.numPages > MAX_PAGES) {
        showToast({
          kind: "info",
          message: `${file.name}: only the first ${MAX_PAGES} pages are imported.`,
        });
      }

      // Source PDF first so the plan rows can reference it.
      patch(item.id, { status: "uploading", detail: "Uploading source PDF…", progress: 0.1 });
      const sourcePath = `${facilityId}/${uid}-source.pdf`;
      const { error: srcErr } = await supabase.storage
        .from("drawings")
        .upload(sourcePath, file, { contentType: "application/pdf", upsert: false });
      if (srcErr) throw new Error(`Source upload failed: ${srcErr.message}`);

      for (let n = 1; n <= pageCount; n++) {
        patch(item.id, {
          status: "rendering",
          detail: `Rendering page ${n} of ${pageCount}…`,
          progress: 0.1 + ((n - 1) / pageCount) * 0.8,
        });
        const page = await doc.getPage(n);
        const v1 = page.getViewport({ scale: 1 });
        const scale = PAGE_LONG_EDGE / Math.max(v1.width, v1.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const png = await canvasToPng(canvas);
        page.cleanup?.();

        patch(item.id, {
          status: "uploading",
          detail: `Uploading page ${n} of ${pageCount}…`,
          progress: 0.1 + ((n - 0.5) / pageCount) * 0.8,
        });
        const storagePath = `${facilityId}/${uid}-p${n}.png`;
        const { error: upErr } = await supabase.storage
          .from("drawings")
          .upload(storagePath, png, { contentType: "image/png", upsert: false });
        if (upErr) throw new Error(`Page ${n} upload failed: ${upErr.message}`);

        plans.push({
          name: pageCount > 1 ? `${baseName(file.name)} p.${n}` : baseName(file.name),
          page: n,
          width: canvas.width,
          height: canvas.height,
          storagePath,
          sourcePath,
        });
        canvas.width = 0;
        canvas.height = 0;
      }
      await doc.destroy?.();
    } else {
      patch(item.id, { status: "rendering", detail: "Preparing image…", progress: 0.1 });
      const resized = await resizeImageForUpload(file, IMAGE_LONG_EDGE, 0.9);
      const dims = await imageDimensions(resized);
      const ext = resized.type === "image/png" ? "png" : "jpg";
      const contentType = resized.type || "image/jpeg";
      const storagePath = `${facilityId}/${uid}-p1.${ext}`;
      patch(item.id, { status: "uploading", detail: "Uploading image…", progress: 0.4 });
      const { error: upErr } = await supabase.storage
        .from("drawings")
        .upload(storagePath, resized, { contentType, upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      plans.push({
        name: baseName(file.name),
        page: 1,
        width: dims.w,
        height: dims.h,
        storagePath,
        sourcePath: null,
      });
    }

    patch(item.id, { status: "saving", detail: "Saving…", progress: 0.95 });
    const res = await createPlans({ facilityId, plans });
    if (!res.ok) throw new Error(res.error);
    patch(item.id, {
      status: "done",
      detail: plans.length === 1 ? "Added" : `Added ${plans.length} pages`,
      progress: 1,
    });
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const accepted: Item[] = [];
    for (const file of Array.from(list)) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        showToast({ kind: "error", message: `${file.name}: only PDF or image files.` });
        continue;
      }
      if (file.size > MAX_BYTES) {
        showToast({ kind: "error", message: `${file.name}: larger than 40 MB.` });
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        detail: "Waiting…",
        progress: 0,
      });
    }
    if (accepted.length === 0) return;
    setItems((prev) => [...prev, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";

    setBusy(true);
    let okCount = 0;
    for (const item of accepted) {
      try {
        await processFile(item);
        okCount += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patch(item.id, { status: "failed", detail: message, progress: 0 });
        showToast({ kind: "error", message: `${item.file.name}: ${message}` });
      }
    }
    setBusy(false);
    if (okCount > 0) {
      showToast({
        kind: "success",
        message: okCount === 1 ? "Plan added." : `${okCount} files added.`,
      });
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition"
        style={{ borderColor: "var(--border)", color: "var(--fg-muted)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <span className="font-medium text-[var(--fg)]">
          {busy ? "Working…" : "Add a life-safety plan or drawing"}
        </span>
        <span className="text-xs text-[var(--fg-subtle)]">
          PDF (up to {MAX_PAGES} pages) or an image. Tap to choose, or drop a file here.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      {items.length > 0 ? (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-1 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-[var(--fg)]">
                  {it.file.name}
                </span>
                <span
                  className="shrink-0"
                  style={{
                    color:
                      it.status === "done"
                        ? "#607a3a"
                        : it.status === "failed"
                          ? "#a8362b"
                          : "var(--fg-muted)",
                  }}
                >
                  {it.detail}
                </span>
              </div>
              {it.status !== "done" && it.status !== "failed" ? (
                <div className="h-1 w-full overflow-hidden rounded bg-[var(--border)]">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.round(it.progress * 100)}%`,
                      background: "var(--gold, #c89b3c)",
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
