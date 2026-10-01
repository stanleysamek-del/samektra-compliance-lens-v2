"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSchedule(form: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const date = String(form.get("next_due") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || name.length > 160)
    redirect("/schedules?error=Check%20the%20name%20and%20due%20date");
  const { error } = await db
    .from("inspection_schedules")
    .insert({
      name,
      source_inspection_id: form.get("source_inspection_id"),
      cadence: form.get("cadence"),
      next_due: date,
      anchor_day: Number(date.slice(-2)),
      created_by: user.id,
    });
  if (error)
    redirect(
      `/schedules?error=${encodeURIComponent("Could not save schedule. Check your editing access and setup.")}`,
    );
  revalidatePath("/schedules");
}
export async function startSchedule(form: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await db.rpc("start_scheduled_inspection", {
    _schedule_id: form.get("id"),
    _expected_due: form.get("due"),
  });
  if (error || !data) {
    if (error) console.error("[startSchedule]", error);
    // P0001 = a deliberate `raise exception` in the RPC (e.g. "not due
    // yet") — that text is written for users. Anything else is internal.
    const message =
      error?.code === "P0001" && error.message
        ? error.message
        : "Couldn't start the inspection. Refresh and try again.";
    redirect(`/schedules?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/schedules");
  redirect(`/inspections/${data}`);
}
export async function toggleSchedule(form: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await db
    .from("inspection_schedules")
    .update({ enabled: form.get("enabled") === "true" })
    .eq("id", form.get("id"))
    .select("id")
    .maybeSingle();
  if (error || !data)
    redirect("/schedules?error=Schedule%20could%20not%20be%20changed");
  revalidatePath("/schedules");
}
