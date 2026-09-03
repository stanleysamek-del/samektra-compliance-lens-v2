import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardTitle } from "@/components/card";
import { InspectionPlanCard } from "@/components/plans/inspection-plan-card";
import { numberFindings } from "@/components/plans/pin-numbering";
import {
  PIN_SELECT,
  PLAN_SELECT,
  toPinRow,
  type PinRow,
  type PlanRow,
  type ViewerPin,
} from "@/components/plans/types";

/* =====================================================================
 * InspectionPlansSection — SERVER component, self-contained.
 *
 * Mount on the inspection page as
 *   <InspectionPlansSection inspectionId={inspection.id} facilityId={inspection.facility_id ?? null} />
 * It loads everything it needs itself (plans, this inspection's pins,
 * findings + photos for numbering, the caller's write permission) and
 * degrades to a small card when the inspection has no facility, the
 * facility has no plans, or migration 0025 hasn't been applied yet.
 * ===================================================================== */

type Props = {
  inspectionId: string;
  facilityId: string | null | undefined;
  /** Force read-only (e.g. completed inspection). When omitted the
   *  section derives it from the inspection status + the caller's org
   *  role. */
  readOnly?: boolean;
  /** Pin to open on load (`?pin=<id>` style deep links). */
  highlightPinId?: string | null;
};

