/**
 * Email delivery for team invites via Resend (resend.com).
 *
 * Configuration:
 *   - RESEND_API_KEY        Resend API key (required for email to actually send)
 *   - RESEND_FROM_EMAIL     "Compliance Lens <noreply@yourdomain>" (required;
 *                           the domain must be verified in Resend)
 *   - NEXT_PUBLIC_SITE_URL  base URL used to build the invite link
 *
 * If RESEND_API_KEY isn't set, this becomes a no-op that logs the link to
 * the server console — useful for local dev and the initial deploy before
 * Resend is configured. The invite row + link are created regardless;
 * email delivery is just the convenience layer on top.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export type InviteEmailInput = {
  toEmail: string;
  inviterName: string;
  orgName: string;
  role: "admin" | "member";
  token: string;
};

export async function sendInviteEmail(input: InviteEmailInput): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  const link = `${SITE_URL}/team/invite/${input.token}`;

  if (!apiKey || !fromEmail) {
    console.warn(
      `[invite-email] RESEND_API_KEY / RESEND_FROM_EMAIL not set — skipping send. ` +
        `Invite link for ${input.toEmail}: ${link}`,
    );
    return { ok: true, skipped: true };
  }

  const subject = `You've been invited to ${input.orgName} on Compliance Lens`;

  // Plain-text + HTML body. Keeping HTML simple (inline styles, no images)
  // so it renders reliably across Gmail, Outlook, Apple Mail, etc. without
  // a heavy email-template framework.
  const text =
    `${input.inviterName} has invited you to join ${input.orgName} on Compliance Lens as a ${input.role}.\n\n` +
    `Open this link to accept:\n${link}\n\n` +
    `If you don't have an account yet, you can create one on the same page.\n\n` +
    `The link expires in 7 days. If you weren't expecting this invite you can safely ignore it.`;

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0a0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">
        Compliance Lens
      </div>
      <h1 style="margin:0 0 18px 0;font-size:22px;font-weight:600;color:#f8fafc">
        You're invited to join <span style="color:#14b8a6">${escapeHtml(input.orgName)}</span>
      </h1>
      <p style="margin:0 0 12px 0;line-height:1.55;color:#cbd5e1">
        <strong style="color:#f8fafc">${escapeHtml(input.inviterName)}</strong>
        has invited you to collaborate as a <strong>${escapeHtml(input.role)}</strong>.
      </p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#cbd5e1">
        Click the button below to accept. If you don't have an account yet you'll
        be able to create one and land back on the invite page.
      </p>
      <div style="margin:24px 0">
        <a
          href="${link}"
          style="display:inline-block;background:#14b8a6;color:#0a0d12;font-weight:600;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px"
        >
          Accept invite
        </a>
      </div>
      <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.55">
        Or paste this link into your browser:<br/>
        <a href="${link}" style="color:#5eead4;word-break:break-all">${link}</a>
      </p>
      <hr style="margin:28px 0;border:none;border-top:1px solid #1e293b" />
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.55">
        This invite expires in 7 days. If you weren't expecting it, you can
        safely ignore this email.
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
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(
        `[invite-email] Resend returned ${res.status}: ${body.slice(0, 300)}`,
      );
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[invite-email] send failed:", err);
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
