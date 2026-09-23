"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Link2Off,
  Loader2,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card, Modal, Skeleton } from "@/components/ui";
import { useBusinesses, type BusinessDTO } from "@/hooks/useBusinesses";
import {
  useConnectWhatsApp,
  useDisconnectWhatsApp,
  useTestWhatsAppConnection,
  useWhatsAppIntegrations,
  useWhatsAppSignupConfig,
  type WhatsAppIntegrationDTO,
  type WhatsAppTestDTO,
} from "@/hooks/useWhatsAppConnection";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Meta's official WhatsApp Embedded Signup, as a card.
//
// The button below really does run Meta's flow: it loads Facebook's JavaScript
// SDK and calls FB.login with the deployment's Facebook Login for Business
// `config_id`. Everything the customer sees after that — the terms, the business
// portfolio picker, the WABA picker, phone verification — is Meta's own dialog,
// rendered by Meta, on Meta's domain.
//
// Two things come back on two different channels, which is the part worth
// knowing when reading this file:
//
//   · a `postMessage` of type WA_EMBEDDED_SIGNUP carrying waba_id / phone_number_id
//   · the FB.login callback carrying a single-use authorization code
//
// Neither is acted on here. Both are posted to our server, which exchanges the
// code for a token and then re-derives the ids from Meta rather than believing
// the ones this component forwarded. The code expires after thirty seconds, so
// the POST goes out immediately on the callback.
// ─────────────────────────────────────────────────────────────────────────────

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_SDK_SCRIPT_ID = "facebook-jssdk";

interface FbAuthResponse {
  code?: string;
  accessToken?: string;
  userID?: string | null;
  expiresIn?: number | null;
}

interface FbLoginResponse {
  authResponse?: FbAuthResponse | null;
  status?: string;
}

interface FbLoginOptions {
  config_id: string;
  response_type?: "code";
  override_default_response_type?: boolean;
  extras: { setup: Record<string, unknown> };
}

declare global {
  interface Window {
    FB?: {
      init(options: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }): void;
      login(cb: (response: FbLoginResponse) => void, options: FbLoginOptions): void;
    };
    fbAsyncInit?: () => void;
  }
}

/** Payload Meta posts to the opener window as the customer moves through the flow. */
interface EmbeddedSignupMessage {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    current_step?: string;
    error_message?: string;
  };
}

type SdkState = "loading" | "ready" | "error";

/**
 * Load Facebook's JavaScript SDK once per page and report when FB.init has run.
 *
 * `fbAsyncInit` is assigned before the script is appended because the SDK calls it the moment
 * it finishes parsing — assigning afterwards is a race that passes locally on a warm cache and
 * fails on a cold one. Re-mounting is safe: an already-initialised SDK is detected by the
 * presence of window.FB rather than by loading a second copy.
 */
