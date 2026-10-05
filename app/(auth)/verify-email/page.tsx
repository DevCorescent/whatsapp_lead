"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, MailWarning, XCircle } from "lucide-react";
import { Button } from "@/components/ui";

type State = "verifying" | "success" | "expired" | "invalid" | "already";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const error = params.get("error");

  const [state, setState] = useState<State>(() => {
    if (error === "expired") return "expired";
    if (error === "invalid" || error === "missing") return "invalid";
    if (!token) return "invalid";
    return "verifying";
  });

  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (state !== "verifying" || !token) return;

    // The GET /api/auth/verify-email redirects the browser, so we just navigate there.
    // This page is reached when the redirect lands here with ?error=.
    router.replace(`/api/auth/verify-email?token=${token}`);
  }, [state, token, router]);

  async function handleResend() {
    if (!email.trim()) return;
    setResending(true);
    await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setResent(true);
  }

  if (state === "verifying") {
    return (
      <div className="text-center py-8">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
        <p className="mt-3 text-sm text-slate-500">Verifying your email…</p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="text-center py-6">
        <MailWarning className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-bold text-slate-900 mb-1">Link expired</h1>
        <p className="text-sm text-slate-500 mb-4">
          Verification links expire after 24 hours. Enter your email to get a fresh one.
        </p>
        {!resent ? (
          <div className="mt-4 max-w-xs mx-auto flex flex-col gap-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <Button onClick={handleResend} disabled={resending || !email.trim()}>
              {resending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Resend verification email"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-emerald-700 font-medium">
            ✓ Sent — check your inbox and spam folder.
          </p>
        )}
        <p className="mt-4 text-xs text-slate-400">
          <Link href="/login" className="underline">Back to login</Link>
        </p>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="text-center py-6">
        <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
        <h1 className="text-xl font-bold text-slate-900 mb-1">Invalid link</h1>
        <p className="text-sm text-slate-500 mb-4">
          This verification link is not valid. It may have already been used.
        </p>
        <Link href="/login" className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
          Go to login
        </Link>
      </div>
    );
  }

  // should not render (success redirects to /login?verified=1)
  return null;
}
