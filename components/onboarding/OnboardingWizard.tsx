"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, CheckCircle2, MessageSquare, Rocket, X } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const STORAGE_KEY = (tenantId: string) => `onboarded_v1_${tenantId}`;

function useOnboardingVisible(tenantId: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if never completed and user is on a real browser
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(STORAGE_KEY(tenantId));
    if (!done) setVisible(true);
  }, [tenantId]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY(tenantId), "1");
    setVisible(false);
  };

  return { visible, dismiss };
}

type Step = "welcome" | "whatsapp" | "ai" | "done";

const STEPS: Step[] = ["welcome", "whatsapp", "ai", "done"];

const STEP_INFO: Record<Step, { icon: React.ComponentType<{className?: string}>; title: string; description: string }> = {
  welcome: { icon: Rocket, title: "Welcome to WhatsCRM!", description: "Let's get your workspace set up in 3 quick steps." },
  whatsapp: { icon: MessageSquare, title: "Connect WhatsApp", description: "Add your Meta credentials to start sending and receiving messages." },
  ai: { icon: Bot, title: "Set up AI assistant", description: "Configure how the AI should respond to your customers." },
  done: { icon: CheckCircle2, title: "You're all set!", description: "Your workspace is ready. You can change any of these settings later." },
};

export function OnboardingWizard({ tenantId, tenantName }: { tenantId: string; tenantName?: string | null }) {
  const { visible, dismiss } = useOnboardingVisible(tenantId);
  const [step, setStep] = useState<Step>("welcome");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waApiKey, setWaApiKey] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [autoReply, setAutoReply] = useState(false);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const promises = [];
      if (waPhoneNumberId || waApiKey) {
        promises.push(
          fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ waPhoneNumberId, waApiKey }),
          })
        );
      }
      promises.push(
        fetch("/api/settings/ai", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiEnabled, autoReply }),
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      setStep("done");
    },
  });

  if (!visible) return null;

  const currentIndex = STEPS.indexOf(step);
  const { icon: Icon, title, description } = STEP_INFO[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Skip setup"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress bar */}
        <div className="flex gap-1 rounded-t-2xl overflow-hidden">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 transition-all",
                i <= currentIndex ? "bg-emerald-500" : "bg-slate-100"
              )}
            />
          ))}
        </div>

        <div className="p-8">
          {/* Icon + heading */}
          <div className="mb-6 flex flex-col items-center text-center">
            <span className={cn(
              "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl",
              step === "done" ? "bg-emerald-100 text-emerald-600" : "bg-emerald-50 text-emerald-600"
            )}>
              <Icon className="h-8 w-8" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>

          {/* Step content */}
          {step === "welcome" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Hi there! 👋</p>
                <p className="mt-1">You're setting up <strong>{tenantName ?? "your workspace"}</strong>. We'll help you:</p>
                <ul className="mt-2 space-y-1 list-none">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />Connect your WhatsApp Business number</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />Enable AI auto-replies</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />Start receiving messages</li>
                </ul>
              </div>
            </div>
          )}

          {step === "whatsapp" && (
            <div className="space-y-4">
              <Field label="Phone Number ID" htmlFor="ob-phone-id">
                <input id="ob-phone-id" value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)}
                  className={cn(inputClass, "font-mono text-xs")} placeholder="109876543210987" />
                <p className="mt-1 text-xs text-slate-500">Find this in Meta Business Suite → WhatsApp → API Setup</p>
              </Field>
              <Field label="Access Token (API Key)" htmlFor="ob-api-key">
                <input id="ob-api-key" type="password" value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)}
                  className={cn(inputClass, "font-mono text-xs")} placeholder="EAAG..." />
              </Field>
              <p className="text-xs text-slate-400">You can also skip this and add credentials later in Settings → WhatsApp.</p>
            </div>
          )}

          {step === "ai" && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/30 transition">
                <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span>
                  <span className="block font-medium text-slate-900">Enable AI assistant</span>
                  <span className="block text-sm text-slate-500">The AI suggests replies and can qualify leads automatically.</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition", !aiEnabled && "opacity-40 pointer-events-none")}>
                <input type="checkbox" checked={autoReply} onChange={(e) => setAutoReply(e.target.checked)}
                  disabled={!aiEnabled}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <span>
                  <span className="block font-medium text-slate-900">Auto-reply to inbound messages</span>
                  <span className="block text-sm text-slate-500">AI replies immediately when a new message arrives.</span>
                </span>
              </label>
            </div>
          )}

          {step === "done" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Everything is saved!</p>
              <p className="mt-1">Head to <strong>Inbox</strong> to see your conversations, or explore the sidebar to discover more features.</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep(STEPS[currentIndex - 1])}
              disabled={currentIndex === 0}
              className="text-sm font-medium text-slate-500 hover:text-slate-800 disabled:invisible"
            >
              ← Back
            </button>

            <div className="flex gap-2">
              {step !== "done" && (
                <Button variant="secondary" onClick={dismiss}>Skip setup</Button>
              )}
              {step === "ai" ? (
                <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? "Saving…" : "Finish Setup"}
                </Button>
              ) : step === "done" ? (
                <Button onClick={dismiss}>
                  Go to Dashboard
                </Button>
              ) : (
                <Button onClick={() => setStep(STEPS[currentIndex + 1])}>
                  {step === "welcome" ? "Get Started" : "Continue"} →
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
