// Register / Sign Up form.
//
// Logic (already wired – DO NOT CHANGE):
//   1. Validate with react-hook-form + registerSchema from @/lib/validators/auth
//   2. POST to /api/auth/register
//   3. On success → auto signIn then redirect to /inbox
//   4. On error (409 = email taken) show the returned error

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react";

import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { registerSchema } from "@/lib/validators/auth";

// Builds on the shared registerSchema — the two extra fields are UI-only and are
// never sent to /api/auth/register.
const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your password"),
    terms: z.boolean().refine((v) => v === true, {
      message: "You must accept the terms to continue",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "8+ characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH = [
  { label: "Too weak", bar: "bg-rose-500", text: "text-rose-600" },
  { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Good", bar: "bg-sky-500", text: "text-sky-600" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-600" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onTouched",
    defaultValues: {
      workspaceName: "",
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const passed = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const score = password.length === 0 ? 0 : passed;
  const strength = STRENGTH[score];

  async function onSubmit(values: RegisterFormValues) {
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }

    setSuccess(true);

    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    router.push("/inbox");
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Start your 14-day free trial — no credit card required.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">
            Workspace created — taking you to your inbox…
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Field
          label="Workspace name"
          htmlFor="workspaceName"
          error={errors.workspaceName?.message}
          required
        >
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("workspaceName")}
              id="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="Acme Sales"
              aria-invalid={!!errors.workspaceName}
              className={cn(inputClass, "pl-9.5", errors.workspaceName && "border-rose-300")}
            />
          </div>
        </Field>

        <Field label="Your name" htmlFor="name" error={errors.name?.message} required>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("name")}
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Rajesh Kumar"
              aria-invalid={!!errors.name}
              className={cn(inputClass, "pl-9.5", errors.name && "border-rose-300")}
            />
          </div>
        </Field>

        <Field label="Work email" htmlFor="email" error={errors.email?.message} required>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              className={cn(inputClass, "pl-9.5 pr-10", errors.password && "border-rose-300")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength meter */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1.5" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i < score ? strength.bar : "bg-slate-200",
                    )}
                  />
                ))}
              </div>
              <span
                className={cn(
                  "w-16 shrink-0 text-right text-xs font-medium",
                  password ? strength.text : "text-slate-400",
                )}
              >
                {password ? strength.label : "—"}
              </span>
            </div>

            <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li
                    key={rule.label}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      ok ? "text-emerald-600" : "text-slate-400",
                    )}
                  >
                    {ok ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </Field>

        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
          required
        >
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("confirmPassword")}
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              aria-invalid={!!errors.confirmPassword}
              className={cn(
                inputClass,
                "pl-9.5 pr-10",
                errors.confirmPassword && "border-rose-300",
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {/* Terms */}
        <div>
          <label className="flex cursor-pointer select-none items-start gap-2.5 text-sm text-slate-600">
            <input
              {...register("terms")}
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600 focus:ring-emerald-500"
            />
            <span>
              I agree to the{" "}
              <Link
                href="/terms"
                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and Privacy Policy.
            </span>
          </label>
          {errors.terms?.message && (
            <p className="mt-1 text-xs text-rose-600">{errors.terms.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting || success} className="w-full py-2.5">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating your workspace…
            </>
          ) : (
            "Create free account"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-600 transition hover:text-emerald-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
