/**
 * Browser-side image resize. Drops both upload bandwidth AND AI input-token
 * cost (Claude/GPT charge by image area). 1024px on the long edge is plenty
 * for compliance-grade vision — the AI doesn't need 4K to read a gauge or
 * detect blocked egress.
 *
 * Returns the original file untouched if the browser can't decode it
 * (very old browsers, HEIC without polyfills, etc.) so we never block a
 * legitimate upload.
 */
export async function resizeImageForUpload(
  file: File,
  maxDim = 1024,
  jpegQuality = 0.85,
): Promise<File> {
  if (typeof window === "undefined") return file; // SSR safety

  // If the file is already small in bytes (< 600 KB), don't bother re-encoding.
  if (file.size < 600 * 1024) return file;

  try {
    const bitmap = await createBitmapFromFile(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));

    if (scale >= 1) {
      // Image already small enough — keep original to avoid generation loss.
      bitmap.close?.();
      return file;
    }

    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b),
        "image/jpeg",
        jpegQuality,
      );
    });

    if (!blob) return file;

    // Always send as JPEG since we re-encoded. Filename keeps the new ext.
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("[resize] failed, sending original:", err);
    return file;
  }
}

async function createBitmapFromFile(file: File): Promise<ImageBitmap> {
  // createImageBitmap is the cheapest way; falls back to Image element.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallthrough
    }
  }

  return await new Promise<ImageBitmap>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const bm = await createImageBitmap(img);
        URL.revokeObjectURL(url);
        resolve(bm);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
