import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { PhotoUploader } from "@/components/photo-uploader";
import { AnalysisProgress } from "@/components/analysis-progress";
import { formatDuration } from "@/lib/format-duration";
import type { CompactFinding } from "@/components/photo-card-findings";
import { SectionsManager, type SectionRow } from "@/components/sections-manager";
import { ChecklistPanel } from "@/components/checklist-panel";
import type { LinkedFinding } from "@/components/checklist-item-row";
import type { OrgMember, ActionFields } from "@/components/action-strip";
import type { ActionStatus, ActionPriority } from "@/app/actions/workflow";
import { AttachChecklistCard, type TemplateOption } from "@/components/attach-checklist-card";
import { BUILTIN_TEMPLATES } from "@/lib/checklists/builtin-templates";
import {
  CHECKLIST_COLS,
  CHECKLIST_COLS_0034,
  isItemAnswered,
  isMissing0034,
  visibleItems,
  type ChecklistItemRow,
} from "@/lib/checklists/engine";
import type { NotVisibleItem } from "@/components/not-visible-checklist";
import { InspectionSummary } from "@/components/inspection-summary";
import { HelpTip } from "@/components/help-tip";
import { ExportButtons } from "@/components/export-buttons";
import { InspectionPlansSection } from "@/components/plans/inspection-plans-section";
import { scoreItems } from "@/lib/checklists/engine";
import { formatDate } from "@/lib/format-date";
import {
  InspectionSteps,
  StepFooter,
  isInspectionStep,
  type InspectionStep,
} from "@/components/inspection-steps";
import { PhotoGrid } from "./photo-grid";
import { ReviewStep, type ReviewFinding, type ReviewQuestion } from "./review-step";

/**
 * The inspection workspace, one step at a time (?step=):
 *
 *   info    details, edit, summary
 *   audit   the checklist — answer + evidence (photo, note, action) per question
 *   photos  photo walk: uploader, plans, sections, photo grid
 *   review  what still needs a human, sign-off, finalize / reopen
 *   report  downloads
 *
 * Each step loads only what it renders (signed photo URLs are the
 * expensive part, so only Photos — and Audit's question thumbnails —
 * create them).
 */

type SearchParams = {
  /** Set by finalizeInspection / reopenInspection when the update fails. */
  error?: string;
  /** Set by createInspection when the chosen template didn't attach. */
  checklist?: string;
  step?: string;
};

const SIGNED_URL_TTL = 60 * 60;

