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
  useWhatsAppSignupConfig,
  type WhatsAppConnectionDTO,
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
}

interface FbLoginResponse {
  authResponse?: FbAuthResponse | null;
  status?: string;
}

interface FbLoginOptions {
  config_id: string;
  response_type: "code";
  override_default_response_type: boolean;
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

export function WhatsAppConnectCard({ businessId }: { businessId?: string }) {
  const { data: businessesData, isLoading: businessesLoading } = useBusinesses();
  const { data: config, isLoading: configLoading, error: configError } = useWhatsAppSignupConfig();

  const connect = useConnectWhatsApp();
  const disconnect = useDisconnectWhatsApp();
  const test = useTestWhatsAppConnection();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [connection, setConnection] = useState<WhatsAppConnectionDTO | null>(null);
  const [testResult, setTestResult] = useState<WhatsAppTestDTO | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // What Meta posted on the message channel, held until the login callback supplies the code.
  // A ref rather than state: the FB.login callback reads it once, and a re-render in between
  // would be a render triggered by data the user never sees.
  const signupDataRef = useRef<EmbeddedSignupMessage["data"] | null>(null);
  // Why the flow ended without a code, when Meta told us. Read in the same callback.
  const abortReasonRef = useRef<string | null>(null);

  const sdkState = useFacebookSdk(config?.appId, config?.graphVersion);

  const target: BusinessDTO | undefined = (() => {
    const list = businessesData?.data ?? [];
    const wanted = businessId ?? businessesData?.currentBusinessId;
    return list.find((b) => b.id === wanted);
  })();

  const isConnected = Boolean(target?.whatsappPhoneNumberId && target?.hasWhatsappToken);

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

    setError(null);
    setNotice(null);
    setWarnings([]);
    setTestResult(null);
    setTestError(null);
    signupDataRef.current = null;
    abortReasonRef.current = null;

    window.FB.login(
      (response) => {
        const code = response?.authResponse?.code;

        if (!code) {
          // No code means the customer closed the dialog, declined a permission, or Meta
          // ended the session. The message channel usually explains which; if it did not,
          // say what is true rather than guessing at a cause.
          setError(
            abortReasonRef.current ??
              "Meta did not return an authorization. Nothing was changed — you can try again.",
          );
          return;
        }

        const data = signupDataRef.current;
        connect.mutate(
          {
            code,
            wabaId: data?.waba_id,
            phoneNumberId: data?.phone_number_id,
            businessId: target?.id,
          },
          {
            onSuccess: (result) => {
              setConnection(result.connection);
              setWarnings(result.warnings ?? []);
              setNotice("WhatsApp is connected.");
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

  const runTest = () => {
    setTestResult(null);
    setTestError(null);
    test.mutate(target?.id, {
      onSuccess: (result) => setTestResult(result.data),
      onError: (err) =>
        setTestError(err instanceof Error ? err.message : "Connection test failed"),
    });
  };

  const runDisconnect = () => {
    setError(null);
    disconnect.mutate(target?.id, {
      onSuccess: (result) => {
        setConfirmDisconnect(false);
        setConnection(null);
        setTestResult(null);
        setTestError(null);
        setWarnings(result.warnings ?? []);
        setNotice("WhatsApp has been disconnected. Your contacts and history are untouched.");
      },
      onError: (err) => {
        setConfirmDisconnect(false);
        setError(err instanceof Error ? err.message : "Could not disconnect");
      },
    });
  };

  if (configLoading || businessesLoading) {
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
                ? "This business sends and receives on the WhatsApp account below."
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

        {config?.enabled && !isConnected && (
          <div className="mt-5">
            <button
              type="button"
              onClick={launchSignup}
              disabled={sdkState !== "ready" || busy}
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
                  Continue with Facebook
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

        {isConnected && target && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Business" value={target.name} />
              <DetailRow
                label="WhatsApp number"
                value={
                  connection?.displayPhoneNumber ??
                  target.whatsappPhoneNumber ??
                  testResult?.displayPhoneNumber ??
                  "—"
                }
              />
              <DetailRow
                label="WABA ID"
                value={maskId(connection?.wabaId ?? target.whatsappBusinessId)}
                mono
              />
              <DetailRow
                label="Phone number ID"
                value={maskId(connection?.phoneNumberId ?? target.whatsappPhoneNumberId)}
                mono
              />
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={runTest} disabled={test.isPending}>
                {test.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Testing…
                  </>
                ) : (
                  <>
                    <PlugZap className="h-4 w-4" aria-hidden /> Test Connection
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnect.isPending}
              >
                <Link2Off className="h-4 w-4" aria-hidden /> Disconnect
              </Button>
            </div>
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

          {testResult && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Connection successful</p>
                <p className="mt-0.5 text-emerald-700">
                  Number: <strong>{testResult.displayPhoneNumber ?? "—"}</strong>
                  {testResult.verifiedName && (
                    <>
                      {" "}
                      · Name: <strong>{testResult.verifiedName}</strong>
                    </>
                  )}
                  {testResult.qualityRating && (
                    <>
                      {" "}
                      · Quality: <strong>{testResult.qualityRating}</strong>
                    </>
                  )}
                </p>
              </div>
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
          {(error || testError) && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">{error ? "Connection failed" : "Test failed"}</p>
                <p className="mt-0.5 text-rose-700">{error ?? testError}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={confirmDisconnect}
        onClose={() => {
          if (!disconnect.isPending) setConfirmDisconnect(false);
        }}
        title="Disconnect WhatsApp?"
        description={
          target
            ? `"${target.name}" will stop sending and receiving WhatsApp messages. Its contacts, conversations, campaigns and templates are kept — you can reconnect at any time.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmDisconnect(false)}
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
