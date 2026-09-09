import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AssetPlan } from "@/components/assets/asset-plan";
import { PIN_SELECT, toPinRow } from "@/components/plans/types";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordCheck } from "../actions";
import { SubmitButton } from "@/components/submit-button";
export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: asset } = await db
    .from("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!asset) notFound();
  const { data: canWrite } = await db.rpc("can_write_facility", {
    _facility_id: asset.facility_id,
  });
  const { data: checks, error } = await db
    .from("asset_checks")
    .select("id,result,note,next_due,created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: pinRows } = await db
    .from("plan_pins")
    .select(PIN_SELECT)
    .eq("asset_id", id);
  const { data: facility } = await db
    .from("facilities")
    .select("name")
    .eq("id", asset.facility_id)
    .maybeSingle();
  return (
    <AppShell
      user={{
        fullName: String(
          user.user_metadata?.full_name ?? user.email ?? "Inspector",
        ),
      }}
    >
      <div className="mx-auto max-w-3xl space-y-6 p-5 py-10">
        <Link href="/assets" className="underline">
          Equipment register
        </Link>
        <h1 className="text-3xl font-semibold">
          {asset.label ?? asset.barcode ?? "Equipment"}
        </h1>
        <p>
          {asset.location_text} ? Barcode: {asset.barcode ?? "Not set"}
        </p>
        <p>
          Building: {facility?.name ?? "Unknown"}. {asset.manufacturer}{" "}
          {asset.model} {asset.serial && `Serial: ${asset.serial}`}
        </p>
        <AssetPlan
          assetId={id}
          facilityId={asset.facility_id}
          label={asset.label ?? asset.barcode ?? "Equipment"}
          initialPins={(pinRows ?? []).map(toPinRow)}
          canWrite={canWrite === true}
        />
        <p>
          Next due: {asset.next_due_at?.slice(0, 10) ?? "Not set"}. Equipment
          status: {asset.status.replaceAll("_", " ")}.
        </p>
        {(search.error || error) && (
          <p role="alert">
            {search.error ??
              "Check history is not installed yet. Contact your administrator."}
          </p>
        )}
        {canWrite === true && (
          <form
            action={recordCheck}
            className="space-y-3 rounded-xl border p-5"
          >
            <h2 className="text-xl font-semibold">Record an equipment check</h2>
            <input type="hidden" name="id" value={id} />
            <label className="block">
              Result
              <select name="result" className="cl-input">
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="not_tested">Not tested</option>
              </select>
            </label>
            <label className="block">
              Notes
              <textarea
                name="note"
                maxLength={4000}
                className="cl-input"
                placeholder="Required for failed or not-tested checks. Record the test performed and any limitations."
              />
            </label>
            <label className="block">
              Next due date
              <input
                name="next_due"
                type="date"
                defaultValue={asset.next_due_at?.slice(0, 10) ?? ""}
                className="cl-input"
              />
            </label>
            <p className="text-sm">
              Choose the next date from the applicable maintenance requirement.
              A failed check does not automatically declare equipment out of
              service.
            </p>
            <SubmitButton disabled={!!error || asset.status === "removed"}>
              Save check
            </SubmitButton>
          </form>
        )}
        <h2 className="text-xl font-semibold">Check history</h2>
        <ol className="space-y-3">
          {(checks ?? []).map((c) => (
            <li key={c.id} className="rounded border p-4">
              <strong>{c.result.replaceAll("_", " ")}</strong> ?{" "}
              {new Date(c.created_at)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}{" "}
              UTC<p>{c.note}</p>
              <p>
                Building: {facility?.name ?? "Unknown"}. {asset.manufacturer}{" "}
                {asset.model} {asset.serial && `Serial: ${asset.serial}`}
              </p>
              <AssetPlan
                assetId={id}
                facilityId={asset.facility_id}
                label={asset.label ?? asset.barcode ?? "Equipment"}
                initialPins={(pinRows ?? []).map(toPinRow)}
                canWrite={canWrite === true}
              />
              <p>Next due: {c.next_due ?? "Not specified"}</p>
            </li>
          ))}
        </ol>
        {!checks?.length && !error && <p>No checks recorded yet.</p>}
      </div>
    </AppShell>
  );
}
