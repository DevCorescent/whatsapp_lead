"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Save,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Button, Card, Field, Skeleton, inputClass } from "@/components/ui";
import { useBusinesses, useUpdateBusiness, type BusinessInput } from "@/hooks/useBusinesses";
import { cn } from "@/lib/utils";

/**
 * WhatsApp credentials for the *active workspace*.
 *
 * These used to be written to `TenantSettings`, which holds one row per tenant — so a tenant running
 * two WhatsApp numbers had one set of credentials between them: saving in one workspace silently
 * overwrote the other, and inbound messages were routed to whichever business happened to be the
 * tenant's oldest, appearing in an inbox nobody was looking at. They are columns on `Business` now
 * and are read and written through the businesses API, so a workspace's connection is its own.
 *
 * The access and verify tokens are never sent to the browser — `publicBusiness` replaces them with
 * `hasWhatsappToken` / `hasWhatsappVerifyToken` booleans — so the inputs for them start empty and an
 * empty value means "leave the stored one alone".
 */

type TestResult = {
  ok: boolean;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  workspace?: string;
  error?: string;
};

/** Roles the businesses API lets edit a workspace. Mirrors MANAGER_ROLES on the route. */
const MANAGER_ROLES = ["SUPER_ADMIN", "TENANT_OWNER", "ADMIN"];

