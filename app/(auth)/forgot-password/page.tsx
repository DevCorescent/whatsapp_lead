// Forgot Password — step 1 of the reset flow.
// Step 2 lives at /reset-password?token=xxx (new password + confirm).
//
// TODO [SHALMON]: wire POST /api/auth/forgot-password
// No endpoint exists yet, so success is simulated client-side below.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";

import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { forgotPasswordSchema } from "@/lib/validators/auth";

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

const RESEND_COOLDOWN = 30;

// TODO [SHALMON]: wire POST /api/auth/forgot-password
// The route does not exist yet, so we fake the round-trip and always succeed.
async function sendResetLink() {
  await new Promise((resolve) => setTimeout(resolve, 700));
}

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(values: ForgotPasswordValues) {
    await sendResetLink();
    setSentTo(values.email);
    setCooldown(RESEND_COOLDOWN);
  }

  async function onResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    await sendResetLink();
    setResending(false);
    setCooldown(RESEND_COOLDOWN);
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-inset ring-emerald-100">
          <MailCheck className="h-7 w-7 text-emerald-600" />
        </span>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          We&apos;ve sent a password reset link to
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-slate-900">{sentTo}</p>
        <p className="mt-3 text-sm text-slate-500">
          The link expires in 30 minutes. Check your spam folder if it doesn&apos;t show up.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-sm text-slate-600">Didn&apos;t get it?</p>
          <Button
            type="button"
            variant="secondary"
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className="mt-3 w-full"
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Resending…
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend email"
            )}
          </Button>
        </div>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 transition hover:text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Reset your password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Enter the email tied to your workspace and we&apos;ll send you a link to set a new
          password.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("email")}
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={!!errors.email}
              className={cn(inputClass, "pl-9.5", errors.email && "border-rose-300")}
            />
          </div>
        </Field>

        <Button type="submit" disabled={isSubmitting} className="w-full py-2.5">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending link…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 transition hover:text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
