"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Status = "in_progress" | "completed";

export async function finalizeInspection(
  inspectionId: string,
  newStatus: Status,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("inspections")
    .update({ status: newStatus })
    .eq("id", inspectionId);

  if (error) {
    console.error("[finalizeInspection]", error);
    redirect(
      `/inspections/${inspectionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/inspections/${inspectionId}`);
}
