"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, Check, Flag, Pencil, Sparkles } from "lucide-react";
import { SeverityBadge } from "@/components/severity-badge";
import { severityColor, type Severity } from "@/lib/severity";

/**
 * Public, no-account demo: a short corridor round you can actually work —
 * answer questions, record a deficiency with a photo, note and action,
 * review, and see the report summary. Everything lives in this component's
 * state: nothing is sent anywhere, saved, or billed, and "Chip" here is a
 * scripted example (clearly labelled), not a live AI call.
 */

type Answer = "yes" | "no" | "na" | null;
type Step = "audit" | "review" | "report";

type Question = {
  id: string;
  label: string;
  q: string;
  ref?: string;
  type?: "yesno" | "number" | "text";
  unit?: string;
  required?: boolean;
  showIf?: { id: string; equals: "yes" | "no" };
  /** The first "No" is where the guided hint points. */
  scripted?: boolean;
};

const QUESTIONS: Question[] = [
  { id: "q1", label: "A1.1", q: "Corridors are clear of storage and obstructions.", ref: "NFPA 101 §7.1.10", required: true, scripted: true },
  { id: "q1b", label: "A1.2", q: "Describe what is stored and where.", type: "text", showIf: { id: "q1", equals: "no" } },
  { id: "q2", label: "A1.3", q: "Exit signs are illuminated and visible from the path of travel.", ref: "NFPA 101 §7.10" },
  { id: "q3", label: "A1.4", q: "Fire extinguishers are mounted, accessible and tagged this month.", ref: "NFPA 10" },
  { id: "q3p", label: "A1.5", q: "Gauge pressure on the corridor extinguisher.", type: "number", unit: "psi" },
  { id: "q4", label: "A1.6", q: "Stairwell doors self-close and positively latch.", ref: "NFPA 80" },
];

const PEOPLE = ["Unassigned", "J. Alvarez — Facilities", "M. Reyes — Safety officer"];
const DUE = [
  { label: "In 3 days", days: 3 },
  { label: "In 7 days", days: 7 },
  { label: "In 30 days", days: 30 },
];

type Action = { title: string; severity: Severity; owner: string; due: string | null };

