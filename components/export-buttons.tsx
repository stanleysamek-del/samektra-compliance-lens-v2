import { HelpTip } from "@/components/help-tip";

/**
 * The four report downloads. ALWAYS rendered — before finalize they are
 * disabled with a caption explaining why, so a first-time user learns
 * what the tool produces before they've produced it. Each button carries
 * a one-line subtitle (visible on touch — no hover needed) plus a HelpTip
 * with the full explanation of what a surveyor does with that file.
 *
 * Server-safe: no hooks, just markup. HelpTip is a client island.
 */

type ExportDef = {
  key: "pdf" | "cap" | "lsra" | "ilsm";
  label: string;
  subtitle: string;
  help: string;
  primary?: boolean;
};

const EXPORTS: ExportDef[] = [
  {
    key: "pdf",
    label: "Download PDF",
    subtitle: "The signed report — photos, findings, citations, signatures.",
    help: "The signed inspection report: every photo, the finding under it, the code citation, and the inspector + manager signatures with timestamps. The archival record you keep and email to the facility director.",
    primary: true,
  },
  {
    key: "cap",
    label: "Download CAP",
    subtitle: "Corrective Action Plan — every deficiency, its fix, owner, date, status.",
    help: "Corrective Action Plan — a spreadsheet of every deficiency, the fix, who owns it, the target date, and status. The document a TJC surveyor or your AHJ asks for to see problems are being tracked and closed, not just recorded.",
  },
  {
    key: "lsra",
    label: "Download LSRA",
    subtitle: "Life Safety Risk Assessment — Impact × Severity → Risk Level.",
    help: "Life Safety Risk Assessment — scores each deficiency by Impact and Severity into a Risk Level (ASHE convention) so you can defend fixing one finding this week and another next quarter. Pre-filled; edit in Excel and the level recalculates.",
  },
  {
    key: "ilsm",
    label: "Download ILSM",
    subtitle: "Interim Life Safety Measures — what you do until it's fixed.",
    help: "Interim Life Safety Measures — when a deficiency can't be fixed right away, TJC LS.01.02.01 / CMS K-291 require documenting compensating measures (extra rounds, fire watch, added extinguishers) until it is. Lists the 11 standard measures, pre-checks the ones that fit.",
  },
];

export function ExportButtons({
  inspectionId,
  enabled,
}: {
  inspectionId: string;
  enabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!enabled ? (
        <p className="text-xs text-[var(--fg-muted)]">
          Available after you finalize — finalizing locks the report; reopen
          any time.
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EXPORTS.map((e) => {
          const href = `/api/inspections/${inspectionId}/export/${e.key}`;
          const btnClass = `${e.primary ? "cl-btn-accent" : "cl-btn-outline"} w-full text-center`;
          return (
            <li key={e.key} className="flex flex-col gap-1">
              {enabled ? (
                <a href={href} className={btnClass}>
                  {e.label}
                </a>
              ) : (
                <span
                  role="link"
                  aria-disabled="true"
                  className={btnClass}
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  {e.label}
                </span>
              )}
              <p className="flex items-start gap-1.5 px-0.5 text-[11px] leading-snug text-[var(--fg-subtle)]">
                <span className="min-w-0 flex-1">{e.subtitle}</span>
                <HelpTip title={e.label.replace("Download ", "")} ariaLabel={`What is the ${e.label.replace("Download ", "")}?`}>
                  {e.help}
                </HelpTip>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
