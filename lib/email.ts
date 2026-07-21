import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? "WhatsCRM <noreply@example.com>";

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  inviterName: string;
  tenantName: string;
  tempPassword: string;
  loginUrl: string;
}) {
  await transporter.sendMail({
    from: FROM,
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
  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: "Reset your WhatsCRM password",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Hi ${opts.name},</h2>
        <p>We received a request to reset your password. Click the button below to set a new password.</p>
        <a href="${opts.resetUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
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
  await transporter.sendMail({
    from: FROM,
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
