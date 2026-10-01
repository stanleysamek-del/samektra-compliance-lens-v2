"use client";

import { useTransition } from "react";
import { assignPhotoToSection } from "@/app/inspections/[id]/actions";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { FolderIcon, CaretIcon, moveChipClass } from "@/components/move-menu-parts";

type SectionOption = {
  id: string;
  name: string;
};

type Props = {
  photoId: string;
  inspectionId: string;
  currentSectionId: string | null;
  sections: SectionOption[];
};

/**
 * Tiny "Move to" dropdown rendered on each photo card. Shows the current
 * section (or "Unassigned") and lets the inspector move the photo to any
 * existing section, or detach it back to unassigned. Submission goes
 * through the server action and revalidates the inspection page.
 */
export function PhotoMoveMenu({
  photoId,
  inspectionId,
  currentSectionId,
  sections,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const currentName =
    sections.find((s) => s.id === currentSectionId)?.name ?? "Unassigned";

  function move(sectionId: string | null) {
    const fd = new FormData();
    fd.append("photo_id", photoId);
    fd.append("inspection_id", inspectionId);
    fd.append("section_id", sectionId ?? "none");
    startTransition(async () => {
      await assignPhotoToSection(fd);
    });
  }

  // No sections AND already unassigned → no menu needed.
  if (sections.length === 0 && currentSectionId === null) {
    return null;
  }

  return (
    <Menu
      label={`Move photo to a section (currently ${currentName})`}
      title="Move this photo to a section"
      disabled={isPending}
      triggerClassName={moveChipClass}
      trigger={
        <>
          <FolderIcon /> <span className="max-w-[140px] truncate">{isPending ? "Moving…" : currentName}</span>
          <CaretIcon />
        </>
      }
    >
      <MenuLabel>Move to section</MenuLabel>
      <MenuItem selected={currentSectionId === null} onSelect={() => move(null)}>
        Unassigned
      </MenuItem>
      {sections.length > 0 ? <MenuSeparator /> : null}
      {sections.map((s) => (
        <MenuItem key={s.id} selected={s.id === currentSectionId} onSelect={() => move(s.id)}>
          <span className="truncate">{s.name}</span>
        </MenuItem>
      ))}
    </Menu>
  );
}
