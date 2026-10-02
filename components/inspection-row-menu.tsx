"use client";

import { useRef } from "react";
import { deleteInspection } from "@/app/inspections/[id]/actions";
import { Menu, MenuItem, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { confirmDialog } from "@/components/ui/confirm-dialog";

import { Ellipsis } from "lucide-react";
type Props = {
  inspectionId: string;
  facilityName: string;
};

/**
 * Three-dot row action menu (Open / Edit / Delete) — iAuditor-style.
 * Delete asks first, then submits the hidden form so the server action's
 * redirect (History's "Deleted <facility>" banner) still applies.
 */
export function InspectionRowMenu({ inspectionId, facilityName }: Props) {
  const deleteForm = useRef<HTMLFormElement>(null);

  async function remove() {
    const ok = await confirmDialog({
      title: `Delete "${facilityName}"?`,
      message: "This permanently removes all photos and findings. It cannot be undone.",
      confirmLabel: "Delete inspection",
      tone: "danger",
    });
    if (ok) deleteForm.current?.requestSubmit();
  }

  return (
    <>
      <Menu
        label="Inspection actions"
        width="w-48"
        triggerClassName="flex h-11 w-11 items-center justify-center rounded text-[var(--fg-muted)] transition hover:bg-[var(--paper-3)] hover:text-[var(--fg)]"
        trigger={
          <Ellipsis size={18} aria-hidden />
        }
      >
        <MenuLink href={`/inspections/${inspectionId}`}>Open</MenuLink>
        <MenuLink href={`/inspections/${inspectionId}/edit`}>Edit details</MenuLink>
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={remove}>
          Delete
        </MenuItem>
      </Menu>
      {/* Lives outside the menu so it still exists after the menu closes. */}
      <form ref={deleteForm} action={deleteInspection} hidden>
        <input type="hidden" name="inspection_id" value={inspectionId} />
        {/* deleteInspection redirects to this verbatim; History reads
            ?deleted= and shows the "Deleted <facility>" banner. */}
        <input
          type="hidden"
          name="redirect_to"
          value={`/inspections/history?deleted=${encodeURIComponent(facilityName)}`}
        />
      </form>
    </>
  );
}