export async function InspectionPlansSection({
  inspectionId,
  facilityId,
  readOnly,
  highlightPinId,
}: Props) {
  if (!facilityId) {
    return (
      <Card>
        <CardTitle>Plan markup</CardTitle>
        <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
          No facility linked — set one to mark findings on the life safety
          plan.{" "}
          <Link
            href={`/inspections/${inspectionId}/edit`}
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Edit inspection →
          </Link>
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [plansRes, pinsRes, findingsRes, photosRes, inspectionRes] =
    await Promise.all([
      supabase
        .from("facility_plans")
        .select(PLAN_SELECT)
        .eq("facility_id", facilityId)
        .order("sort", { ascending: true })
        .order("page", { ascending: true }),
      supabase
        .from("plan_pins")
        .select(PIN_SELECT)
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("findings")
        .select("id, title, severity, photo_id, created_at")
        .eq("inspection_id", inspectionId),
      supabase
        .from("photos")
        .select("id, photo_location, created_at")
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("inspections")
        .select("status, organization_id")
        .eq("id", inspectionId)
        .maybeSingle(),
    ]);

  if (plansRes.error) {
    // Pre-migration (0025 not applied) or transient — never break the page.
    console.warn("[InspectionPlansSection] plans query failed:", plansRes.error.message);
    return null;
  }
  const plans = (plansRes.data ?? []) as PlanRow[];

  if (plans.length === 0) {
    return (
      <Card>
        <CardTitle>Plan markup</CardTitle>
        <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
          This facility has no life-safety plan yet. Upload one once and every
          inspection at the facility can mark findings on it.{" "}
          <Link
            href={`/facilities/${facilityId}`}
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Upload a plan →
          </Link>
        </p>
      </Card>
    );
  }

  // Write permission: not completed, and not a viewer in the org.
  let writable = readOnly === undefined ? true : !readOnly;
  if (readOnly === undefined) {
    const status = inspectionRes.data?.status as string | undefined;
    if (status === "completed") writable = false;
    const orgId = (inspectionRes.data?.organization_id as string | null) ?? null;
    if (writable && orgId) {
      const { data: me } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (me?.role === "viewer") writable = false;
    }
  }

  const pins: PinRow[] = pinsRes.error
    ? []
    : ((pinsRes.data ?? []) as Record<string, unknown>[]).map(toPinRow);

  const findings = (findingsRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    severity: "Low" | "Medium" | "High" | null;
    photo_id: string | null;
    created_at: string | null;
  }>;
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const numberById = numberFindings(findings);

  const photos = (photosRes.data ?? []) as Array<{
    id: string;
    photo_location: string | null;
    created_at: string;
  }>;
  const photoIndexById = new Map<string, number>();
  photos.forEach((p, i) => photoIndexById.set(p.id, i + 1));
  const photoById = new Map(photos.map((p) => [p.id, p]));

  const viewerPinsByPlan = new Map<string, ViewerPin[]>();
  for (const pin of pins) {
    const list = viewerPinsByPlan.get(pin.plan_id) ?? [];
    list.push(toViewerPin(pin, inspectionId, findingById, numberById, photoById, photoIndexById));
    viewerPinsByPlan.set(pin.plan_id, list);
  }

  // Signed URLs, 60 minutes, one per plan.
  const signedPlans: Array<{
    id: string;
    name: string;
    url: string;
    width: number | null;
    height: number | null;
  }> = [];
  for (const p of plans) {
    const { data: signed } = await supabase.storage
      .from("drawings")
      .createSignedUrl(p.storage_path, 60 * 60);
    if (!signed?.signedUrl) continue;
    signedPlans.push({
      id: p.id,
      name: p.name,
      url: signed.signedUrl,
      width: p.width,
      height: p.height,
    });
  }

  const totalPins = pins.length;

  return (
    <section className="flex flex-col gap-3" id="plan-markup">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Plan markup · {totalPins} pin{totalPins === 1 ? "" : "s"}
        </h2>
        <Link
          href={`/facilities/${facilityId}`}
          className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Manage plans →
        </Link>
      </div>
      {totalPins === 0 ? (
        <p className="px-1 text-xs text-[var(--fg-subtle)]">
          No pins yet. Open a finding and tap &ldquo;Place on plan&rdquo; to
          mark where it is.
        </p>
      ) : null}
      {signedPlans.map((plan) => {
        const planPins = viewerPinsByPlan.get(plan.id) ?? [];
        // Plans without pins collapse so a 6-page set doesn't dominate the page.
        const open = planPins.length > 0;
        return (
          <details key={plan.id} className="cl-card group" open={open}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-[var(--fg)]">{plan.name}</span>
                <span className="shrink-0 text-xs text-[var(--fg-subtle)]">
                  {planPins.length} pin{planPins.length === 1 ? "" : "s"}
                </span>
              </span>
              <span
                aria-hidden
                className="shrink-0 text-[var(--fg-subtle)] transition group-open:rotate-90"
              >
                ›
              </span>
            </summary>
            <div className="border-t border-[var(--border)] px-5 pb-5 pt-4 sm:px-6">
              <InspectionPlanCard
                plan={plan}
                pins={planPins}
                readOnly={!writable}
                highlightPinId={
                  highlightPinId && planPins.some((p) => p.id === highlightPinId)
                    ? highlightPinId
                    : null
                }
              />
            </div>
          </details>
        );
      })}
    </section>
  );
}

/* --------------------------------------------------------------------- */

function toViewerPin(
  pin: PinRow,
  inspectionId: string,
  findingById: Map<
    string,
    {
      id: string;
      title: string | null;
      severity: "Low" | "Medium" | "High" | null;
      photo_id: string | null;
    }
  >,
  numberById: Map<string, number>,
  photoById: Map<string, { id: string; photo_location: string | null }>,
  photoIndexById: Map<string, number>,
): ViewerPin {
  if (pin.kind === "finding" && pin.finding_id) {
    const f = findingById.get(pin.finding_id);
    const photoId = f?.photo_id ?? pin.photo_id;
    const photoIdx = photoId ? photoIndexById.get(photoId) : undefined;
    return {
      id: pin.id,
      kind: "finding",
      x: pin.x,
      y: pin.y,
      label: pin.label,
      number: numberById.get(pin.finding_id) ?? null,
      title: f?.title ?? "Finding",
      subtitle: [f?.severity, photoIdx ? `Photo ${photoIdx}` : null]
        .filter(Boolean)
        .join(" · "),
      href: photoId
        ? `/inspections/${inspectionId}/photos/${photoId}#finding-${pin.finding_id}`
        : null,
      severity: f?.severity ?? null,
    };
  }
  if (pin.kind === "photo" && pin.photo_id) {
    const p = photoById.get(pin.photo_id);
    const idx = photoIndexById.get(pin.photo_id);
    return {
      id: pin.id,
      kind: "photo",
      x: pin.x,
      y: pin.y,
      label: pin.label,
      number: null,
      title: p?.photo_location || (idx ? `Photo ${idx}` : "Photo"),
      subtitle: idx ? `Photo ${idx}` : "Photo",
      href: `/inspections/${inspectionId}/photos/${pin.photo_id}`,
    };
  }
  return {
    id: pin.id,
    kind: pin.kind,
    x: pin.x,
    y: pin.y,
    label: pin.label,
    number: null,
    title: pin.label ?? (pin.kind === "device" ? "Device" : "Note"),
    subtitle: pin.kind === "device" ? "Device" : "Note",
    href: null,
  };
}
