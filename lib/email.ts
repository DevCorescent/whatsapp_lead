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

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  kind: string;
}) {
  const { from } = readSmtpEnv();
  const transport = getTransporter();

  console.log(`[EMAIL] Sending ${opts.kind}`, { to: opts.to, subject: opts.subject });

  try {
    const info = await transport.sendMail({
      from,
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

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  tenantName: string;
  tempPassword: string;
  loginUrl: string;
}) {
  await sendMail({
    kind: "invite",
    to: opts.to,
    subject: `You've been invited to ${opts.tenantName} on WhatsCRM`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${opts.name},</h2>
        <p>${opts.inviterName} has invited you to join <strong>${opts.tenantName}</strong> on WhatsCRM.</p>
        <p>Here are your login credentials:</p>
        <ul>
          <li><strong>Email:</strong> ${opts.to}</li>
          <li><strong>Temporary Password:</strong> <code>${opts.tempPassword}</code></li>
        </ul>
        <a href="${opts.loginUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Log in to WhatsCRM</a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">Please change your password after your first login.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  await sendMail({
    kind: "password-reset",
    to: opts.to,
    subject: "Reset your WhatsCRM password",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${opts.name},</h2>
        <p>We received a request to reset your password. Click the button below to set a new password.</p>
        <a href="${opts.resetUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a>
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
}) {
  await sendMail({
    kind: "welcome",
    to: opts.to,
    subject: `Welcome to WhatsCRM — ${opts.tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Welcome to WhatsCRM, ${opts.name}!</h2>
        <p>Your workspace <strong>${opts.tenantName}</strong> is ready. Start managing your WhatsApp conversations smarter.</p>
        <a href="${opts.loginUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Go to Dashboard</a>
      </div>
    `,
  });
}
