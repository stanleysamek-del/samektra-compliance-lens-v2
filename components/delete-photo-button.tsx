"use client";

import { useTransition } from "react";
import { deletePhoto } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { showToast } from "@/components/toaster";

/**
 * Delete-photo control. Confirms with the finding count (deleting a photo
 * cascades its findings), then calls the server action. On success the
 * action redirects back to the inspection; on failure it returns
 * `{ ok: false, error }` and we toast it — the user stays on the page with
 * the photo intact.
 */
export function DeletePhotoButton({
  photoId,
  inspectionId,
  findingsCount,
}: {
  photoId: string;
  inspectionId: string;
  findingsCount: number;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const what =
      findingsCount === 0
        ? "Delete this photo?"
        : `Delete this photo and its ${findingsCount} finding${findingsCount === 1 ? "" : "s"}?`;
    if (!window.confirm(`${what} This cannot be undone.`)) return;
    startTransition(async () => {
      const res = (await deletePhoto(photoId, inspectionId)) as
        | { ok: boolean; error?: string }
        | undefined;
      if (res && res.ok === false) {
        showToast({
          kind: "error",
          message: res.error ?? "Couldn't delete the photo. Try again.",
        });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-busy={isPending}
      className="cl-btn-outline"
    >
      {isPending ? "Deleting…" : "Delete photo"}
    </button>
  );
}
