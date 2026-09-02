/**
 * Email delivery for corrective-action events via Resend — same contract
 * as send-invite.ts: if RESEND_API_KEY / RESEND_FROM_EMAIL aren't set,
 * this no-ops with a console line instead of failing the mutation. The
 * DB write is the source of truth; email is the convenience layer.
 *
 * Events:
 *   assigned  → the assignee ("you have a corrective action due <date>")
 *   done      → the inspector ("<name> marked #<n> done — verify it")
 *   overdue   → the assignee (daily cron digest, one per finding)
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export type ActionEmailInput = {
  kind: "assigned" | "done" | "overdue";
  toEmail: string;
  findingTitle: string;
  severity: string;
  facilityName: string;
  dueDate: string | null;
  actorName: string;
  inspectionId: string;
  photoId: string | null;
  findingId: string;
};

export async function sendActionEmail(input: ActionEmailInput): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  const link = input.photoId
    ? `${SITE_URL}/inspections/${input.inspectionId}/photos/${input.photoId}#finding-${input.findingId}`
    : `${SITE_URL}/inspections/${input.inspectionId}`;
  // For the assignee: the deep link drops them onto someone else's photo
  // page with no orientation. A second, clearly labelled link lands them
  // on their own filtered action list instead.
  const myListLink = `${SITE_URL}/actions?who=me&status=active`;
  const showMyList = input.kind === "assigned";

  if (!apiKey || !fromEmail) {
    console.warn(
      `[action-email] RESEND not configured — skipping ${input.kind} email to ${input.toEmail}. Link: ${link}`,
    );
    return { ok: true, skipped: true };
  }

  const due = input.dueDate ? ` · due ${input.dueDate}` : "";
  const subjects: Record<ActionEmailInput["kind"], string> = {
    assigned: `Corrective action assigned: ${input.findingTitle}`,
    done: `Ready to verify: ${input.findingTitle}`,
    overdue: `Overdue corrective action: ${input.findingTitle}`,
  };
  const leads: Record<ActionEmailInput["kind"], string> = {
    assigned: `${input.actorName} assigned you a corrective action at ${input.facilityName}${due}.`,
    done: `${input.actorName} marked this corrective action done at ${input.facilityName}. It's waiting on your verification.`,
    overdue: `This corrective action at ${input.facilityName} is past its due date${due}.`,
  };

  const text =
    `${leads[input.kind]}\n\n` +
    `Finding: ${input.findingTitle} (${input.severity})\n\n` +
    `Open this finding:\n${link}\n` +
    (showMyList ? `\nOpen my action list (everything assigned to you):\n${myListLink}\n` : "");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0a0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">
        Compliance Lens · Corrective action
      </div>
      <h1 style="margin:0 0 14px 0;font-size:20px;font-weight:600;color:#f8fafc">
        ${escapeHtml(input.findingTitle)}
      </h1>
      <p style="margin:0 0 8px 0;line-height:1.55;color:#cbd5e1">${escapeHtml(leads[input.kind])}</p>
      <p style="margin:0 0 22px 0;font-size:13px;color:#94a3b8">
        Severity: <strong style="color:#f8fafc">${escapeHtml(input.severity)}</strong>
        ${input.dueDate ? ` · Due: <strong style="color:#f8fafc">${escapeHtml(input.dueDate)}</strong>` : ""}
      </p>
      <div style="margin:22px 0">
        <a href="${link}"
          style="display:inline-block;background:#14b8a6;color:#0a0d12;font-weight:600;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">
          Open the finding
        </a>
      </div>
      ${
        showMyList
          ? `<div style="margin:0 0 22px 0;padding:14px 16px;border:1px solid #1e293b;border-radius:8px">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">
          Your action list
        </div>
        <p style="margin:0 0 10px 0;font-size:13px;line-height:1.55;color:#cbd5e1">
          Everything assigned to you, across every inspection, overdue first.
        </p>
        <a href="${myListLink}"
          style="display:inline-block;border:1px solid #14b8a6;color:#5eead4;font-weight:600;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:13px">
          Open my action list
        </a>
      </div>`
          : ""
      }
      <p style="margin:22px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.55">
        Or paste this link into your browser:<br/>
        <a href="${link}" style="color:#5eead4;word-break:break-all">${link}</a>
        ${
          showMyList
            ? `<br/><br/>Your action list:<br/><a href="${myListLink}" style="color:#5eead4;word-break:break-all">${myListLink}</a>`
            : ""
        }
      </p>
    </div>
  </body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.toEmail],
        subject: subjects[input.kind],
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[action-email] Resend ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[action-email] send failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
