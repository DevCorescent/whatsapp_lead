// ============================================================================
// MODULE : Transactional email (Resend)
// ============================================================================
//
// A thin wrapper over Resend for the two flows that must reach a user's inbox:
// team invitations (which carry a temporary password never shown in the UI) and
// password resets. The provider is loaded lazily and the whole module degrades
// gracefully when unconfigured — a deployment without RESEND_API_KEY still runs,
// it just cannot deliver mail, and every caller learns that from the return
// value rather than an exception.
//
// Templates live here, next to the sender, so the subject/HTML/plaintext of an
// email cannot drift away from the call site that triggers it. Each returns a
// self-contained, inline-styled document — email clients strip <style> blocks
// and external CSS, so inline styles are the only reliable option.

import { Resend } from "resend";

const BRAND = "#059669"; // emerald-600, matching the app chrome.

/** Resolve the sender identity from env, with a safe default for local dev. */
function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "WhatsCRM <onboarding@resend.dev>";
}

let client: Resend | null | undefined;

/** Lazily construct the Resend client once; null when no API key is configured. */
function getClient(): Resend | null {
  if (client === undefined) {
    const key = process.env.RESEND_API_KEY;
    client = key ? new Resend(key) : null;
    if (!key) {
      console.warn("[EMAIL] RESEND_API_KEY not configured — emails will not be delivered.");
    }
  }
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  id?: string;
  error?: string;
}

/**
 * Send one transactional email.
 *
 * Never throws: a mail failure must not take down the request that triggered it
 * (a team invite still creates the user; a reset still records its token). The
 * boolean result lets the caller decide how loudly to surface a non-delivery.
 * When Resend is unconfigured this resolves to `{ delivered: false }` after
 * logging, so local development works end to end without an API key.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resend = getClient();
  if (!resend) {
    console.info(`[EMAIL] (not sent — no provider) to=${input.to} subject="${input.subject}"`);
    return { delivered: false, error: "Email provider not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      console.error(`[EMAIL] Resend rejected message to ${input.to}:`, error);
      return { delivered: false, error: error.message };
    }
    return { delivered: true, id: data?.id };
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${input.to}:`, err);
    return { delivered: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** Naive HTML→text fallback so every email carries a readable plaintext part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shared shell — a centered card with the brand wordmark and a muted footer. */
function layout(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="display:inline-block;font-size:18px;font-weight:700;color:${BRAND};letter-spacing:-0.02em;">WhatsCRM</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;">
                <h1 style="margin:0;font-size:20px;line-height:1.3;color:#0f172a;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 28px;color:#334155;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="max-width:480px;margin:20px auto 0;color:#94a3b8;font-size:12px;line-height:1.5;text-align:center;">
            You received this email from WhatsCRM. If you weren't expecting it, you can safely ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:10px;">${label}</a>`;
}

export interface TeamInviteEmailInput {
  inviteeName: string;
  email: string;
  workspaceName: string;
  inviterName?: string;
  tempPassword: string;
  loginUrl: string;
}

/** Invitation carrying the one-time temporary password. */
export function teamInviteEmail(input: TeamInviteEmailInput): { subject: string; html: string } {
  const inviter = input.inviterName ? `${input.inviterName} has invited you` : "You've been invited";
  const cellLabel = "padding:12px 16px;font-size:12px;color:#64748b;";
  const html = layout(
    `You're invited to ${escapeHtml(input.workspaceName)}`,
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(input.inviteeName)},</p>
     <p style="margin:0 0 16px;">${escapeHtml(inviter)} to join the <strong>${escapeHtml(
       input.workspaceName,
     )}</strong> workspace on WhatsCRM. Use the credentials below to sign in, then change your password from your profile.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
       <tr>
         <td style="${cellLabel}">Email</td>
         <td style="padding:12px 16px;font-size:13px;color:#0f172a;font-weight:600;">${escapeHtml(
           input.email,
         )}</td>
       </tr>
       <tr>
         <td style="${cellLabel}border-top:1px solid #e2e8f0;">Temporary password</td>
         <td style="padding:12px 16px;border-top:1px solid #e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#0f172a;font-weight:700;">${escapeHtml(
           input.tempPassword,
         )}</td>
       </tr>
     </table>
     <p style="margin:0 0 20px;">${button(input.loginUrl, "Sign in to WhatsCRM")}</p>
     <p style="margin:0;color:#64748b;font-size:13px;">For your security, please change this password immediately after your first sign-in.</p>`,
  );
  return { subject: `You're invited to ${input.workspaceName} on WhatsCRM`, html };
}

export interface PasswordResetEmailInput {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}

/** Password-reset email with a single-use link. */
export function passwordResetEmail(input: PasswordResetEmailInput): { subject: string; html: string } {
  const html = layout(
    "Reset your password",
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(input.name)},</p>
     <p style="margin:0 0 20px;">We received a request to reset the password on your WhatsCRM account. Click the button below to choose a new one. This link expires in ${
       input.expiresMinutes
     } minutes and can be used once.</p>
     <p style="margin:0 0 20px;">${button(input.resetUrl, "Reset password")}</p>
     <p style="margin:0 0 8px;color:#64748b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
     <p style="margin:0 0 20px;word-break:break-all;"><a href="${input.resetUrl}" style="color:${BRAND};font-size:13px;">${
       input.resetUrl
     }</a></p>
     <p style="margin:0;color:#64748b;font-size:13px;">Didn't request this? You can ignore this email — your password won't change.</p>`,
  );
  return { subject: "Reset your WhatsCRM password", html };
}

/** Minimal HTML-escaping for values interpolated into templates. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
