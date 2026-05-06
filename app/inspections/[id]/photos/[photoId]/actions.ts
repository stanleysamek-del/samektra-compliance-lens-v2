"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FindingPatch = {
  title: string;
  category: string;
  code?: string;
  severity: "Low" | "Medium" | "High";
  description?: string;
  location?: string;
  remediation?: string;
};

export async function updateFinding(
  findingId: string,
  inspectionId: string,
  patch: FindingPatch,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("findings")
    .update({
      title: patch.title,
      category: patch.category,
      code: patch.code || null,
      severity: patch.severity,
      description: patch.description || null,
      location: patch.location || null,
      remediation: patch.remediation || null,
      edited: true,
    })
    .eq("id", findingId);

  if (error) {
    console.error("[updateFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
}

export async function deleteFinding(findingId: string, inspectionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("findings")
    .delete()
    .eq("id", findingId);

  if (error) {
    console.error("[deleteFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
}

export async function deletePhoto(
  photoId: string,
  storagePath: string,
  inspectionId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Findings cascade via photo_id ON DELETE SET NULL — manually clean them up.
  await supabase.from("findings").delete().eq("photo_id", photoId);
  await supabase.from("what_to_look_for").delete().eq("photo_id", photoId);
  await supabase.from("not_visible").delete().eq("photo_id", photoId);
  await supabase.from("photos").delete().eq("id", photoId);
  await supabase.storage.from("photos").remove([storagePath]);

  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}
