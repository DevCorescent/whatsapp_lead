"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";

import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO === "true";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div>
      <SignInForm />
      <p className="mt-6 text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/register" className="font-medium text-emerald-600 transition hover:text-emerald-700 hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}

// ─── Sign-in form ──────────────────────────────────────────────────────────────

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justVerified = params.get("verified") === "1";
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    setError("");
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (result?.error) {
      const msg = result.error.includes("EMAIL_NOT_VERIFIED")
        ? "Please verify your email before logging in. Check your inbox for the verification link."
        : "Invalid email or password";
      setError(msg);
    } else {
      const session = await getSession();
      router.push(session?.user?.role === "SUPER_ADMIN" ? "/dashboard" : "/inbox");
    }
  }

  async function copyDemo() {
    try {
      await navigator.clipboard.writeText(`${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Sign in to your workspace to pick up where you left off.
        </p>
      </div>

      {justVerified && (
        <div role="status" className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Email verified — you can now log in.</p>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-medium text-rose-700">{error}</p>
            {error.includes("verify") && (
              <button
                type="button"
                className="mt-1 text-xs text-rose-600 underline"
                onClick={async () => {
                  const em = (document.getElementById("email") as HTMLInputElement)?.value;
                  if (em) await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) });
                }}
              >
                Resend verification email
              </button>
            )}
          </div>
        </div>
      )}

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

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("password")}
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              className={cn(inputClass, "pl-9.5 pr-10", errors.password && "border-rose-300")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-emerald-600 transition hover:text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full py-2.5">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      {/* Demo credentials — only shown when NEXT_PUBLIC_SHOW_DEMO=true */}
      {SHOW_DEMO && DEMO_EMAIL && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo credentials</p>
              <p className="mt-1.5 truncate font-mono text-sm text-slate-700">
                {DEMO_EMAIL} / {DEMO_PASSWORD}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyDemo}
              className="shrink-0"
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Copy</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