export function WhatsAppTab() {
  const { data: session } = useSession();
  const canEdit = MANAGER_ROLES.includes(session?.user?.role ?? "");

  const { data, isLoading, isError, refetch } = useBusinesses();
  const updateBusiness = useUpdateBusiness();

  const businesses = data?.data ?? [];
  const business = businesses.find((b) => b.id === data?.currentBusinessId) ?? businesses[0] ?? null;

  const [displayNumber, setDisplayNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Seed the form from the workspace, once per workspace.
   *
   * Adjusted during render rather than in an effect, which is what React recommends for "reset this
   * state when that value changes": an effect would run after a paint showing empty inputs, and it
   * would re-run on every background refetch — overwriting whatever the operator had typed with the
   * values already on screen. Keying off the id means a refetch of the *same* workspace leaves the
   * form alone, while switching workspace reloads it.
   */
  const [seededBusinessId, setSeededBusinessId] = useState<string | null>(null);
  if (business && business.id !== seededBusinessId) {
    setSeededBusinessId(business.id);
    setDisplayNumber(business.whatsappPhoneNumber ?? "");
    setPhoneNumberId(business.whatsappPhoneNumberId ?? "");
    setBusinessAccountId(business.whatsappBusinessId ?? "");
    // Secrets are write-only: never prefilled, and blank on save means "unchanged".
    setApiKey("");
    setVerifyToken("");
    setTestResult(null);
    setError(null);
  }

  const hasToken = Boolean(business?.hasWhatsappToken) || apiKey.trim().length > 0;
  const connected = Boolean(phoneNumberId) && hasToken;

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/whatsapp`
      : "/api/webhook/whatsapp";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/settings/whatsapp-test");
      const j = await r.json();
      if (j.success) {
        setTestResult({ ok: true, ...j.data });
      } else {
        setTestResult({ ok: false, error: j.error ?? "Connection failed" });
      }
    } catch {
      setTestResult({ ok: false, error: "Network error — could not reach the server" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!business) return;
    setError(null);

    // Only the secrets are conditional: an empty one means "keep what is stored", while an empty
    // id is a deliberate clear and is sent as such.
    const payload: BusinessInput & { id: string } = {
      id: business.id,
      name: business.name,
      whatsappPhoneNumber: displayNumber.trim(),
      whatsappPhoneNumberId: phoneNumberId.trim(),
      whatsappBusinessId: businessAccountId.trim(),
      ...(apiKey.trim() && { whatsappAccessToken: apiKey.trim() }),
      ...(verifyToken.trim() && { whatsappVerifyToken: verifyToken.trim() }),
    };

    try {
      await updateBusiness.mutateAsync(payload);
      setApiKey("");
      setVerifyToken("");
      setTestResult(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !business) {
    return (
      <Card className="flex flex-col items-start gap-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <AlertCircle className="h-4 w-4 text-rose-500" />
          Couldn&apos;t load this workspace
        </p>
        <p className="text-sm text-slate-500">
          The workspace settings service didn&apos;t respond, so there is nothing to edit yet.
        </p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Which workspace these credentials belong to. Without this the screen looks tenant-wide,
          which is exactly the misunderstanding that made the old behaviour so surprising. */}
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200/70">
        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="min-w-0">
          These credentials apply to <strong className="font-semibold text-slate-900">{business.name}</strong> only.
          {businesses.length > 1 && " Switch workspace in the sidebar to configure another."}
        </span>
      </div>

      {/* Status card */}
      <Card className={cn(
        "flex flex-wrap items-center justify-between gap-4 p-5",
        connected ? "border-emerald-300 bg-emerald-50/40" : "",
      )}>
        <div className="flex items-center gap-3">
          <span className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full",
            connected ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400",
          )}>
            {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          </span>
          <div>
            <p className={cn("flex items-center gap-2 font-semibold", connected ? "text-emerald-800" : "text-slate-700")}>
              <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-slate-300")} />
              {connected ? "Credentials saved" : "Not connected"}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {connected
                ? "Click 'Test Connection' to verify your credentials are working with Meta."
                : "Add your Meta credentials below to start sending and receiving messages."}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={!connected || testing}
          onClick={testConnection}
        >
          {testing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</>
          ) : (
            <><PlugZap className="h-4 w-4" /> Test Connection</>
          )}
        </Button>
      </Card>

      {/* Test result banner */}
      {testResult && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3.5",
          testResult.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800",
        )}>
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          )}
          <div className="text-sm">
            {testResult.ok ? (
              <>
                <p className="font-semibold">Connection successful</p>
                <p className="mt-0.5 text-emerald-700">
                  Phone: <strong>{testResult.phoneNumber}</strong>
                  {testResult.verifiedName && testResult.verifiedName !== "—" && (
                    <> · Name: <strong>{testResult.verifiedName}</strong></>
                  )}
                  {testResult.qualityRating && testResult.qualityRating !== "—" && (
                    <> · Quality: <strong>{testResult.qualityRating}</strong></>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Connection failed</p>
                <p className="mt-0.5 text-rose-700">{testResult.error}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Credentials form */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900">Meta credentials</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Find these in Meta Business Suite → WhatsApp → API Setup.
        </p>

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display number" htmlFor="wa-display">
              <input
                id="wa-display"
                value={displayNumber}
                onChange={(e) => setDisplayNumber(e.target.value)}
                disabled={!canEdit}
                className={inputClass}
                placeholder="+91 98765 43210"
              />
              <p className="mt-1.5 text-xs text-slate-500">Shown in the workspace switcher.</p>
            </Field>
            <Field label="Phone Number ID" htmlFor="wa-phone-id" required>
              <input
                id="wa-phone-id"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                disabled={!canEdit}
                className={cn(inputClass, "font-mono text-xs")}
                placeholder="109876543210987"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Meta routes inbound messages by this id — it must be unique to this workspace.
              </p>
            </Field>
          </div>

          <Field label="Business Account ID" htmlFor="wa-business-id">
            <input
              id="wa-business-id"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              disabled={!canEdit}
              className={cn(inputClass, "font-mono text-xs")}
              placeholder="123456789012345"
            />
          </Field>

          <Field label="API key" htmlFor="wa-api-key" required={!business.hasWhatsappToken}>
            <div className="relative">
              <input
                id="wa-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!canEdit}
                className={cn(inputClass, "pr-10 font-mono text-xs")}
                placeholder={business.hasWhatsappToken ? "•••••• (unchanged)" : "EAAG…"}
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
              Stored encrypted and never sent back to the browser. Leave blank to keep the saved one.
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
                {copied ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
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
              disabled={!canEdit}
              className={cn(inputClass, "font-mono text-xs")}
              placeholder={business.hasWhatsappVerifyToken ? "•••••• (unchanged)" : "my-verify-token"}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Must match the token you enter in Meta&apos;s webhook config.
            </p>
          </Field>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-rose-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!canEdit && (
          <p className="mt-3 text-sm text-slate-500">
            Only workspace owners and admins can change the WhatsApp connection.
          </p>
        )}

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={() => void save()} disabled={!canEdit || updateBusiness.isPending}>
            {updateBusiness.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : saved ? (
              <><Check className="h-4 w-4 text-emerald-200" /> Saved!</>
            ) : (
              <><Save className="h-4 w-4" /> Save Changes</>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
