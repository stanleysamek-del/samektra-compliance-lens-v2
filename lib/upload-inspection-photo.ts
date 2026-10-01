import { resizeImageForUpload } from "@/lib/resize-image";
import { extractPhotoIntegrity } from "@/lib/photo-integrity";

/**
 * One photo upload to /api/photos/upload, shared by the batch uploader and
 * the per-question camera button so both send identical payloads:
 * integrity (SHA-256 + EXIF GPS/time) from the ORIGINAL bytes, a 1024px
 * analysis copy, and a ≤2560px zoom copy.
 *
 * Single attempt, on purpose: if the connection drops mid-request we
 * can't know whether the server saved the photo, and a retried POST could
 * duplicate the photo AND the AI charge.
 */
export type UploadPhotoResult = {
  httpOk: boolean;
  status: number;
  json: {
    ok?: boolean;
    photoId?: string;
    findingsCount?: number;
    queued?: boolean;
    manual?: boolean;
    position?: number;
    error?: string;
  };
};

export async function uploadInspectionPhoto(input: {
  file: File;
  inspectionId: string;
  useAi: boolean;
  photoLocation?: string;
  /** Called once the bytes are prepared and the POST starts. */
  onSaving?: () => void;
}): Promise<UploadPhotoResult> {
  const { file, inspectionId, useAi, photoLocation } = input;

  // Integrity capture FIRST — the resize below re-encodes and strips EXIF.
  const integrity = await extractPhotoIntegrity(file);

  // Resize before upload to cut bandwidth + AI input-token cost. Falls
  // back to the original if the browser can't decode the file.
  const resized = await resizeImageForUpload(file, 1024);

  const formData = new FormData();
  formData.append("inspection_id", inspectionId);
  formData.append("analysis_mode", useAi ? "ai" : "manual");
  formData.append("image", resized, resized.name);
  // Zoom copy: enough to read a gauge needle or a label without storing
  // a 10-25 MB camera original. Skipped when it would equal the analysis
  // copy (small photos skip resizing entirely).
  const zoom = await resizeImageForUpload(file, 2560, 0.85);
  if (zoom !== resized && zoom.size <= 10 * 1024 * 1024) {
    formData.append("original", zoom, zoom.name);
  }
  if (photoLocation) formData.append("photo_location", photoLocation);
  if (integrity.sha256) formData.append("original_sha256", integrity.sha256);
  if (integrity.lat !== null) formData.append("exif_lat", String(integrity.lat));
  if (integrity.lng !== null) formData.append("exif_lng", String(integrity.lng));
  if (integrity.takenAt) formData.append("exif_taken_at", integrity.takenAt);

  input.onSaving?.();
  const res = await fetch("/api/photos/upload", { method: "POST", body: formData });
  const json = (await res.json().catch(() => ({}))) as UploadPhotoResult["json"];
  return { httpOk: res.ok, status: res.status, json };
}
