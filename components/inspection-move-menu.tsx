"use client";

import { useTransition } from "react";
import { assignInspectionToFolder } from "@/app/inspections/folders/actions";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { FolderIcon, CaretIcon, moveChipClass } from "@/components/move-menu-parts";

type FolderOption = { id: string; name: string };

type Props = {
  inspectionId: string;
  currentFolderId: string | null;
  folders: FolderOption[];
};

/**
 * "Move to group" dropdown rendered on each inspection card on the
 * inspections list page. Same UX shape as PhotoMoveMenu — pick a
 * destination, action runs, page revalidates.
 */
export function InspectionMoveMenu({
  inspectionId,
  currentFolderId,
  folders,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const currentName =
    folders.find((f) => f.id === currentFolderId)?.name ?? "Unfiled";

  function move(folderId: string | null) {
    const fd = new FormData();
    fd.append("inspection_id", inspectionId);
    fd.append("folder_id", folderId ?? "none");
    startTransition(async () => {
      await assignInspectionToFolder(fd);
    });
  }

  if (folders.length === 0 && currentFolderId === null) {
    return null;
  }

  return (
    <Menu
      label={`Move to group (currently ${currentName})`}
      title="Move this inspection to a group"
      disabled={isPending}
      triggerClassName={moveChipClass}
      trigger={
        <>
          <FolderIcon /> <span className="max-w-[140px] truncate">{isPending ? "Moving…" : currentName}</span>
          <CaretIcon />
        </>
      }
    >
      <MenuLabel>Move to group</MenuLabel>
      <MenuItem selected={currentFolderId === null} onSelect={() => move(null)}>
        Unfiled
      </MenuItem>
      {folders.length > 0 ? <MenuSeparator /> : null}
      {folders.map((f) => (
        <MenuItem key={f.id} selected={f.id === currentFolderId} onSelect={() => move(f.id)}>
          <span className="truncate">{f.name}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}
