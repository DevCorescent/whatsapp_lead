"use client";

// Multi-step onboarding wizard. Shown once after a new workspace is created.
// Guides the user through: welcome → connect WhatsApp → done.
// On completion sets onboardingCompleted = true and redirects to /inbox.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, CheckCircle2, ChevronRight, Loader2,
  MessageSquare, Rocket, Smartphone,
} from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

type Step = "welcome" | "whatsapp" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "welcome",   label: "Welcome" },
  { id: "whatsapp",  label: "Connect WhatsApp" },
  { id: "done",      label: "You're ready" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  // Check if already completed — send them straight to inbox
  const { isLoading, data: settingsData } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      const j = await res.json();
      return j.data as { onboardingCompleted?: boolean };
    },
  });

  useEffect(() => {
    if (settingsData?.onboardingCompleted) router.replace("/inbox");
  }, [settingsData, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  async function complete() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    router.replace("/inbox");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition-colors",
                i < stepIndex  ? "border-emerald-600 bg-emerald-600 text-white"
                  : i === stepIndex ? "border-emerald-600 text-emerald-600 bg-white"
                  : "border-slate-200 text-slate-400 bg-white",
              )}>
                {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn("text-sm font-medium hidden sm:block",
                i <= stepIndex ? "text-slate-700" : "text-slate-400")}>{s.label}</span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-slate-300 mx-1" />
              )}
            </div>
          ))}
        </div>
        <div className="h-1.5 rounded-full bg-slate-100">
          <div
            className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${((stepIndex) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      {step === "welcome" && <WelcomeStep onNext={() => setStep("whatsapp")} />}
      {step === "whatsapp" && <WhatsAppStep onNext={() => setStep("done")} onSkip={() => setStep("done")} />}
      {step === "done" && <DoneStep onFinish={complete} />}
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
        <Rocket className="h-8 w-8 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to WhatsCRM!</h1>
      <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
        Let's get your workspace set up in just 2 steps. It only takes a couple of minutes.
      </p>
      <ul className="mb-8 space-y-3 text-left max-w-xs mx-auto">
        {[
          { icon: Smartphone, label: "Connect your WhatsApp Business number" },
          { icon: MessageSquare, label: "Send your first message" },
        ].map(({ icon: Icon, label }, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-slate-600">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{i + 1}</span>
            <Icon className="h-4 w-4 text-slate-400 shrink-0" />
            {label}
          </li>
        ))}
      </ul>
      <Button onClick={onNext} className="px-8">
        Get started <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function WhatsAppStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function save() {
    if (!phoneNumberId || !apiKey) {
      setError("Phone Number ID and Access Token are required");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waPhoneNumberId: phoneNumberId,
          waApiKey: apiKey,
          ...(businessId && { waBusinessAccountId: businessId }),
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/whatsapp/test", { method: "POST" });
      const j = await res.json();
      setTestResult(j.success ? "✓ Connected successfully" : `✗ ${j.error ?? "Test failed"}`);
    } catch {
      setTestResult("✗ Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
          <Smartphone className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Connect WhatsApp Business</h2>
          <p className="text-xs text-slate-500">You'll need your phone number ID and access token from Meta.</p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Phone Number ID" htmlFor="pnid" required>
          <input id="pnid" className={inputClass} placeholder="1234567890"
            value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">Found in Meta Business Manager → WhatsApp → Phone Numbers</p>
        </Field>

        <Field label="Permanent Access Token" htmlFor="token" required>
          <input id="token" type="password" className={inputClass} placeholder="EAAxxxxxxx…"
            value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">System user token from Meta Business Manager — not the temporary test token</p>
        </Field>

        <Field label="Business Account ID" htmlFor="baid">
          <input id="baid" className={inputClass} placeholder="9876543210"
            value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">Optional — used for template submission</p>
        </Field>

        {error && <p className="text-xs text-rose-600">{error}</p>}

        {testResult && (
          <p className={cn("text-xs font-medium", testResult.startsWith("✓") ? "text-emerald-700" : "text-rose-600")}>
            {testResult}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Save & continue <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
        <Button variant="secondary" onClick={testConnection} disabled={testing || !phoneNumberId || !apiKey}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test connection"}
        </Button>
        <button onClick={onSkip} className="text-sm text-slate-400 underline hover:text-slate-600 ml-auto self-center">
          Skip for now
        </button>
      </div>
    </div>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">You're all set!</h1>
      <p className="text-slate-500 text-sm mb-8 max-w-sm mx-auto">
        Your workspace is ready. Head to your inbox to start conversations, or explore the dashboard.
      </p>
      <Button onClick={onFinish} className="px-8">
        Go to inbox <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