function useFacebookSdk(appId: string | undefined, version: string | undefined): SdkState {
  // Starts "loading" on both server and client so the first client render matches the
  // markup React hydrates, and every transition out of it comes from a callback rather
  // than from the effect body — a synchronous setState there would re-render the whole
  // card before it has painted once.
  const [state, setState] = useState<SdkState>("loading");

  useEffect(() => {
    if (!appId || !version) return;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setState("ready");
    };
    const markError = () => {
      if (!cancelled) setState("error");
    };

    // Assigned before the script is appended: the SDK calls fbAsyncInit the moment it
    // finishes parsing, and assigning afterwards is a race that passes on a warm cache
    // and fails on a cold one.
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      markReady();
    };

    // Already initialised by an earlier mount of this card. The SDK will not call
    // fbAsyncInit a second time, so the transition is scheduled rather than made here.
    if (window.FB) {
      const timer = setTimeout(markReady, 0);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // A script tag already in the document is still loading; its own onload will call the
    // fbAsyncInit just assigned, so appending another would only load the SDK twice.
    if (!document.getElementById(FB_SDK_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = FB_SDK_SCRIPT_ID;
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.onerror = markError;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [appId, version]);

  return state;
}

/**
 * True only for facebook.com and its subdomains.
 *
 * Meta's own sample uses `origin.endsWith('facebook.com')`, which also accepts
 * `https://notfacebook.com` — a domain anyone can register. Since this listener is what
 * decides whether a message is treated as onboarding data, the host is parsed and matched
 * on a label boundary instead.
 */
function isFacebookOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

/**
 * Show an id without printing it in full.
 *
 * WABA and phone number ids are not secrets, but this panel is the kind of screen an agent
 * has open during a screen share, and four trailing digits identify the account to its owner
 * while being useless to anyone watching.
 */
function maskId(id: string | null | undefined): string {
  if (!id) return "—";
  const trimmed = id.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

/** One label/value row in the connected-account summary. */
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm text-slate-900",
          mono && "font-mono text-xs text-slate-600",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/** Meta's brand glyph for the official login button. */
function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-current">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

/** Per-number outcome of the last Test press, shown on that number's card. */
type TestOutcome = { ok: true; data: WhatsAppTestDTO } | { ok: false; error: string };

/** A copy of `record` without `key`. */
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** Meta's quality rating as a coloured badge — GREEN/YELLOW/RED are Meta's own values. */
function qualityClass(rating: string | null): string {
  switch (rating?.toUpperCase()) {
    case "GREEN":
      return "text-emerald-700";
    case "YELLOW":
      return "text-amber-700";
    case "RED":
      return "text-rose-700";
    default:
      return "";
  }
}

/** One connected number, with its own Test and Disconnect actions. */
function IntegrationCard({
  integration,
  outcome,
  testing,
  onTest,
  onDisconnect,
}: {
  integration: WhatsAppIntegrationDTO;
  outcome: TestOutcome | undefined;
  testing: boolean;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const label = integration.phoneNumber || integration.displayName || "this number";

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        integration.isActive ? "border-slate-200 bg-slate-50/70" : "border-dashed border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-900">
              {integration.displayName || "WhatsApp Business"}
            </h4>
            {integration.isDefault && (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Default</Badge>
            )}
            <Badge
              className={
                integration.isActive
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                  : "bg-slate-100 text-slate-500 ring-slate-500/15"
              }
            >
              {integration.isActive ? "Active" : "Disconnected"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {integration.phoneNumber || "WhatsApp number unavailable"}
          </p>
        </div>

        {integration.isActive && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onTest}
              disabled={testing}
              aria-label={`Test connection for ${label}`}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <PlugZap className="h-3.5 w-3.5" aria-hidden />
              )}
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onDisconnect}
              aria-label={`Disconnect ${label}`}
            >
              <Link2Off className="h-3.5 w-3.5" aria-hidden />
              Disconnect
            </Button>
          </div>
        )}
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="Display Name" value={integration.displayName ?? "—"} />
        <DetailRow label="WhatsApp Number" value={integration.phoneNumber ?? "—"} />
        <DetailRow label="WABA ID" value={maskId(integration.whatsappBusinessId)} mono />
        <DetailRow label="Phone Number ID" value={maskId(integration.phoneNumberId)} mono />
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Quality Rating</dt>
          <dd className={cn("mt-0.5 truncate text-sm text-slate-900", qualityClass(integration.qualityRating))}>
            {integration.qualityRating ?? "—"}
          </dd>
        </div>
        <DetailRow label="Verification Status" value={integration.codeVerificationStatus ?? "—"} />
      </dl>

      {outcome && (
        <div
          role={outcome.ok ? "status" : "alert"}
          className={cn(
            "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            outcome.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {outcome.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          )}
          <p className="min-w-0">
            {outcome.ok
              ? `Connection successful — Meta answered for ${outcome.data.displayPhoneNumber ?? label}${
                  outcome.data.qualityRating ? ` (quality ${outcome.data.qualityRating})` : ""
                }.`
              : `Test failed: ${outcome.error}`}
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-xs text-slate-500">
          Connected {new Date(integration.createdAt).toLocaleDateString()}
          {!integration.isActive &&
            " · Conversations on this number can't be answered until it is reconnected."}
        </p>
      </div>
    </div>
  );
}

export function WhatsAppConnectCard({ businessId }: { businessId?: string }) {
  const { data: businessesData, isLoading: businessesLoading } = useBusinesses();
  const { data: config, isLoading: configLoading, error: configError } = useWhatsAppSignupConfig();

  const target: BusinessDTO | undefined = (() => {
    const list = businessesData?.data ?? [];
    const wanted = businessId ?? businessesData?.currentBusinessId;
    return list.find((b) => b.id === wanted);
  })();

  const {
    data: integrationsData,
    isLoading: integrationsLoading,
    error: integrationsError,
  } = useWhatsAppIntegrations(target?.id);

  const connect = useConnectWhatsApp();
  const disconnect = useDisconnectWhatsApp();
  const test = useTestWhatsAppConnection();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [testOutcomes, setTestOutcomes] = useState<Record<string, TestOutcome>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState<WhatsAppIntegrationDTO | null>(null);

  // What Meta posted on the message channel, held until the login callback supplies the code.
  // A ref rather than state: the FB.login callback reads it once, and a re-render in between
  // would be a render triggered by data the user never sees.
  const signupDataRef = useRef<EmbeddedSignupMessage["data"] | null>(null);
  // Why the flow ended without a code, when Meta told us. Read in the same callback.
  const abortReasonRef = useRef<string | null>(null);

  const sdkState = useFacebookSdk(config?.appId, config?.graphVersion);

  const integrations: WhatsAppIntegrationDTO[] = integrationsData?.integrations ?? [];
  const activeCount = integrations.filter((i) => i.isActive).length;
  const hasLegacyCredentials = integrationsData?.hasLegacyCredentials ?? false;
  const isConnected = activeCount > 0 || hasLegacyCredentials;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;

      let payload: EmbeddedSignupMessage | null = null;
      try {
        payload =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as EmbeddedSignupMessage)
            : (event.data as EmbeddedSignupMessage);
      } catch {
        // Meta also posts non-JSON strings on this channel for its own bookkeeping.
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (payload.event === "CANCEL") {
        const step = payload.data?.current_step;
        abortReasonRef.current = payload.data?.error_message
          ? `Meta reported a problem during onboarding: ${payload.data.error_message}`
          : step
            ? `You closed Meta's window before finishing (last step: ${step.replace(/_/g, " ").toLowerCase()}).`
            : "You closed Meta's window before finishing.";
        return;
      }

      if (payload.event === "ERROR") {
        abortReasonRef.current =
          payload.data?.error_message ??
          "Meta could not complete the onboarding. Please try again.";
        return;
      }

      // Every other event is a FINISH variant — the ids are what we want from it.
      if (payload.data) {
        signupDataRef.current = payload.data;
        abortReasonRef.current = null;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Not wrapped in useCallback: the React Compiler memoizes it, and hand-rolled
  // memoization here is what it reports it cannot preserve.
  const launchSignup = () => {
    if (!config?.configId || !window.FB) return;

    if (window.location.protocol !== "https:") {
      setError(
        "WhatsApp Embedded Signup requires a secure (HTTPS) connection. " +
        "Please access this page over HTTPS and try again.",
      );
      return;
    }

    setError(null);
    setNotice(null);
    setWarnings([]);
    signupDataRef.current = null;
    abortReasonRef.current = null;

    // Capture the page URL before FB.login opens the popup — this is the redirect_uri
    // the SDK registers internally, and the server-side code exchange must match it.
    const pageUrl = `${window.location.origin}${window.location.pathname}`;

    window.FB.login(
      (response) => {
        console.log("[WA Signup] FB.login callback response status:", response?.status);
        const code = response?.authResponse?.code;
        console.log("[WA Signup] code received:", code ? `${code.slice(0, 8)}...` : "NONE");
        console.log("[WA Signup] postMessage data captured:", JSON.stringify(signupDataRef.current));

        if (!code) {
          setError(
            abortReasonRef.current ??
              "Meta did not return an authorization. Nothing was changed — you can try again.",
          );
          return;
        }

        const data = signupDataRef.current;
        console.log("[WA Signup] POSTing to /api/integrations/whatsapp/connect", {
          hasCode: !!code,
          wabaId: data?.waba_id,
          phoneNumberId: data?.phone_number_id,
          businessId: target?.id,
          redirectUri: pageUrl,
        });
        connect.mutate(
          {
            token: code,
            wabaId: data?.waba_id,
            phoneNumberId: data?.phone_number_id,
            businessId: target?.id,
            redirectUri: pageUrl,
          },
          {
            onSuccess: (result) => {
              const number =
                result.data.integration.phoneNumber ?? result.data.integration.displayName ?? "WhatsApp";
              setWarnings(result.warnings ?? []);
              setNotice(
                result.data.created
                  ? `${number} is connected.`
                  : `${number} was already connected — its access and details were refreshed.`,
              );
            },
            onError: (err) => {
              setError(err instanceof Error ? err.message : "Could not complete the connection");
            },
          },
        );
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  };

  const runTest = (integration: WhatsAppIntegrationDTO) => {
    setTestOutcomes((prev) => withoutKey(prev, integration.id));
    test.mutate(integration.id, {
      onSuccess: (result) =>
        setTestOutcomes((prev) => ({ ...prev, [integration.id]: { ok: true, data: result.data } })),
      onError: (err) =>
        setTestOutcomes((prev) => ({
          ...prev,
          [integration.id]: {
            ok: false,
            error: err instanceof Error ? err.message : "Connection test failed",
          },
        })),
    });
  };

  const runDisconnect = () => {
    const integration = confirmDisconnect;
    if (!integration) return;
    setError(null);
    setNotice(null);
    disconnect.mutate(integration.id, {
      onSuccess: (result) => {
        setConfirmDisconnect(null);
        setTestOutcomes((prev) => withoutKey(prev, integration.id));
        setWarnings(result.warnings ?? []);
        setNotice(
          `${integration.phoneNumber ?? integration.displayName ?? "The number"} has been disconnected. Your other numbers, contacts and history are untouched.`,
        );
      },
      onError: (err) => {
        setConfirmDisconnect(null);
        setError(err instanceof Error ? err.message : "Could not disconnect");
      },
    });
  };

  if (configLoading || businessesLoading || integrationsLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-3 h-4 w-72" />
        <Skeleton className="mt-5 h-10 w-56" />
      </Card>
    );
  }

  const busy = connect.isPending;

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              WhatsApp Business
              {isConnected && (
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                  Connected
                </Badge>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {isConnected
                ? "Manage the WhatsApp numbers connected to this business. Each conversation replies from the number the customer wrote to."
                : "Connect your WhatsApp Business account through Meta. No credentials to copy."}
            </p>
          </div>
          {target && (
            <Badge className="bg-slate-50 text-slate-600 ring-slate-500/15">{target.name}</Badge>
          )}
        </div>

        {/* Deployment has not finished Meta app setup — say so plainly and leave the
            manual form below as the way through. */}
        {!config?.enabled && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold">Meta onboarding isn&apos;t set up yet</p>
              <p className="mt-0.5 text-amber-800">
                {configError
                  ? "The connection settings could not be loaded."
                  : config?.missing?.length
                    ? `An administrator needs to set ${config.missing.join(", ")} on this deployment.`
                    : "An administrator needs to finish the Meta app configuration."}{" "}
                Until then, use manual setup below.
              </p>
            </div>
          </div>
        )}

        {config?.enabled && (
          <div className="mt-5">
            <button
              type="button"
              onClick={launchSignup}
              disabled={sdkState !== "ready" || busy || !target}
              aria-busy={busy}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2.5 rounded-lg px-4 py-2.5",
                "text-sm font-semibold text-white shadow-sm transition sm:w-auto",
                "bg-[#1877F2] hover:bg-[#166FE5]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2] focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:bg-slate-300",
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Finishing connection…
                </>
              ) : sdkState === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading Meta…
                </>
              ) : (
                <>
                  <FacebookGlyph />
                  {isConnected ? "Connect another number" : "Continue with Facebook"}
                </>
              )}
            </button>

            {sdkState === "error" && (
              <p className="mt-2 text-xs text-rose-600">
                Meta&apos;s sign-in script could not be loaded. Check your network or any content
                blocker, then reload this page.
              </p>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              You&apos;ll sign in with Meta and pick your WhatsApp Business account. We never see
              your Meta password, and your access token is encrypted before it is stored.
            </p>
          </div>
        )}

        {integrationsError && (
          <p className="mt-4 text-sm text-rose-600">
            {integrationsError instanceof Error
              ? integrationsError.message
              : "Could not load the connected numbers."}
          </p>
        )}

        {hasLegacyCredentials && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <p>
              This business still sends through credentials that were entered by hand before
              Meta onboarding existed. They keep working, but the number is not listed here
              with its own Test and Disconnect. Connect it through Meta above to move it
              across, or ask an administrator to run the WhatsApp backfill.
            </p>
          </div>
        )}

        {target && integrations.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Connected WhatsApp Numbers</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {activeCount} active number{activeCount === 1 ? "" : "s"} on this business.
                  Campaigns and templates use the default number.
                </p>
              </div>
              <Badge className="bg-slate-50 text-slate-600 ring-slate-500/15">{activeCount}</Badge>
            </div>

            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                outcome={testOutcomes[integration.id]}
                testing={test.isPending && test.variables === integration.id}
                onTest={() => runTest(integration)}
                onDisconnect={() => setConfirmDisconnect(integration)}
              />
            ))}
          </div>
        )}

        {/* One live region for every non-error outcome, so a screen reader hears the
            result of a button press without the focus moving. */}
        <div role="status" aria-live="polite" className="empty:hidden">
          {notice && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <p>{notice}</p>
            </div>
          )}

          {warnings.map((w) => (
            <div
              key={w}
              className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <p>{w}</p>
            </div>
          ))}
        </div>

        <div role="alert" className="empty:hidden">
          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Something went wrong</p>
                <p className="mt-0.5 text-rose-700">{error}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={!!confirmDisconnect}
        onClose={() => {
          if (!disconnect.isPending) setConfirmDisconnect(null);
        }}
        title="Disconnect this WhatsApp number?"
        description={
          confirmDisconnect
            ? `${confirmDisconnect.phoneNumber ?? confirmDisconnect.displayName ?? "This number"} will stop sending and receiving WhatsApp messages. Conversations on it can't be answered until it is reconnected. Other numbers${
                confirmDisconnect.isDefault ? " keep working, and the next one becomes the default" : " keep working"
              }. Contacts, conversations, campaigns and templates are kept.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmDisconnect(null)}
            disabled={disconnect.isPending}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={runDisconnect} disabled={disconnect.isPending}>
            {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
