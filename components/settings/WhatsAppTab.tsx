"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Save,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button, Card, Field, inputClass, SkeletonRows } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  useSettings,
  useUpdateSettings,
  useTestWhatsApp,
  type SettingsData,
} from "@/hooks/useSettings";

type Banner = { kind: "success" | "error"; text: string } | null;

export function WhatsAppTab() {
  const { data: settings, isLoading, isError } = useSettings();

  if (isLoading) {
    return (
      <Card className="p-5">
        <SkeletonRows rows={6} />
      </Card>
    );
  }

  if (isError || !settings) {
    return (
      <Card className="p-5 text-sm text-rose-600">
        Couldn&apos;t load WhatsApp settings. Please refresh and try again.
      </Card>
    );
  }

  // Keyed on the connection state so the form remounts (and re-seeds its inputs)
  // after a save changes whether a token is stored.
  return <WhatsAppForm key={String(settings.whatsapp.hasApiKey)} settings={settings} />;
}

function WhatsAppForm({ settings }: { settings: SettingsData }) {
  const update = useUpdateSettings();
  const test = useTestWhatsApp();

  const w = settings.whatsapp;
  const [phoneNumberId, setPhoneNumberId] = useState(w.phoneNumberId);
  const [businessAccountId, setBusinessAccountId] = useState(w.businessAccountId);
  const [appId, setAppId] = useState(w.appId);
  const [apiKey, setApiKey] = useState("");
  const [verifyToken, setVerifyToken] = useState(w.verifyToken);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const hasSavedKey = w.hasApiKey;
  const webhookUrl = w.webhookUrl;
  const connected = (hasSavedKey || apiKey.trim().length > 0) && phoneNumberId.trim().length > 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing useful to show the user */
    }
  };

  const save = async () => {
    setBanner(null);
    try {
      await update.mutateAsync({
        section: "whatsapp",
        data: {
          phoneNumberId: phoneNumberId.trim(),
          businessAccountId: businessAccountId.trim(),
          appId: appId.trim(),
          verifyToken: verifyToken.trim(),
          // Only send the token when a new one was typed, so a save without
          // re-entering it never wipes the stored value.
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        },
      });
      setApiKey("");
      setBanner({ kind: "success", text: "WhatsApp settings saved." });
    } catch (e) {
      setBanner({ kind: "error", text: e instanceof Error ? e.message : "Failed to save." });
    }
  };

  const runTest = async () => {
    setBanner(null);
    try {
      const result = await test.mutateAsync({
        phoneNumberId: phoneNumberId.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      const name = result.verifiedName ?? result.displayPhoneNumber ?? "your number";
      setBanner({ kind: "success", text: `Connected to ${name}. Credentials are valid.` });
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Connection test failed.",
      });
    }
  };

  return (
    <div className="space-y-5">
      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-lg px-4 py-2.5 text-sm ring-1 ring-inset",
            banner.kind === "success"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
              : "bg-rose-50 text-rose-700 ring-rose-600/20",
          )}
        >
          {banner.text}
        </div>
      )}

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
        <Button variant="secondary" disabled={!connected || test.isPending} onClick={runTest}>
          {test.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing…
            </>
          ) : (
            <>
              <PlugZap className="h-4 w-4" />
              Test Connection
            </>
          )}
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

            <Field label="Business Account ID" htmlFor="wa-business-id">
              <input
                id="wa-business-id"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                className={cn(inputClass, "font-mono text-xs")}
                placeholder="123456789012345"
              />
            </Field>
          </div>

          <Field label="App ID" htmlFor="wa-app-id">
            <input
              id="wa-app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className={cn(inputClass, "font-mono text-xs")}
              placeholder="1234567890123456"
            />
          </Field>

          <Field label="Access token" htmlFor="wa-api-key" required={!hasSavedKey}>
            <div className="relative">
              <input
                id="wa-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={cn(inputClass, "pr-10 font-mono text-xs")}
                placeholder={hasSavedKey ? "•••••••••• (leave blank to keep current)" : "EAAG..."}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide access token" : "Show access token"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Stored encrypted. It is never shown to agents or returned by the API.
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
              Must match the token you enter in Meta&apos;s webhook config, and the
              <code className="mx-1 font-mono">WHATSAPP_VERIFY_TOKEN</code>
              environment variable.
            </p>
          </Field>
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
