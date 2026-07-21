"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@prisma/client";
import {
  MessageSquare,
  Users,
  BookOpen,
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Loader2,
  PlugZap,
  UploadCloud,
  PartyPopper,
} from "lucide-react";
import { Button, Field, inputClass, selectClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useOnboarding, useCompleteOnboarding, type OnboardingState } from "@/hooks/useOnboarding";
import { useTestWhatsApp } from "@/hooks/useSettings";
import { useInviteMember } from "@/hooks/useTeam";
import { useUploadKnowledgeDoc } from "@/hooks/useKnowledge";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "AGENT", label: "Agent" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
  { value: "MARKETING_USER", label: "Marketing" },
];

// The three actionable steps plus a final review; the wizard walks them in order.
const STEP_META = [
  { key: "whatsapp" as const, title: "Connect WhatsApp", icon: MessageSquare },
  { key: "team" as const, title: "Invite your team", icon: Users },
  { key: "knowledge" as const, title: "Upload knowledge", icon: BookOpen },
];
const TOTAL_STEPS = STEP_META.length + 1; // + review

type Banner = { kind: "success" | "error"; text: string } | null;

/**
 * First-run onboarding. Mounted once in the dashboard layout; it fetches its own
 * state and renders nothing when onboarding is complete, still loading, or the
 * user dismissed it for this session. The `dismissed` flag lives here (not in the
 * wizard) so a data refetch re-rendering the wizard never resurrects it.
 */
export function OnboardingGate() {
  const { data, isLoading } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !data || data.completed || dismissed) return null;
  return <OnboardingWizard data={data} onDismiss={() => setDismissed(true)} />;
}

function OnboardingWizard({ data, onDismiss }: { data: OnboardingState; onDismiss: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const complete = useCompleteOnboarding();

  // Resume where the tenant left off: start on the first step they haven't done.
  const firstIncomplete = !data.steps.whatsapp ? 0 : !data.steps.team ? 1 : !data.steps.knowledge ? 2 : 3;
  const [stepIndex, setStepIndex] = useState(firstIncomplete);

  const isReview = stepIndex === STEP_META.length;
  const doneCount = Object.values(data.steps).filter(Boolean).length;

  // Any inline action changes derived onboarding state (a teammate exists, a doc
  // exists), so refetch it to keep the ticks and review screen accurate.
  const refreshState = () => queryClient.invalidateQueries({ queryKey: ["onboarding"] });

  const finish = async () => {
    try {
      await complete.mutateAsync();
    } catch {
      return; // keep the wizard open if the write failed
    }
    router.push("/dashboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set up your workspace"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5"
      >
        {/* Header + progress */}
        <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-white px-6 pb-5 pt-6">
          <div className="flex items-center gap-2 text-emerald-700">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold">Welcome to WhatsCRM</span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            Let&apos;s set up your workspace
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Step {Math.min(stepIndex + 1, TOTAL_STEPS)} of {TOTAL_STEPS} · {doneCount} of{" "}
            {STEP_META.length} tasks done
          </p>
          <div className="mt-4 flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition",
                  i <= stepIndex ? "bg-emerald-500" : "bg-slate-200",
                )}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-6">
          {isReview ? (
            <ReviewStep steps={data.steps} />
          ) : stepIndex === 0 ? (
            <WhatsAppStep connected={data.steps.whatsapp} />
          ) : stepIndex === 1 ? (
            <TeamStep onInvited={refreshState} />
          ) : (
            <KnowledgeStep onUploaded={refreshState} />
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-slate-400 transition hover:text-slate-600"
          >
            Skip for now
          </button>

          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" onClick={() => setStepIndex((i) => i - 1)}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            {isReview ? (
              <Button onClick={finish} disabled={complete.isPending}>
                {complete.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finishing…
                  </>
                ) : (
                  "Finish & go to dashboard"
                )}
              </Button>
            ) : (
              <Button onClick={() => setStepIndex((i) => i + 1)}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Connect WhatsApp ─────────────────────────────────────────────────

function WhatsAppStep({ connected }: { connected: boolean }) {
  const test = useTestWhatsApp();
  const [banner, setBanner] = useState<Banner>(null);

  const validate = async () => {
    setBanner(null);
    try {
      const result = await test.mutateAsync();
      const name = result.verifiedName ?? result.displayPhoneNumber ?? "your number";
      setBanner({ kind: "success", text: `Connected to ${name}. Credentials are valid.` });
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Could not validate the connection.",
      });
    }
  };

  return (
    <StepShell
      icon={MessageSquare}
      title="Connect WhatsApp"
      done={connected}
      description="Add your Meta WhatsApp Cloud API credentials so messages flow into your inbox."
    >
      <p className="text-sm text-slate-600">
        Enter your Phone Number ID and access token in Settings, then validate the connection here.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/settings" target="_blank" rel="noopener noreferrer">
          <Button variant="secondary">
            Open WhatsApp settings
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Button onClick={validate} disabled={test.isPending}>
          {test.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating…
            </>
          ) : (
            <>
              <PlugZap className="h-4 w-4" />
              Validate connection
            </>
          )}
        </Button>
      </div>
      <BannerLine banner={banner} />
    </StepShell>
  );
}

