import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSchedule, startSchedule, toggleSchedule } from "./actions";
import { SubmitButton } from "@/components/submit-button";
export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: schedules, error } = await db
    .from("inspection_schedules")
    .select("id,name,cadence,next_due,enabled")
    .order("next_due");
  const { data: sources } = await db
    .from("inspections")
    .select("id,facility_name,location")
    .order("created_at", { ascending: false })
    .limit(100);
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <AppShell
      user={{
        fullName: String(
          user.user_metadata?.full_name ?? user.email ?? "Inspector",
        ),
      }}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-5 py-10">
        <Link href="/inspections" className="underline">
          Back to inspections
        </Link>
        <h1 className="text-3xl font-semibold">Inspection schedule</h1>
        <p>
          Repeat a walkthrough using its questions and sections. Each occurrence
          starts with fresh answers and evidence; no AI is called until an
          authorized inspector requests it.
        </p>
        {(error || params.error) && (
          <p role="alert" className="rounded border p-3">
            {params.error ??
              "Scheduling is not installed yet. Existing inspections remain available."}
          </p>
        )}
        <form
          action={createSchedule}
          className="grid gap-3 rounded-xl border p-5 sm:grid-cols-2"
        >
          <label>
            Schedule name
            <input
              name="name"
              required
              maxLength={160}
              className="cl-input"
              placeholder="East wing monthly round"
            />
          </label>
          <label>
            Use questions from
            <select name="source_inspection_id" required className="cl-input">
              {(sources ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.facility_name} ? {s.location}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repeat
            <select name="cadence" className="cl-input">
              {["daily", "weekly", "monthly", "quarterly", "annual"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
          <label>
            First due date
            <input
              name="next_due"
              type="date"
              required
              defaultValue={today}
              className="cl-input"
            />
          </label>
          <SubmitButton
            disabled={!!error || !sources?.length}
            pendingLabel="Saving?"
          >
            Create schedule
          </SubmitButton>
        </form>
        <p className="text-sm">
          Choose frequencies required for your facility. Dates use UTC. Overdue
          occurrences stay visible until started; the app does not invent
          inspection requirements.
        </p>
        <ul className="space-y-3">
          {(schedules ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div>
                <h2 className="font-semibold">{s.name}</h2>
                <p>
                  {s.cadence} ? {s.next_due} ?{" "}
                  {!s.enabled
                    ? "Paused"
                    : s.next_due < today
                      ? "Overdue"
                      : s.next_due === today
                        ? "Due today"
                        : "Upcoming"}
                </p>
              </div>
              <div className="flex gap-3">
                <form action={startSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="due" value={s.next_due} />
                  <SubmitButton
                    disabled={!s.enabled || s.next_due > today}
                    pendingLabel="Starting?"
                  >
                    Start due inspection
                  </SubmitButton>
                </form>
                <form action={toggleSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!s.enabled)}
                  />
                  <SubmitButton>{s.enabled ? "Pause" : "Resume"}</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
        {!schedules?.length && !error && (
          <p>
            No schedules yet. Create one from a completed or in-progress
            inspection.
          </p>
        )}
      </div>
    </AppShell>
  );
}