export function DemoWalkthrough() {
  const [step, setStep] = useState<Step>("audit");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, boolean>>({});
  const [chip, setChip] = useState<Record<string, "idle" | "working" | "done">>({});
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [finalized, setFinalized] = useState(false);

  const visible = QUESTIONS.filter((q) => !q.showIf || answers[q.showIf.id] === q.showIf.equals);
  const isAnswered = (q: Question) =>
    q.type === "text" || q.type === "number" ? Boolean((values[q.id] ?? "").trim()) : Boolean(answers[q.id]);
  const yesNo = visible.filter((q) => !q.type || q.type === "yesno");
  const yes = yesNo.filter((q) => answers[q.id] === "yes").length;
  const no = yesNo.filter((q) => answers[q.id] === "no").length;
  const scored = yes + no;
  const pct = scored > 0 ? Math.round((yes / scored) * 1000) / 10 : null;
  const unanswered = visible.filter((q) => !isAnswered(q));
  const requiredMissing = unanswered.filter((q) => q.required);
  const actionList = Object.entries(actions);
  const ownerless = actionList.filter(([, a]) => a.owner === "Unassigned");
  const answered = visible.length - unanswered.length;
  const firstNoDone = Boolean(answers.q1);

  function answer(q: Question, a: "yes" | "no" | "na") {
    setAnswers((p) => ({ ...p, [q.id]: p[q.id] === a ? null : a }));
    if (a === "no") setNoteOpen((p) => ({ ...p, [q.id]: true }));
  }

  function askChip(id: string) {
    setChip((p) => ({ ...p, [id]: "working" }));
    window.setTimeout(() => setChip((p) => ({ ...p, [id]: "done" })), 1400);
  }

  function createAction(id: string, title: string, severity: Severity) {
    setActions((p) => ({ ...p, [id]: { title, severity, owner: "Unassigned", due: null } }));
  }

  function setDue(id: string, days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const text = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    setActions((p) => ({ ...p, [id]: { ...p[id], due: text } }));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5">
      {/* Honest framing, always visible. */}
      <p className="rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 py-2 text-xs text-[var(--fg-muted)]">
        <strong className="text-[var(--ink)]">Sample inspection.</strong> Nothing here is saved or sent anywhere,
        and &ldquo;Chip&rdquo; below is a prepared example, not a live AI call. In the real app Chip reads your
        photos; you always confirm the finding and the code.
      </p>

      <h1 className="mt-4 text-3xl text-[var(--ink)]">
        Try an <em>inspection</em>
      </h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        St. Anselm Regional Hospital · 5th floor, corridor 5-East. Work through it like you would on site.
      </p>

      {/* Step bar */}
      <div className="sticky top-0 z-20 -mx-4 mt-4 border-b border-[var(--ink)] bg-[var(--paper)]/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3 pt-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--paper-3)]"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={visible.length}
            aria-valuenow={answered}
          >
            <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${(answered / visible.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-[var(--fg-muted)]">
            {answered}/{visible.length} answered{pct !== null ? ` · Score ${pct}%` : ""}
          </span>
        </div>
        <nav aria-label="Demo steps" className="flex">
          {(["audit", "review", "report"] as Step[]).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              aria-current={step === s ? "step" : undefined}
              className={`flex min-h-11 items-center gap-1.5 border-b-[3px] px-3 text-sm transition ${
                step === s
                  ? "border-[var(--ink)] font-semibold text-[var(--ink)]"
                  : "border-transparent text-[var(--fg-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span aria-hidden className="text-xs text-[var(--fg-subtle)]">
                {i + 1}
              </span>
              {s === "audit" ? "Audit" : s === "review" ? "Review" : "Report"}
              {s === "review" && unanswered.length + ownerless.length > 0 ? (
                <span className="rounded-full bg-[#fdf3dc] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[#8a5300]">
                  {unanswered.length + ownerless.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {step === "audit" ? (
        <section className="mt-4 flex flex-col gap-3" aria-label="Checklist">
          {!firstNoDone ? (
            <p className="rounded bg-[var(--accent)]/10 px-3 py-2 text-sm font-medium text-[var(--accent)]">
              Start here: tap <strong>No</strong> on the first question to see how a deficiency is recorded.
            </p>
          ) : null}

          {visible.map((q) => {
            const a = answers[q.id] ?? null;
            const isNo = a === "no";
            const action = actions[q.id];
            return (
              <div
                key={q.id}
                className={`rounded border px-3 py-2.5 ${
                  isNo ? "border-[var(--danger)] bg-[#fdecea]" : "border-[var(--border)] bg-[var(--paper-2)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-[var(--fg)]">
                    <span className="mr-1.5 text-xs tabular-nums text-[var(--fg-subtle)]">{q.label}</span>
                    {q.q}
                    {q.required ? (
                      <span className="ml-1.5 whitespace-nowrap text-xs font-semibold text-[var(--danger)]">
                        <span aria-hidden>* </span>Required
                      </span>
                    ) : null}
                    {q.ref ? (
                      <span className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--fg-subtle)]">{q.ref}</span>
                    ) : null}
                  </p>

                  {q.type === "number" ? (
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`v-${q.id}`}>
                        {q.q}
                      </label>
                      <input
                        id={`v-${q.id}`}
                        inputMode="decimal"
                        className="cl-input w-32"
                        placeholder="0"
                        value={values[q.id] ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [q.id]: e.target.value }))}
                      />
                      <span className="text-sm text-[var(--fg-muted)]">{q.unit}</span>
                    </div>
                  ) : q.type === "text" ? (
                    <div className="w-full sm:max-w-xs">
                      <label className="sr-only" htmlFor={`v-${q.id}`}>
                        {q.q}
                      </label>
                      <textarea
                        id={`v-${q.id}`}
                        rows={2}
                        className="cl-input text-sm"
                        placeholder="e.g. Linen carts and boxes outside Rm 5-112"
                        value={values[q.id] ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [q.id]: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div role="group" aria-label={`Answer for ${q.label}`} className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto">
                      {(["yes", "no", "na"] as const).map((opt) => {
                        const active = a === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={active}
                            onClick={() => answer(q, opt)}
                            className={`min-h-11 rounded border px-3 text-sm font-semibold transition sm:min-w-[56px] ${
                              active
                                ? opt === "yes"
                                  ? "border-[var(--success)] bg-[var(--success)] text-white"
                                  : opt === "no"
                                    ? "border-[var(--danger)] bg-[var(--danger)] text-white"
                                    : "border-[var(--slate)] bg-[var(--slate)] text-white"
                                : "border-[var(--rule-strong)] bg-[var(--paper-2)] text-[var(--ink)] hover:bg-[var(--paper-3)]"
                            }`}
                          >
                            {active && opt === "yes" ? "✓ " : active && opt === "no" ? "✕ " : ""}
                            {opt === "na" ? "N.A." : opt === "yes" ? "Yes" : "No"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isNo ? (
                  <p className="mt-2 text-xs font-medium text-[var(--danger)]">
                    Record the deficiency: {(notes[q.id] ?? "").trim() ? "✓ " : ""}describe ·{" "}
                    {photos[q.id] ? "✓ " : ""}photo · {action ? "✓ " : ""}action
                  </p>
                ) : null}

                {isNo && noteOpen[q.id] ? (
                  <div className="mt-2 flex flex-col gap-1">
                    <label htmlFor={`n-${q.id}`} className="sr-only">
                      Note for {q.label}
                    </label>
                    <textarea
                      id={`n-${q.id}`}
                      rows={2}
                      className="cl-input text-sm"
                      placeholder="What's wrong, and where? e.g. Boxes stacked outside Rm 5-112"
                      value={notes[q.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [q.id]: e.target.value }))}
                    />
                  </div>
                ) : null}

                {/* Evidence: sample photo + scripted Chip analysis */}
                {isNo ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {photos[q.id] ? (
                      <div className="flex items-start gap-3">
                        <SamplePhoto />
                        <div className="min-w-0 flex-1">
                          {chip[q.id] === "done" ? (
                            <div className="rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] p-2 text-sm">
                              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                                <Sparkles size={14} aria-hidden /> Chip&apos;s draft finding (prepared example)
                              </p>
                              <p className="mt-1 font-medium text-[var(--ink)]">Stored boxes obstruct the corridor exit access</p>
                              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                                Likely cites NFPA 101 §7.1.10 — means of egress must be kept free of obstructions.
                                Verify the adopted edition locally. Remediation: remove the stored items and keep the
                                route clear.
                              </p>
                              {!action ? (
                                <button
                                  type="button"
                                  className="cl-btn-primary cl-btn-sm mt-2"
                                  onClick={() => createAction(q.id, "Stored boxes obstruct the corridor exit access", "Medium")}
                                >
                                  Use this finding as an action
                                </button>
                              ) : null}
                            </div>
                          ) : chip[q.id] === "working" ? (
                            <p role="status" className="text-sm text-[var(--fg-muted)]">
                              Chip is reading the photo…
                            </p>
                          ) : (
                            <button type="button" className="cl-btn-outline cl-btn-sm" onClick={() => askChip(q.id)}>
                              <Sparkles size={16} aria-hidden /> Ask Chip to draft the finding
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-1.5">
                      {!photos[q.id] ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-3)]"
                          onClick={() => setPhotos((p) => ({ ...p, [q.id]: true }))}
                        >
                          <Camera size={16} aria-hidden /> Add sample photo
                        </button>
                      ) : null}
                      {!noteOpen[q.id] ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-3)]"
                          onClick={() => setNoteOpen((p) => ({ ...p, [q.id]: true }))}
                        >
                          <Pencil size={16} aria-hidden /> Note
                        </button>
                      ) : null}
                      {!action ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1.5 rounded border border-[var(--danger)] bg-[var(--paper-2)] px-3 text-sm font-medium text-[var(--danger)] hover:bg-[#fdecea]"
                          onClick={() =>
                            createAction(q.id, (notes[q.id] ?? "").trim() || `Not compliant: ${q.q}`, "Medium")
                          }
                        >
                          <Flag size={16} aria-hidden /> Create action
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* The corrective action: owner + due date */}
                {isNo && action ? (
                  <div className="mt-2 rounded border border-[var(--border)] bg-[var(--paper-2)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={action.severity} size="sm" />
                      <span className="text-sm font-medium text-[var(--ink)]">{action.title}</span>
                    </div>
                    <div role="radiogroup" aria-label="Severity" className="mt-2 flex flex-wrap gap-1.5">
                      {(["High", "Medium", "Low"] as Severity[]).map((s) => {
                        const sev = severityColor(s);
                        const sel = action.severity === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => setActions((p) => ({ ...p, [q.id]: { ...p[q.id], severity: s } }))}
                            className="min-h-11 rounded-full border px-3 text-sm font-semibold"
                            style={
                              sel
                                ? { background: sev.solid, borderColor: sev.solid, color: sev.onSolid }
                                : { borderColor: "var(--rule-strong)", color: "var(--ink)" }
                            }
                          >
                            <span aria-hidden className="mr-1">
                              {sev.glyph}
                            </span>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="flex flex-col text-xs text-[var(--fg-muted)]">
                        Owner
                        <select
                          className="cl-input mt-1 text-sm"
                          value={action.owner}
                          onChange={(e) => setActions((p) => ({ ...p, [q.id]: { ...p[q.id], owner: e.target.value } }))}
                        >
                          {PEOPLE.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-col text-xs text-[var(--fg-muted)]">
                        Due
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {DUE.map((d) => (
                            <button
                              key={d.days}
                              type="button"
                              onClick={() => setDue(q.id, d.days)}
                              className="min-h-11 rounded border border-[var(--rule-strong)] px-3 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]"
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                        {action.due ? <span className="mt-1 text-[var(--ink)]">Due {action.due}</span> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="flex justify-end pt-2">
            <button type="button" className="cl-btn-primary" onClick={() => setStep("review")}>
              Review →
            </button>
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="mt-4 flex flex-col gap-4" aria-label="Review">
          {unanswered.length === 0 && ownerless.length === 0 ? (
            <p className="rounded border border-dashed border-[var(--rule-strong)] px-3 py-4 text-center text-sm text-[var(--fg-muted)]">
              Nothing left to review — every question is answered and every action has an owner.
            </p>
          ) : null}
          {requiredMissing.length > 0 ? (
            <ReviewList title="Required questions" urgent items={requiredMissing.map((q) => `${q.label} ${q.q}`)} help="Finalize stays off until these are answered." />
          ) : null}
          {unanswered.filter((q) => !q.required).length > 0 ? (
            <ReviewList title="Unanswered questions" items={unanswered.filter((q) => !q.required).map((q) => `${q.label} ${q.q}`)} help="An unanswered question shows as a gap on the report — it isn't counted as a pass." />
          ) : null}
          {ownerless.length > 0 ? (
            <ReviewList title="Actions without an owner" items={ownerless.map(([, a]) => a.title)} help="Assign an owner and due date so each finding becomes a tracked corrective action." />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="cl-btn-outline" onClick={() => setStep("audit")}>
              ← Back to the audit
            </button>
            <button
              type="button"
              className="cl-btn-primary"
              disabled={requiredMissing.length > 0}
              onClick={() => {
                setFinalized(true);
                setStep("report");
              }}
            >
              Finalize inspection
            </button>
          </div>
          {requiredMissing.length > 0 ? (
            <p className="text-xs text-[var(--danger)]">
              Answer the {requiredMissing.length} required question{requiredMissing.length === 1 ? "" : "s"} to finalize.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "report" ? (
        <section className="mt-4 flex flex-col gap-4" aria-label="Report">
          <div className="rounded border border-[var(--ink)] bg-[var(--paper-2)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              {finalized ? "Finalized" : "Draft"} · sample report
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">EOC / LS Inspection Report</h2>
            <p className="text-sm text-[var(--fg-muted)]">St. Anselm Regional Hospital · 5th floor, corridor 5-East</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Score" value={pct === null ? "—" : `${pct}%`} />
              <Stat label="Flagged" value={String(no)} />
              <Stat label="Actions" value={String(actionList.length)} />
            </dl>
            {actionList.length > 0 ? (
              <>
                <h3 className="mt-4 text-sm font-semibold text-[var(--ink)]">Corrective actions</h3>
                <ul className="mt-1 divide-y divide-[var(--rule-paper)]">
                  {actionList.map(([id, a]) => (
                    <li key={id} className="py-2 text-sm">
                      <div className="flex items-start gap-2">
                        <SeverityBadge severity={a.severity} size="sm" />
                        <span className="min-w-0 flex-1 text-[var(--ink)]">{a.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--fg-muted)]">
                        {a.owner} · {a.due ? `due ${a.due}` : "no due date"}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-[var(--fg-muted)]">
                No deficiencies recorded. Go back and answer one question No to see an action appear here.
              </p>
            )}
            <p className="mt-4 text-xs text-[var(--fg-subtle)]">
              The real report is a PDF with every photo, finding and code citation, plus CAP, LSRA and ILSM workbooks.
            </p>
          </div>

          <div className="rounded border border-[var(--ink)] bg-[var(--ink)] p-4 text-[var(--paper)]">
            <h2 className="text-lg font-semibold">That&apos;s the loop.</h2>
            <p className="mt-1 text-sm opacity-90">
              Answer, capture evidence, assign the fix, review, sign. Free accounts include checklists, photos,
              findings and reports; AI drafting is metered on paid plans.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/signup" className="cl-btn-accent">
                Start a free inspection
              </Link>
              <button
                type="button"
                className="min-h-11 rounded border border-[var(--paper)] px-4 text-sm font-medium hover:bg-white/10"
                onClick={() => {
                  setAnswers({});
                  setValues({});
                  setNotes({});
                  setNoteOpen({});
                  setPhotos({});
                  setChip({});
                  setActions({});
                  setFinalized(false);
                  setStep("audit");
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--rule-paper)] px-2 py-2">
      <dt className="text-xs text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function ReviewList({ title, items, help, urgent = false }: { title: string; items: string[]; help: string; urgent?: boolean }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--paper-2)] p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
        {title}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            urgent ? "bg-[#fdecea] text-[#b42318]" : "bg-[#fdf3dc] text-[#8a5300]"
          }`}
        >
          {items.length}
        </span>
      </h2>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">{help}</p>
      <ul className="mt-2 divide-y divide-[var(--rule-paper)]">
        {items.map((t) => (
          <li key={t} className="flex items-center gap-2 py-2 text-sm text-[var(--ink)]">
            <Check size={14} className="shrink-0 text-[var(--fg-subtle)]" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A drawn stand-in for a corridor photo — clearly labelled as a sample. */
function SamplePhoto() {
  return (
    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[#d9d3c0]" role="img" aria-label="Sample photo: boxes stacked in a corridor">
      <svg viewBox="0 0 96 64" className="h-full w-full" aria-hidden>
        <polygon points="0,64 96,64 74,30 22,30" fill="#c9c3b0" />
        <polygon points="22,30 74,30 74,0 22,0" fill="#e8e4d6" />
        <rect x="44" y="6" width="8" height="5" fill="#2f6b2f" />
        <rect x="30" y="38" width="16" height="14" fill="#b58a4f" stroke="#7a5a2c" />
        <rect x="46" y="42" width="14" height="12" fill="#c49a5e" stroke="#7a5a2c" />
        <rect x="38" y="30" width="12" height="10" fill="#a87a3f" stroke="#7a5a2c" />
      </svg>
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-center text-[9px] text-white">Sample</span>
    </div>
  );
}
