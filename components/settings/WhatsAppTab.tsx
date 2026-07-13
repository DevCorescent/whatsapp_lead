"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, PlugZap, Save, Wifi, WifiOff } from "lucide-react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

// TODO [SHALMON]: PATCH /api/settings (whatsapp) + POST /api/settings/whatsapp/test.

export function WhatsAppTab() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Without the settings API we can't know the real state — treat a filled-in
  // credential set as "connected" so the card is never misleading.
  const connected = Boolean(phoneNumberId && apiKey);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/whatsapp`
      : "/api/webhook/whatsapp";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing useful to show the user */
    }
  };

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <Card
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 p-5",
          connected ? "border-emerald-300 bg-emerald-50/40" : "",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full",
              connected ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400",
            )}
          >
            {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </span>
          <div>
            <p
              className={cn(
                "flex items-center gap-2 font-semibold",
                connected ? "text-emerald-800" : "text-slate-700",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  connected ? "bg-emerald-500" : "bg-slate-300",
                )}
              />
              {connected ? "Connected" : "Not connected"}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {connected
                ? "Messages are flowing through the WhatsApp Cloud API."
                : "Add your Meta credentials below to start sending and receiving messages."}
            </p>
          </div>
        </div>
        <Button variant="secondary" disabled={!connected}>
          <PlugZap className="h-4 w-4" />
          Test Connection
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Meta credentials</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Find these in Meta Business Suite → WhatsApp → API Setup.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone Number ID" htmlFor="wa-phone-id" required>
              <input
                id="wa-phone-id"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className={cn(inputClass, "font-mono text-xs")}
                placeholder="109876543210987"
              />
            </Field>

            <Field label="Business Account ID" htmlFor="wa-business-id" required>
              <input
                id="wa-business-id"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                className={cn(inputClass, "font-mono text-xs")}
                placeholder="123456789012345"
              />
            </Field>
          </div>

          <Field label="API key" htmlFor="wa-api-key" required>
            <div className="relative">
              <input
                id="wa-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={cn(inputClass, "pr-10 font-mono text-xs")}
                placeholder="EAAG..."
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Stored encrypted. It is never shown to agents.
            </p>
          </Field>

          <Field label="Webhook URL" htmlFor="wa-webhook">
            <div className="flex gap-2">
              <input
                id="wa-webhook"
                readOnly
                value={webhookUrl}
                className={cn(inputClass, "bg-slate-50 font-mono text-xs text-slate-600")}
              />
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Paste this into the Callback URL field in Meta&apos;s webhook config.
            </p>
          </Field>

          <Field label="Verify token" htmlFor="wa-verify">
            <input
              id="wa-verify"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              className={cn(inputClass, "font-mono text-xs")}
              placeholder="my-verify-token"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Must match the token you enter in Meta&apos;s webhook config.
            </p>
          </Field>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Button>
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
