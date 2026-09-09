import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/assets/barcode-scanner";
import { ReportImporter } from "@/components/assets/report-importer";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ASSET_TYPES, assetTypeLabel } from "@/lib/assets";
import { createAsset } from "./actions";
import { SubmitButton } from "@/components/submit-button";
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    barcode?: string;
    facility?: string;
    scan?: string;
    error?: string;
  }>;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  let query = db
    .from("assets")
    .select(
      "id,facility_id,label,type,barcode,location_text,status,next_due_at",
    )
    .order("next_due_at", { nullsFirst: false })
    .limit(200);
  if (params.facility) query = query.eq("facility_id", params.facility);
  if (params.barcode) query = query.eq("barcode", params.barcode);
  const { data: assets, error } = await query;
  const { data: facilities } = await db
    .from("facilities")
    .select("id,name")
    .order("name");
  if (
    params.scan === "1" &&
    params.facility &&
    params.barcode &&
    assets?.length === 1
  )
    redirect(`/assets/${assets[0].id}`);
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
        <h1 className="text-3xl font-semibold">Equipment register</h1>
        <p>
          Track equipment by facility and barcode. Keep dated check records and
          the next due date without spending AI credits.
        </p>
        {(error || params.error) && (
          <p role="alert">
            {params.error ??
              "Equipment storage is not installed yet. Contact your administrator."}
          </p>
        )}
        <BarcodeScanner
          facilities={facilities ?? []}
          initialFacility={params.facility}
        />
        <ReportImporter
          facilities={facilities ?? []}
          initialFacility={params.facility}
        />
        <form className="flex flex-wrap gap-2">
          <select
            name="facility"
            aria-label="Search building"
            defaultValue={params.facility ?? ""}
            className="cl-input"
          >
            <option value="">All accessible buildings</option>
            {(facilities ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <input
            name="barcode"
            aria-label="Exact barcode"
            placeholder="Enter an exact barcode"
            defaultValue={params.barcode}
            className="cl-input"
          />
          <button className="cl-btn-outline">Find equipment</button>
          <Link href="/assets" className="cl-btn-outline">
            Clear
          </Link>
        </form>
        <details
          open={params.scan === "1" && !assets?.length}
          className="rounded-xl border p-5"
        >
          <summary className="cursor-pointer font-semibold">
            Register equipment
          </summary>
          <form action={createAsset} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              Facility
              <select
                name="facility_id"
                defaultValue={params.facility}
                required
                className="cl-input"
              >
                {(facilities ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select name="type" className="cl-input">
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {assetTypeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Equipment label
              <input
                name="label"
                required
                maxLength={160}
                placeholder="FE-2W-014"
                className="cl-input"
              />
            </label>
            <label>
              Barcode
              <input
                name="barcode"
                defaultValue={params.barcode}
                maxLength={160}
                className="cl-input"
              />
            </label>
            <label>
              Location
              <input name="location" maxLength={500} className="cl-input" />
            </label>
            <label>
              Next due date
              <input name="next_due" type="date" className="cl-input" />
            </label>
            <SubmitButton disabled={!!error || !facilities?.length}>
              Save equipment
            </SubmitButton>
          </form>
        </details>
        <ul className="space-y-3">
          {(assets ?? []).map((a) => (
            <li key={a.id} className="rounded-xl border p-4">
              <Link
                href={`/assets/${a.id}`}
                className="font-semibold underline"
              >
                {a.label ?? a.barcode ?? assetTypeLabel(a.type)}
              </Link>
              <p>
                {assetTypeLabel(a.type)} ?{" "}
                {a.location_text ?? "Location not set"} ?{" "}
                {a.status.replaceAll("_", " ")}
              </p>
              <p>
                {a.next_due_at
                  ? `${a.next_due_at.slice(0, 10) < today ? "Overdue" : "Due"}: ${a.next_due_at.slice(0, 10)}`
                  : "No due date set"}
              </p>
            </li>
          ))}
        </ul>
        {!assets?.length && !error && (
          <p>
            No equipment matches. Register your first item or clear the barcode
            search.
          </p>
        )}
        {assets?.length === 200 && (
          <p>
            Showing the first 200 items. Use the barcode search to find a
            specific item.
          </p>
        )}
      </div>
    </AppShell>
  );
}
