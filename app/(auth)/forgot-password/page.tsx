// TODO [HEMANT]: Forgot Password page.
// Step 1: Email input → POST /api/auth/forgot-password → show "Check your email" message.
// Step 2 (separate page /reset-password?token=xxx): New password + confirm.
// TODO [SHALMON]: Create /api/auth/forgot-password and /api/auth/reset-password routes.
// Use a short-lived signed token stored in the DB (add PasswordResetToken model if needed).

"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
      {sent ? (
        <p className="text-green-600">Check your email for a reset link.</p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
          <p className="text-gray-500 mb-6">Enter your email and we&apos;ll send you a reset link.</p>
          <input name="email" type="email" placeholder="Email" required className="w-full border rounded-lg px-4 py-2" />
          <button type="submit" className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700">
            Send Reset Link
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-green-600 hover:underline">← Back to login</Link>
      </p>
    </div>
  );
}
