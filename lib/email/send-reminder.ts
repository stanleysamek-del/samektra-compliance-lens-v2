/**
 * Reminder emails (scheduled inspections, equipment checks) via Resend —
 * same contract as send-action-notification.ts: without RESEND_API_KEY /
 * RESEND_FROM_EMAIL it no-ops with a log line, and REMINDER_EMAILS=off
 * switches reminders off entirely without a deploy.
 *
 * One email per recipient per run: a digest of rows, each linking to the
 * place to act. Light, plain styling so it reads the same in every mail
 * client (no web fonts, no dark theme).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export type ReminderRow = {
  title: string;
  /** "Healthcare LS/EOC round · St. Anselm · 3 days overdue" */
  detail: string;
  overdue: boolean;
  href: string;
};

export type ReminderEmail = {
  to: string;
  subject: string;
  /** Small label above the heading, e.g. "Scheduled inspections". */
  eyebrow: string;
  heading: string;
  intro: string;
  rows: ReminderRow[];
  ctaLabel: string;
  ctaHref: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const abs = (href: string) => (href.startsWith("http") ? href : `${SITE_URL}${href}`);

export function remindersEnabled(): boolean {
  return (process.env.REMINDER_EMAILS ?? "on").toLowerCase() !== "off";
}

export function buildReminderEmail(input: ReminderEmail): { subject: string; text: string; html: string } {
  const text =
    `${input.heading}\n\n${input.intro}\n\n` +
    input.rows.map((r) => `- ${r.title}\n  ${r.detail}\n  ${abs(r.href)}`).join("\n\n") +
    `\n\n${input.ctaLabel}: ${abs(input.ctaHref)}\n`;

  const rows = input.rows
    .map(
      (r) => `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #d9d3c0">
            <a href="${escapeHtml(abs(r.href))}" style="color:#0f1518;font-weight:600;text-decoration:none;font-size:15px">${escapeHtml(r.title)}</a>
            <div style="margin-top:2px;font-size:13px;color:${r.overdue ? "#b42318" : "#4a545a"}">${escapeHtml(r.detail)}</div>
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#faf8f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1518">
    <div style="max-width:560px;margin:0 auto;padding:28px 20px">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#4a545a">Compliance Lens · ${escapeHtml(input.eyebrow)}</div>
      <h1 style="margin:6px 0 10px 0;font-size:21px;font-weight:600">${escapeHtml(input.heading)}</h1>
      <p style="margin:0 0 14px 0;line-height:1.55;color:#4a545a">${escapeHtml(input.intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}
      </table>
      <div style="margin:22px 0">
        <a href="${escapeHtml(abs(input.ctaHref))}" style="display:inline-block;background:#0f1518;color:#faf8f2;font-weight:600;padding:12px 20px;border-radius:4px;text-decoration:none;font-size:14px">${escapeHtml(input.ctaLabel)}</a>
      </div>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#636b70">
        You get this because these items are assigned to you or your team in Compliance Lens.
        It never repeats daily: reminders go out around the due date, then less and less often.
      </p>
    </div>
  </body>
</html>`;

  return { subject: input.subject, text, html };
}

export async function sendReminderEmail(input: ReminderEmail): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!remindersEnabled()) return { ok: true, skipped: true };

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.warn(`[reminder-email] RESEND not configured — skipping "${input.subject}".`);
    return { ok: true, skipped: true };
  }

  const { subject, text, html } = buildReminderEmail(input);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: fromEmail, to: [input.to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[reminder-email] Resend ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[reminder-email] send failed:", err instanceof Error ? err.message : err);
    return { ok: false, error: "send failed" };
  }
}
