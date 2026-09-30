import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type SmtpEnv = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function readSmtpEnv(): SmtpEnv {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? 465);

  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
    );
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid SMTP_PORT: ${process.env.SMTP_PORT}`);
  }

  return { host, port, user, pass, from };
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const { host, port, user, pass } = readSmtpEnv();
  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 = implicit TLS; 587 = STARTTLS
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

/** The address part of SMTP_FROM ("Name <a@b.c>" or "a@b.c"). */
function fromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/**
 * Send through the platform's SMTP account. A white-label brand changes only the
 * display name ("Acme CRM" <noreply@platform>) and the Reply-To (the brand's support
 * address) — the sending address stays the platform's, whose domain is the one
 * authorised (SPF/DKIM) to send.
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  kind: string;
  brand?: EmailBrand;
}) {
  const smtp = readSmtpEnv();
  const name = opts.brand?.name?.replace(/["<>\r\n]/g, "").trim();
  const from = name ? `"${name}" <${fromAddress(smtp.from)}>` : smtp.from;
  const replyTo = opts.brand?.replyTo?.trim() || undefined;
  const transport = getTransporter();

  console.log(`[EMAIL] Sending ${opts.kind}`, { to: opts.to, subject: opts.subject });

  try {
    const info = await transport.sendMail({
      from,
      ...(replyTo && { replyTo }),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    console.log(`[EMAIL] Sent ${opts.kind}`, {
      to: opts.to,
      messageId: info.messageId,
      response: info.response,
    });
    return info;
  } catch (error) {
    console.error(`[EMAIL] Failed ${opts.kind}`, {
      to: opts.to,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Which brand an email speaks for. Defaults to the platform; white-label resellers pass theirs. */
export interface EmailBrand {
  name: string;
  color: string;
  /** Where replies go — the brand's support address. */
  replyTo?: string | null;
}

const PLATFORM_EMAIL_BRAND: EmailBrand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "WhatsCRM",
  color: "#059669",
};

/**
 * Escape a value for HTML. Workspace names, people's names and brand names are
 * user-controlled; interpolated raw, a workspace called `<a href=…>` became a link
 * in every invite that workspace sent.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links in buttons. */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

function safeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : PLATFORM_EMAIL_BRAND.color;
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  tenantName: string;
  tempPassword: string;
  loginUrl: string;
  brand?: EmailBrand;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "invite",
    to: opts.to,
    subject: `You've been invited to ${opts.tenantName} on ${brand.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${esc(opts.name)},</h2>
        <p>${esc(opts.inviterName)} has invited you to join <strong>${esc(opts.tenantName)}</strong> on ${esc(brand.name)}.</p>
        <p>Here are your login credentials:</p>
        <ul>
          <li><strong>Email:</strong> ${esc(opts.to)}</li>
          <li><strong>Temporary Password:</strong> <code>${esc(opts.tempPassword)}</code></li>
        </ul>
        <a href="${safeUrl(opts.loginUrl)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${safeColor(brand.color)};color:#fff;border-radius:6px;text-decoration:none;">Log in to ${esc(brand.name)}</a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">Please change your password after your first login.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
  brand?: EmailBrand;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "password-reset",
    to: opts.to,
    subject: `Reset your ${brand.name} password`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${esc(opts.name)},</h2>
        <p>We received a request to reset your password. Click the button below to set a new password.</p>
        <a href="${safeUrl(opts.resetUrl)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${safeColor(brand.color)};color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  tenantName: string;
  loginUrl: string;
  brand?: EmailBrand;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "welcome",
    to: opts.to,
    subject: `Welcome to ${brand.name} — ${opts.tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Welcome to ${esc(brand.name)}, ${esc(opts.name)}!</h2>
        <p>Your workspace <strong>${esc(opts.tenantName)}</strong> is ready. Start managing your WhatsApp conversations smarter.</p>
        <a href="${safeUrl(opts.loginUrl)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${safeColor(brand.color)};color:#fff;border-radius:6px;text-decoration:none;">Go to Dashboard</a>
      </div>
    `,
  });
}

export async function sendLowBalanceEmail(opts: {
  to: string;
  name: string;
  tenantName: string;
  balance: string;
  walletUrl: string;
  brand?: EmailBrand;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "low-balance",
    to: opts.to,
    subject: `Low message balance — ${opts.tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${esc(opts.name)},</h2>
        <p>The message balance for <strong>${esc(opts.tenantName)}</strong> on ${esc(brand.name)} is down to <strong>${esc(opts.balance)}</strong>.</p>
        <p>Campaigns pause automatically when the balance runs out. Top up to keep them going.</p>
        <a href="${safeUrl(opts.walletUrl)}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:${safeColor(brand.color)};color:#fff;border-radius:6px;text-decoration:none;">Top up</a>
      </div>
    `,
  });
}

/** A short plain notice to an account owner (e.g. a fee reminder). */
export async function sendNoticeEmail(opts: {
  to: string;
  name: string;
  subject: string;
  message: string;
  brand?: EmailBrand;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "notice",
    to: opts.to,
    subject: opts.subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${esc(opts.name)},</h2>
        <p>${esc(opts.message)}</p>
      </div>
    `,
  });
}
