"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  User,
  X,
} from "lucide-react";

import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { loginSchema, registerSchema, type LoginInput } from "@/lib/validators/auth";

// ─── Signup schema ─────────────────────────────────────────────────────────────

const signupFormSchema = registerSchema
  .extend({
    accessToken: z.string().min(1, "Access token is required"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupFormSchema>;

const DEMO_EMAIL = "admin@demo.com";
const DEMO_PASSWORD = "Demo@1234";

const PASSWORD_RULES = [
  { label: "8+ characters", test: (v: string) => v.length >= 8 },
  { label: "Uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Number", test: (v: string) => /[0-9]/.test(v) },
  { label: "Symbol", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH = [
  { label: "Too weak", bar: "bg-rose-500", text: "text-rose-600" },
  { label: "Weak", bar: "bg-rose-500", text: "text-rose-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Good", bar: "bg-sky-500", text: "text-sky-600" },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-8 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <TabBtn active={tab === "signin"} onClick={() => setTab("signin")}>Sign in</TabBtn>
        <TabBtn active={tab === "signup"} onClick={() => setTab("signup")}>Get started</TabBtn>
      </div>

      {tab === "signin" ? <SignInForm /> : <SignUpForm />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg py-2 text-sm font-medium transition",
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200"
          : "text-slate-500 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

// ─── Sign-in form ──────────────────────────────────────────────────────────────

function SignInForm() {
  const router = useRouter();
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
      setError("Invalid email or password");
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

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm font-medium text-rose-700">{error}</p>
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

      {/* Demo credentials */}
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
    </div>
  );
}

// ─── Sign-up form ──────────────────────────────────────────────────────────────

function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    mode: "onTouched",
    defaultValues: {
      workspaceName: "",
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      accessToken: "",
    },
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const strength = STRENGTH[password.length === 0 ? 0 : passed];

  async function onSubmit(values: SignupFormValues) {
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        password: values.password,
        workspaceName: values.workspaceName,
        accessToken: values.accessToken,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSuccess(true);
    await signIn("credentials", { email: values.email, password: values.password, redirect: false });
    router.push("/inbox");
  }

  if (success) {
    return (
      <div className="py-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Workspace created!</h2>
        <p className="mt-1 text-sm text-slate-500">Taking you to your inbox…</p>
        <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your workspace</h1>
        <p className="mt-1.5 text-sm text-slate-500">14-day free trial — no credit card required.</p>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Workspace name" htmlFor="workspaceName" error={errors.workspaceName?.message} required>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("workspaceName")}
              id="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="Acme Sales"
              className={cn(inputClass, "pl-9.5", errors.workspaceName && "border-rose-300")}
            />
          </div>
        </Field>

        <Field label="Your name" htmlFor="su-name" error={errors.name?.message} required>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("name")}
              id="su-name"
              type="text"
              autoComplete="name"
              placeholder="Rajesh Kumar"
              className={cn(inputClass, "pl-9.5", errors.name && "border-rose-300")}
            />
          </div>
        </Field>

        <Field label="Work email" htmlFor="su-email" error={errors.email?.message} required>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("email")}
              id="su-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className={cn(inputClass, "pl-9.5", errors.email && "border-rose-300")}
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="su-password" error={errors.password?.message} required>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("password")}
              id="su-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={cn(inputClass, "pl-9.5 pr-10", errors.password && "border-rose-300")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        i < passed ? strength.bar : "bg-slate-200",
                      )}
                    />
                  ))}
                </div>
                <span className={cn("w-16 text-right text-xs font-medium", strength.text)}>
                  {strength.label}
                </span>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li key={rule.label} className={cn("flex items-center gap-1 text-xs", ok ? "text-emerald-600" : "text-slate-400")}>
                      {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Field>

        <Field label="Confirm password" htmlFor="su-confirm" error={errors.confirmPassword?.message} required>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("confirmPassword")}
              id="su-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              className={cn(inputClass, "pl-9.5 pr-10", errors.confirmPassword && "border-rose-300")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {/* Access token — gated signup */}
        <Field label="Access token" htmlFor="su-token" error={errors.accessToken?.message} required>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...register("accessToken")}
              id="su-token"
              type={showToken ? "text" : "password"}
              placeholder="Enter your access code"
              autoComplete="off"
              className={cn(
                inputClass,
                "pl-9.5 pr-10 font-mono tracking-widest",
                errors.accessToken && "border-rose-300",
              )}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Don&apos;t have a code?{" "}
            <a href="mailto:corescentdevelopment@gmail.com" className="text-emerald-600 hover:underline">
              Contact us
            </a>
          </p>
        </Field>

        <Button type="submit" disabled={isSubmitting} className="w-full py-2.5 mt-1">
          {isSubmitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Creating workspace…</>
          ) : (
            "Create free account"
          )}
        </Button>
      </form>
    </div>
  );
}