export default async function InspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  let stage = "params";
  try {
    const { id } = await params;
    const sp = await searchParams;
    const errorMessage = (sp?.error ?? "").trim();
    const checklistFailed = sp?.checklist === "failed";

    stage = "supabase-client";
    const supabase = await createClient();

    stage = "auth";
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    stage = "profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, organization")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) redirect("/onboarding");

    const userShell = {
      fullName: profile.full_name,
      organization: profile.organization,
      email: user.email ?? null,
    };

    stage = "inspection";
    const { data: inspection, error: inspectionErr } = await supabase
      .from("inspections")
      .select(
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at, updated_at, inspector_signed_at, manager_signed_at, inspector_signature_url, manager_signature_url",
      )
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      console.error(`[inspection ${id}] stage=${stage}`, inspectionErr);
      return <Diag user={userShell} stage={stage} />;
    }
    if (!inspection) {
      console.warn(`[inspection ${id}] not found or not visible to user ${user.id}`);
      return <Diag user={userShell} stage={stage} notFound />;
    }
    const isCompleted = inspection.status === "completed";

    // Facility + workspace (migration 0025). Separate defensive select so
    // the page keeps rendering before the migration exists.
    let facilityId: string | null = null;
    let inspectionOrgId: string | null = null;
    try {
      const { data: fac } = await supabase
        .from("inspections")
        .select("facility_id, organization_id")
        .eq("id", id)
        .maybeSingle();
      const row = fac as { facility_id?: string | null; organization_id?: string | null } | null;
      facilityId = row?.facility_id ?? null;
      inspectionOrgId = row?.organization_id ?? null;
    } catch {
      facilityId = null;
    }

    // Viewers see everything but change nothing (RLS denies the writes;
    // hiding the controls keeps them from failing on tap).
    let isViewer = false;
    if (inspectionOrgId) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", inspectionOrgId)
        .eq("user_id", user.id)
        .maybeSingle();
      isViewer = membership?.role === "viewer";
    }
    const readOnly = isCompleted || isViewer;

    stage = "photos";
    // analysis_status / analysis_error arrive with migration 0024. Before
    // it's applied the select errors on the unknown columns — re-select
    // without them and treat every photo as 'done'.
    const PHOTO_COLS =
      "id, storage_path, photo_location, analyzed_at, created_at, section_id, sort_order";
    let { data: photos, error: photosErr } = await supabase
      .from("photos")
      .select(`${PHOTO_COLS}, analysis_status, analysis_error`)
      .eq("inspection_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (photosErr && /analysis_status|analysis_error/.test(photosErr.message ?? "")) {
      ({ data: photos, error: photosErr } = (await supabase
        .from("photos")
        .select(PHOTO_COLS)
        .eq("inspection_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })) as unknown as {
        data: typeof photos;
        error: typeof photosErr;
      });
    }
    if (photosErr) console.error("[inspection] photos query", photosErr.message);
    type PhotoAnalysisState = "queued" | "analyzing" | "done" | "failed";
    const photosList = (photos ?? []).map((p) => ({
      ...p,
      analysis_status: String(
        (p as { analysis_status?: string | null }).analysis_status ?? "done",
      ) as PhotoAnalysisState,
      analysis_error:
        ((p as { analysis_error?: string | null }).analysis_error as string | null | undefined) ?? null,
    }));
    const analysisCounts = {
      queued: photosList.filter((p) => p.analysis_status === "queued").length,
      analyzing: photosList.filter((p) => p.analysis_status === "analyzing").length,
      failed: photosList.filter((p) => p.analysis_status === "failed").length,
    };
    const photoIds = photosList.map((p) => p.id);
    const storagePathById = new Map(photosList.map((p) => [p.id, p.storage_path as string]));

    stage = "checklist";
    // Checklist items (migration 0022). Errors degrade to "no checklist".
    let checklistItems: ChecklistItemRow[] = [];
    try {
      // With 0034's question types when available; older databases fall
      // back to the original columns (everything yes/no, optional).
      let { data: clData, error: clErr } = await supabase
        .from("inspection_checklist_items")
        .select(`${CHECKLIST_COLS}, ${CHECKLIST_COLS_0034}`)
        .eq("inspection_id", id)
        .order("sort", { ascending: true });
      if (clErr && isMissing0034(clErr)) {
        ({ data: clData, error: clErr } = (await supabase
          .from("inspection_checklist_items")
          .select(CHECKLIST_COLS)
          .eq("inspection_id", id)
          .order("sort", { ascending: true })) as unknown as { data: typeof clData; error: typeof clErr });
      }
      if (clErr) console.error("[inspection] checklist load", clErr.message);
      checklistItems = (clData as unknown as ChecklistItemRow[]) ?? [];
    } catch (err) {
      console.error("[inspection] checklist load", err);
    }
    const checklistScore = scoreItems(checklistItems);
    const answeredCount = checklistItems.length - checklistScore.unanswered;

    // "A1.3"-style labels, numbered within each section like the panel.
    const labelByItem = new Map<string, string>();
    {
      const seen = new Map<string, number>();
      for (const it of checklistItems) {
        const n = (seen.get(it.section_code) ?? 0) + 1;
        seen.set(it.section_code, n);
        labelByItem.set(it.id, `${it.section_code}.${n}`);
      }
    }

    // Which step. Default: the checklist while working; photos for a
    // photo-only walk; the report once finalized.
    const step: InspectionStep = isInspectionStep(sp?.step)
      ? sp.step
      : isCompleted
        ? "report"
        : checklistItems.length > 0
          ? "audit"
          : "photos";

    stage = "sections";
    const { data: sectionsData } = await supabase
      .from("inspection_sections")
      .select("id, name, sort_order")
      .eq("inspection_id", id)
      .order("sort_order", { ascending: true });
    const sectionsList = sectionsData ?? [];
    const sectionNameById = new Map<string, string>(sectionsList.map((s) => [s.id, s.name]));

    stage = "not-visible";
    // Re-photograph punch list. Needed on Photos (per-photo cards) and
    // Review (the list + the tab's issue count).
    const photoMetaById = new Map(
      photosList.map((p) => [p.id, { photo_location: p.photo_location ?? null, section_id: p.section_id ?? null }]),
    );
    let notVisibleItems: NotVisibleItem[] = [];
    if (photoIds.length > 0) {
      type NvRow = {
        id: string;
        item: string;
        reason: string | null;
        resolved: boolean | null;
        resolved_note?: string | null;
        resolved_at?: string | null;
        skipped?: boolean | null;
        skipped_reason?: string | null;
        skipped_at?: string | null;
        photo_id: string;
      };
      let nvRows: NvRow[] | null = null;
      const fullSelect = await supabase
        .from("not_visible")
        .select(
          "id, item, reason, resolved, resolved_note, resolved_at, skipped, skipped_reason, skipped_at, photo_id, created_at",
        )
        .in("photo_id", photoIds)
        .order("resolved", { ascending: true })
        .order("created_at", { ascending: true });
      if (fullSelect.error) {
        // Pre-0012/0013: legacy columns only (Resolve/Skip disabled).
        console.warn("[inspection] not_visible full select failed:", fullSelect.error.message);
        const legacy = await supabase
          .from("not_visible")
          .select("id, item, reason, resolved, photo_id, created_at")
          .in("photo_id", photoIds)
          .order("created_at", { ascending: true });
        if (legacy.error) console.error("[inspection] not_visible legacy select failed:", legacy.error.message);
        else nvRows = legacy.data as NvRow[] | null;
      } else {
        nvRows = fullSelect.data as NvRow[] | null;
      }
      notVisibleItems = (nvRows ?? []).map((r) => {
        const meta = photoMetaById.get(r.photo_id) ?? { photo_location: null, section_id: null };
        return {
          id: r.id,
          item: r.item ?? "",
          reason: r.reason ?? null,
          resolved: Boolean(r.resolved),
          resolved_note: r.resolved_note ?? null,
          resolved_at: r.resolved_at ?? null,
          skipped: Boolean(r.skipped),
          skipped_reason: r.skipped_reason ?? null,
          skipped_at: r.skipped_at ?? null,
          photo_id: r.photo_id,
          photo_location: meta.photo_location,
          section_name: meta.section_id ? (sectionNameById.get(meta.section_id) ?? null) : null,
        };
      });
    }
    const unresolvedNotVisibleCount = notVisibleItems.filter((n) => !n.resolved && !n.skipped).length;

    stage = "findings";
    // Every finding on the inspection — by inspection_id so findings raised
    // from a question without a photo count too. Action columns drive the
    // Audit step's action strips and Review's "without an owner" list.
    type FindingRow = {
      id: string;
      photo_id: string | null;
      title: string | null;
      severity: "Low" | "Medium" | "High";
      user_rating: number | null;
      cap_status: ActionStatus | null;
      priority: ActionPriority | null;
      cap_target_date: string | null;
      assigned_to: string | null;
      assigned_email: string | null;
      action_closed_at: string | null;
      closure_note: string | null;
      closure_photo_id: string | null;
    };
    const { data: findingsData, error: findingsErr } = await supabase
      .from("findings")
      .select(
        "id, photo_id, title, severity, user_rating, cap_status, priority, cap_target_date, assigned_to, assigned_email, action_closed_at, closure_note, closure_photo_id, created_at",
      )
      .eq("inspection_id", id)
      .order("created_at", { ascending: true });
    if (findingsErr) console.error("[inspection] findings query", findingsErr.message);
    const findingRows = (findingsData ?? []) as FindingRow[];

    const findingsByPhoto: Record<string, { total: number; high: number; items: CompactFinding[] }> = {};
    const counts = { total: 0, high: 0, medium: 0, low: 0, up: 0, down: 0 };
    for (const f of findingRows) {
      counts.total += 1;
      if (f.severity === "High") counts.high += 1;
      else if (f.severity === "Medium") counts.medium += 1;
      else counts.low += 1;
      if (f.user_rating === 1) counts.up += 1;
      else if (f.user_rating === -1) counts.down += 1;
      if (!f.photo_id) continue;
      const bucket = (findingsByPhoto[f.photo_id] ??= { total: 0, high: 0, items: [] });
      bucket.total += 1;
      if (f.severity === "High") bucket.high += 1;
      bucket.items.push({ id: f.id, title: f.title ?? "Untitled finding", severity: f.severity });
    }

    // Question ↔ finding links (one action per question).
    const itemByFinding = new Map<string, ChecklistItemRow>();
    for (const it of checklistItems) if (it.finding_id) itemByFinding.set(it.finding_id, it);

    const isOpenAction = (f: FindingRow) =>
      f.cap_status === null || f.cap_status === "open" || f.cap_status === "in_progress";
    const ownerless: ReviewFinding[] = findingRows
      .filter((f) => isOpenAction(f) && !f.assigned_to && !f.assigned_email)
      .map((f) => {
        const item = itemByFinding.get(f.id);
        return {
          id: f.id,
          title: f.title ?? "Untitled finding",
          severity: f.severity,
          href: item
            ? `/inspections/${id}?step=audit#q-${item.id}`
            : f.photo_id
              ? `/inspections/${id}/photos/${f.photo_id}#finding-${f.id}`
              : `/inspections/${id}?step=audit`,
        };
      });

    const applicable = visibleItems(checklistItems);
    const unanswered: ReviewQuestion[] = applicable
      .filter((i) => !isItemAnswered(i))
      .map((i) => ({
        id: i.id,
        label: labelByItem.get(i.id) ?? "",
        question: i.question,
        required: Boolean(i.required),
      }));
    const aiToConfirm: ReviewQuestion[] = checklistItems
      .filter((i) => i.answered_by_ai && !i.ai_confirmed)
      .map((i) => ({ id: i.id, label: labelByItem.get(i.id) ?? "", question: i.question }));
    const reviewIssues =
      unanswered.length + aiToConfirm.length + ownerless.length + unresolvedNotVisibleCount;

    // ---- Step-specific loads -------------------------------------------

    // Audit: linked findings with action fields, the member directory for
    // assignment, and thumbnails for photos linked to questions.
    const linkedFindings: Record<string, LinkedFinding> = {};
    let members: OrgMember[] = [];
    const questionPhotoUrls: Record<string, string> = {};
    let templateOptions: TemplateOption[] = [];
    if (step === "audit") {
      for (const f of findingRows) {
        if (!itemByFinding.has(f.id)) continue;
        const action: ActionFields = {
          cap_status: f.cap_status,
          priority: f.priority,
          cap_target_date: f.cap_target_date,
          assigned_to: f.assigned_to,
          assigned_email: f.assigned_email,
          action_closed_at: f.action_closed_at,
          closure_note: f.closure_note,
          closure_photo_id: f.closure_photo_id,
        };
        linkedFindings[f.id] = {
          id: f.id,
          title: f.title ?? "Untitled finding",
          severity: f.severity,
          action,
        };
      }
      if (inspectionOrgId) {
        const { data: directory } = await supabase.rpc("org_member_directory", {
          _org_id: inspectionOrgId,
        });
        members = (directory ?? []) as OrgMember[];
      }
      const linkedPhotoIds = Array.from(
        new Set(checklistItems.map((i) => i.photo_id).filter((p): p is string => Boolean(p))),
      );
      const paths = linkedPhotoIds
        .map((pid) => [pid, storagePathById.get(pid)] as const)
        .filter((x): x is readonly [string, string] => Boolean(x[1]));
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("photos")
          .createSignedUrls(paths.map(([, p]) => p), SIGNED_URL_TTL);
        (signed ?? []).forEach((s, i) => {
          if (s.signedUrl) questionPhotoUrls[paths[i][0]] = s.signedUrl;
        });
      }
      if (checklistItems.length === 0 && !readOnly) {
        const { data: customTemplates } = await supabase
          .from("checklist_templates")
          .select("id, name")
          .order("name");
        templateOptions = [
          ...BUILTIN_TEMPLATES.map((t) => ({
            id: t.id,
            name: `${t.name} (${t.occupancy})`,
            group: "standard" as const,
          })),
          ...(customTemplates ?? []).map((t) => ({
            id: t.id as string,
            name: t.name as string,
            group: "custom" as const,
          })),
        ];
      }
    }

    // Photos: signed URLs (batched), barcode originals, AI timings, and
    // whether AI analysis starts switched on.
    const photoUrls: Record<string, string> = {};
    const barcodePhotoUrls: Record<string, string> = {};
    const aiDurationByPhoto: Record<string, number> = {};
    let totalAiDurationMs = 0;
    let aiAvailable = false;
    if (step === "photos" && photosList.length > 0) {
      stage = "signed-urls";
      const { data: signed } = await supabase.storage
        .from("photos")
        .createSignedUrls(photosList.map((p) => p.storage_path as string), SIGNED_URL_TTL);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) photoUrls[photosList[i].id] = s.signedUrl;
      });
      const { data: originalRows } = await supabase
        .from("photos")
        .select("id, original_storage_path")
        .eq("inspection_id", id);
      const originals = (originalRows ?? []).filter(
        (r): r is { id: string; original_storage_path: string } => Boolean(r.original_storage_path),
      );
      if (originals.length > 0) {
        const { data: signedOriginals } = await supabase.storage
          .from("photos")
          .createSignedUrls(originals.map((o) => o.original_storage_path), SIGNED_URL_TTL);
        (signedOriginals ?? []).forEach((s, i) => {
          if (s.signedUrl) barcodePhotoUrls[originals[i].id] = s.signedUrl;
        });
      }
      // Latest successful analysis per photo (re-analyses overwrite).
      const { data: aiCalls } = await supabase
        .from("ai_calls")
        .select("photo_id, duration_ms, created_at, status")
        .in("photo_id", photoIds)
        .eq("status", "success")
        .order("created_at", { ascending: false });
      for (const call of aiCalls ?? []) {
        const pid = call.photo_id as string | null;
        if (!pid || pid in aiDurationByPhoto) continue;
        const dur = Number(call.duration_ms ?? 0);
        aiDurationByPhoto[pid] = dur;
        totalAiDurationMs += dur;
      }
    }
    if (step === "photos" && !readOnly) {
      try {
        const { data: allowance, error: allowanceErr } = await supabase.rpc("ai_allowance_summary", {
          _org_id: inspectionOrgId,
        });
        aiAvailable = !allowanceErr && Boolean((allowance as { active?: boolean } | null)?.active);
      } catch {
        aiAvailable = false;
      }
    }

    // Review: signed display URLs for existing signatures (private bucket).
    let inspectorSigUrl: string | null = null;
    let managerSigUrl: string | null = null;
    if (step === "review") {
      const sigPaths = [
        ["inspector", (inspection as { inspector_signature_url?: string | null }).inspector_signature_url],
        ["manager", (inspection as { manager_signature_url?: string | null }).manager_signature_url],
      ] as const;
      for (const [role, path] of sigPaths) {
        if (!path) continue;
        const { data } = await supabase.storage.from("signatures").createSignedUrl(path, SIGNED_URL_TTL);
        if (data?.signedUrl) {
          if (role === "inspector") inspectorSigUrl = data.signedUrl;
          else managerSigUrl = data.signedUrl;
        }
      }
    }

    const photoCountBySection = new Map<string, number>();
    for (const p of photosList) {
      if (p.section_id) photoCountBySection.set(p.section_id, (photoCountBySection.get(p.section_id) ?? 0) + 1);
    }
    const sectionsWithCounts: SectionRow[] = sectionsList.map((s) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      photoCount: photoCountBySection.get(s.id) ?? 0,
    }));
    const notVisibleByPhoto: Record<string, NotVisibleItem[]> = {};
    for (const it of notVisibleItems) (notVisibleByPhoto[it.photo_id] ??= []).push(it);

    stage = "render";
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <InspectionSteps
            inspectionId={inspection.id}
            current={step}
            title={inspection.facility_name}
            subtitle={inspection.location}
            status={inspection.status}
            answered={answeredCount}
            totalQuestions={checklistItems.length}
            scorePct={checklistScore.pct}
            photoCount={photosList.length}
            reviewIssues={reviewIssues}
          />

          {/* Finalize / reopen failure — the actions redirect here with ?error=. */}
          {errorMessage ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
              style={{ borderColor: "#b42318", background: "#fdecea", color: "#b42318" }}
            >
              <span>
                <strong className="font-semibold">That didn&apos;t save.</strong>{" "}
                {/* friendlyError() text; capped so a crafted ?error= can't fill the page. */}
                {errorMessage.slice(0, 240)}
              </span>
              <Link
                href={`/inspections/${inspection.id}?step=${step}`}
                className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
              >
                Dismiss
              </Link>
            </div>
          ) : null}

          {step === "info" ? (
            <>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--ink)]">Inspection details</h2>
                  {!readOnly ? (
                    <Link href={`/inspections/${inspection.id}/edit`} className="cl-btn-outline cl-btn-sm">
                      Edit details
                    </Link>
                  ) : null}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Field label="Facility" value={inspection.facility_name} />
                  <Field label="Location" value={inspection.location} />
                  <Field label="Inspector" value={inspection.inspector_name} />
                  <Field
                    label="Date"
                    value={inspection.date_of_inspection ? formatDate(inspection.date_of_inspection) : null}
                  />
                  <Field label="Manager" value={inspection.manager_assigned} />
                  <Field label="Address" value={inspection.facility_address} />
                  <Field label="Inspection type" value={checklistItems[0]?.template_name ?? "Photos only"} />
                </dl>
              </Card>
              <InspectionSummary
                photoCount={photosList.length}
                findings={{ total: counts.total, high: counts.high, medium: counts.medium, low: counts.low }}
                punchList={{
                  open: unresolvedNotVisibleCount,
                  resolved: notVisibleItems.filter((n) => n.resolved).length,
                  skipped: notVisibleItems.filter((n) => n.skipped && !n.resolved).length,
                }}
                ratings={{ thumbsUp: counts.up, thumbsDown: counts.down }}
                status={inspection.status}
                createdAt={inspection.created_at}
                updatedAt={inspection.updated_at}
                finalizedAt={
                  isCompleted ? (inspection.inspector_signed_at ?? inspection.updated_at) : null
                }
              />
            </>
          ) : null}

          {step === "audit" ? (
            checklistItems.length > 0 ? (
              <>
                <AnalysisProgress inspectionId={inspection.id} initial={analysisCounts} />
                <ChecklistPanel
                  inspectionId={inspection.id}
                  items={checklistItems}
                  readOnly={readOnly}
                  photoUrls={questionPhotoUrls}
                  linkedFindings={linkedFindings}
                  actionContext={{ members, currentUserId: user.id, readOnly: isViewer }}
                />
              </>
            ) : !readOnly ? (
              <>
                {checklistFailed ? (
                  <p
                    role="alert"
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "#b42318", background: "#fdecea", color: "#b42318" }}
                  >
                    The inspection was created, but its checklist didn&apos;t load. Pick the
                    inspection type again below.
                  </p>
                ) : null}
                <AttachChecklistCard inspectionId={inspection.id} templates={templateOptions} />
              </>
            ) : (
              <Card>
                <p className="text-sm text-[var(--fg-muted)]">
                  This inspection was a photo walk without a checklist.
                </p>
              </Card>
            )
          ) : null}

          {step === "photos" ? (
            <>
              {!readOnly ? (
                <>
                  <p className="-mb-2 px-1 text-xs text-[var(--fg-muted)]">
                    <strong className="font-semibold text-[var(--fg)]">Chip</strong> — the AI — reads
                    each photo and drafts findings with code citations. You confirm, correct, or add
                    your own. Photos for a single question are quicker from that question on Audit.
                  </p>
                  <PhotoUploader inspectionId={inspection.id} aiAvailable={aiAvailable} />
                </>
              ) : null}
              <AnalysisProgress inspectionId={inspection.id} initial={analysisCounts} />
              <InspectionPlansSection inspectionId={inspection.id} facilityId={facilityId} readOnly={readOnly} />
              <SectionsManager inspectionId={inspection.id} sections={sectionsWithCounts} readOnly={readOnly} />
              <PhotoGrid
                inspectionId={inspection.id}
                photosList={photosList}
                sectionsList={sectionsList}
                sectionOptions={sectionsList.map((s) => ({ id: s.id, name: s.name }))}
                findingsByPhoto={findingsByPhoto}
                photoUrls={photoUrls}
                barcodePhotoUrls={barcodePhotoUrls}
                aiDurationByPhoto={aiDurationByPhoto}
                notVisibleByPhoto={notVisibleByPhoto}
                isCompleted={readOnly}
              />
              {totalAiDurationMs > 0 ? (
                <p
                  className="px-1 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  title="Total time the AI spent analyzing photos on this inspection (most recent run per photo)"
                >
                  ⏱ Total AI analysis time · {formatDuration(totalAiDurationMs)}
                  {Object.keys(aiDurationByPhoto).length > 0
                    ? ` · avg ${formatDuration(totalAiDurationMs / Object.keys(aiDurationByPhoto).length)} per photo`
                    : ""}
                </p>
              ) : null}
            </>
          ) : null}

          {step === "review" ? (
            <ReviewStep
              inspectionId={inspection.id}
              isCompleted={isCompleted}
              readOnly={isViewer}
              unanswered={unanswered}
              aiToConfirm={aiToConfirm}
              ownerless={ownerless}
              notVisibleItems={notVisibleItems}
              analysis={analysisCounts}
              checklistTotal={checklistItems.length}
              signatures={{
                inspectorLabel: `Inspector${inspection.inspector_name ? ` — ${inspection.inspector_name}` : ""}`,
                managerLabel: `Manager${inspection.manager_assigned ? ` — ${inspection.manager_assigned}` : ""}`,
                inspectorUrl: inspectorSigUrl,
                managerUrl: managerSigUrl,
                inspectorSignedAt: inspection.inspector_signed_at,
                managerSignedAt: inspection.manager_signed_at,
              }}
              userId={user.id}
            />
          ) : null}

          {step === "report" ? (
            <Card>
              <h2 className="flex items-center gap-1.5 text-base font-semibold text-[var(--ink)]">
                Reports &amp; workbooks
                <HelpTip title="Reports">
                  The PDF report, corrective action plan (CAP), LSRA and ILSM
                  workbooks are built from the checklist, findings, actions,
                  plan pins and signatures.
                </HelpTip>
              </h2>
              {!isCompleted ? (
                <div className="mt-2 flex flex-col gap-3 rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[var(--fg-muted)]">
                    See the report as it stands. Every page is marked{" "}
                    <strong className="text-[var(--ink)]">DRAFT</strong> until you finalize; the
                    downloads below unlock then.{" "}
                    <Link href={`/inspections/${inspection.id}?step=review`} className="font-medium underline">
                      Review and finalize →
                    </Link>
                  </p>
                  <a
                    href={`/api/inspections/${inspection.id}/export/pdf?inline=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cl-btn-outline shrink-0"
                  >
                    Preview draft PDF ↗
                  </a>
                </div>
              ) : null}
              <div className="mt-3">
                <ExportButtons inspectionId={inspection.id} enabled={isCompleted} />
              </div>
            </Card>
          ) : null}

          <StepFooter inspectionId={inspection.id} current={step} />
          {/* Room for the floating "Next unanswered" button on Audit. */}
          {step === "audit" ? <div aria-hidden className="h-16" /> : null}
        </div>
      </AppShell>
    );
  } catch (err) {
    // Next.js implements redirect()/notFound() by THROWING — those must
    // propagate, or a plain redirect("/login") would render as an error.
    if (isNextControlFlowError(err)) throw err;
    // Raw error goes to the server log only — never to the screen.
    console.error(`[inspection] render failed at stage=${stage}`, err);
    return <Diag user={{ fullName: "—", organization: null, email: null }} stage={stage} />;
  }
}

/** redirect() / notFound() throw sentinel errors that Next handles upstream. */
function isNextControlFlowError(err: unknown): boolean {
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest ?? "")
      : "";
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}

/**
 * Friendly failure card. The raw Postgres / runtime message is logged
 * server-side by the caller; the user gets the stage as a support
 * reference, nothing more.
 */
function Diag({
  user,
  stage,
  notFound = false,
}: {
  user: { fullName: string; organization: string | null; email: string | null };
  stage: string;
  notFound?: boolean;
}) {
  return (
    <AppShell user={user}>
      <Card>
        <h2 className="font-semibold text-[var(--danger)]">
          {notFound ? "Inspection not found" : "Something went wrong loading this inspection"}
        </h2>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          {notFound
            ? "It may have been deleted, or it belongs to a workspace you're not currently in — check the workspace switcher in the header."
            : "Try again, or contact support with reference "}
          {notFound ? null : <code className="text-[var(--fg)]">{stage}</code>}
          {notFound ? null : "."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/inspections" className="cl-btn-outline">
            ← Back to inspections
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-[var(--fg)]">{value || "—"}</dd>
    </div>
  );
}