// ─── Step 2: Invite team ──────────────────────────────────────────────────────

function TeamStep({ onInvited }: { onInvited: () => void }) {
  const invite = useInviteMember();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("AGENT");
  const [banner, setBanner] = useState<Banner>(null);

  const send = async () => {
    setBanner(null);
    try {
      await invite.mutateAsync({ name: name.trim(), email: email.trim(), role });
      setBanner({ kind: "success", text: `Invitation sent to ${email.trim()}.` });
      setName("");
      setEmail("");
      setRole("AGENT");
      onInvited();
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Could not send invite." });
    }
  };

  return (
    <StepShell
      icon={Users}
      title="Invite your team"
      description="Bring in agents and managers. You can always do this later from the Team page."
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ob-name">
            <input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Jane Smith"
            />
          </Field>
          <Field label="Role" htmlFor="ob-role">
            <select
              id="ob-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className={selectClass}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Email address" htmlFor="ob-email">
          <input
            id="ob-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="teammate@company.com"
          />
        </Field>
        <div>
          <Button onClick={send} disabled={!name.trim() || !email.trim() || invite.isPending}>
            {invite.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send invitation"
            )}
          </Button>
        </div>
      </div>
      <BannerLine banner={banner} />
    </StepShell>
  );
}

// ─── Step 3: Upload knowledge ─────────────────────────────────────────────────

function KnowledgeStep({ onUploaded }: { onUploaded: () => void }) {
  const upload = useUploadKnowledgeDoc();
  const [banner, setBanner] = useState<Banner>(null);

  const onFile = async (file: File) => {
    setBanner(null);
    try {
      await upload.mutateAsync({ file });
      setBanner({ kind: "success", text: `Uploaded “${file.name}”.` });
      onUploaded();
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Upload failed." });
    }
  };

  return (
    <StepShell
      icon={BookOpen}
      title="Upload knowledge files"
      description="Add PDFs, Word docs or text files so the AI assistant can answer from your content."
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-600">
        {upload.isPending ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin" />
            <span className="text-sm font-medium">Uploading…</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-7 w-7" />
            <span className="text-sm font-medium">Click to choose a file</span>
            <span className="text-xs text-slate-400">PDF, DOCX or TXT · up to 15MB</span>
          </>
        )}
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          disabled={upload.isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </label>
      <BannerLine banner={banner} />
    </StepShell>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function ReviewStep({ steps }: { steps: OnboardingState["steps"] }) {
  return (
    <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-inset ring-emerald-100">
        <PartyPopper className="h-7 w-7 text-emerald-600" />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-slate-900">You&apos;re ready to go</h3>
      <p className="mt-1.5 text-sm text-slate-500">
        Here&apos;s where you stand — anything you skipped is always available later from the sidebar.
      </p>
      <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left">
        {STEP_META.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            {steps[s.key] ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-300" />
            )}
            <span className={steps[s.key] ? "text-slate-700" : "text-slate-400"}>{s.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Shared step chrome ───────────────────────────────────────────────────────

function StepShell({
  icon: Icon,
  title,
  description,
  done,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            done ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500",
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            {done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="h-3 w-3" /> Done
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BannerLine({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <p
      role="status"
      className={cn(
        "mt-3 rounded-lg px-3 py-2 text-xs ring-1 ring-inset",
        banner.kind === "success"
          ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
          : "bg-rose-50 text-rose-700 ring-rose-600/20",
      )}
    >
      {banner.text}
    </p>
  );
}
