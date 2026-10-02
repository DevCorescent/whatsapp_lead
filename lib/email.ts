import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";

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

// Cache transporters by config key so we don't re-create connection pools on
// every send when the same SMTP account is used repeatedly.
const _transporterCache = new Map<string, Transporter>();

function getTransporterFor(smtp: SmtpEnv): Transporter {
  const key = `${smtp.host}:${smtp.port}:${smtp.user}`;
  const cached = _transporterCache.get(key);
  if (cached) return cached;
  const t = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  _transporterCache.set(key, t);
  return t;
}

/**
 * Resolve SMTP credentials for a given tenant following the hierarchy:
 *
 *   1. If the tenant is a CLIENT → use its parent reseller's SMTP (if configured).
 *   2. If the tenant is a RESELLER → use its own SMTP (if configured).
 *   3. Fall back to the platform's env-var SMTP.
 *
 * This lets white-label resellers deliver emails from their own mail server so
 * SPF/DKIM is authorised for their domain, giving better deliverability and
 * keeping the platform's sending reputation separate.
 */
async function resolveSmtpConfig(tenantId?: string): Promise<SmtpEnv> {
  if (tenantId) {
    try {
      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: {
          smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true,
          tenant: { select: { accountType: true, parentId: true } },
        },
      });

      // CLIENT → check parent (reseller) SMTP first
      if (settings?.tenant.accountType === "CLIENT" && settings.tenant.parentId) {
        const parent = await prisma.tenantSettings.findUnique({
          where: { tenantId: settings.tenant.parentId },
          select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true },
        });
        if (parent?.smtpHost && parent?.smtpUser && parent?.smtpPass && parent?.smtpFrom) {
          return {
            host: parent.smtpHost,
            port: parent.smtpPort ?? 465,
            user: parent.smtpUser,
            pass: parent.smtpPass,
            from: parent.smtpFrom,
          };
        }
      }

      // RESELLER (or CLIENT with no parent SMTP) → own SMTP
      if (settings?.smtpHost && settings?.smtpUser && settings?.smtpPass && settings?.smtpFrom) {
        return {
          host: settings.smtpHost,
          port: settings.smtpPort ?? 465,
          user: settings.smtpUser,
          pass: settings.smtpPass,
          from: settings.smtpFrom,
        };
      }
    } catch (err) {
      console.warn("[EMAIL] SMTP DB lookup failed, falling back to env", err);
    }
  }

  return readSmtpEnv();
}

/** The address part of SMTP_FROM ("Name <a@b.c>" or "a@b.c"). */
function fromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

/**
 * Send one email, resolving SMTP via the hierarchy when `tenantId` is given.
 * The brand overrides the display name (and Reply-To) but not the actual
 * sending address — the account whose credentials are used is the authorised
 * sender for SPF/DKIM purposes.
 */
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  kind: string;
  brand?: EmailBrand;
  tenantId?: string;
}) {
  const smtp = await resolveSmtpConfig(opts.tenantId);
  const name = opts.brand?.name?.replace(/["<>\r\n]/g, "").trim();
  const from = name ? `"${name}" <${fromAddress(smtp.from)}>` : smtp.from;
  const replyTo = opts.brand?.replyTo?.trim() || undefined;
  const transport = getTransporterFor(smtp);

  console.log(`[EMAIL] Sending ${opts.kind}`, { to: opts.to, subject: opts.subject, via: smtp.host });

  try {
    const info = await transport.sendMail({
      from,
      ...(replyTo && { replyTo }),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    console.log(`[EMAIL] Sent ${opts.kind}`, { to: opts.to, messageId: info.messageId });
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

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

function safeColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : PLATFORM_EMAIL_BRAND.color;
}

export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  verifyUrl: string;
  brand?: EmailBrand;
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "email-verify",
    to: opts.to,
    tenantId: opts.tenantId,
    subject: `Verify your email — ${brand.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:${safeColor(brand.color)};">Verify your email address</h2>
        <p>Hi ${esc(opts.name)},</p>
        <p>Thanks for signing up to ${esc(brand.name)}. Click the button below to verify your email address and activate your account.</p>
        <a href="${safeUrl(opts.verifyUrl)}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:${safeColor(brand.color)};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Verify Email</a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:8px;">Or paste this link into your browser:<br>${esc(opts.verifyUrl)}</p>
      </div>
    `,
  });
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  tenantName: string;
  tempPassword: string;
  loginUrl: string;
  brand?: EmailBrand;
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "invite",
    to: opts.to,
    tenantId: opts.tenantId,
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
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "password-reset",
    to: opts.to,
    tenantId: opts.tenantId,
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
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "welcome",
    to: opts.to,
    tenantId: opts.tenantId,
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
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "low-balance",
    to: opts.to,
    tenantId: opts.tenantId,
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

export async function sendNoticeEmail(opts: {
  to: string;
  name: string;
  subject: string;
  message: string;
  brand?: EmailBrand;
  tenantId?: string;
}) {
  const brand = opts.brand ?? PLATFORM_EMAIL_BRAND;
  await sendMail({
    brand,
    kind: "notice",
    to: opts.to,
    tenantId: opts.tenantId,
    subject: opts.subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${esc(opts.name)},</h2>
        <p>${esc(opts.message)}</p>
      </div>
    `,
  });
}
