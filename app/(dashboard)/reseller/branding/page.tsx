"use client";

// Reseller → Branding (white-label resellers): name, logo, colours, domain,
// contact details and login page text — with a live preview.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, FileText, Globe, Info, LayoutTemplate, Loader2, MessageSquare, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { Button, Card, Field, PageHeader, SkeletonRows, inputClass } from "@/components/ui";
import { api } from "@/components/reseller/shared";

interface Config {
  brandName: string; logoUrl: string | null; faviconUrl: string | null; primaryColor: string; accentColor: string | null;
  domain: string | null; supportEmail: string | null; supportPhone: string | null; website: string | null;
  address: string | null; loginHeadline: string | null; loginSubtext: string | null; isActive: boolean;
  subdomain: string | null; landingEnabled: boolean; landingTitle: string | null; landingSubtitle: string | null;
  termsContent: string | null; privacyContent: string | null;
}

interface DomainCheck {
  domain: string;
  state: "connected" | "pending" | "not_added" | "error";
  message: string;
  record?: { type: string; name: string; value: string };
}

interface FeeStatus {
  period: string; feeMinor: number; paid: boolean; dueSince: string | null; graceDays: number;
  suspended: boolean; suspendedReason: string | null;
}

const inr = (m: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(m / 100);

const EMPTY: Config = {
  brandName: "", logoUrl: "", faviconUrl: "", primaryColor: "#059669", accentColor: "", domain: "",
  supportEmail: "", supportPhone: "", website: "", address: "", loginHeadline: "", loginSubtext: "", isActive: true,
  subdomain: "", landingEnabled: true, landingTitle: "", landingSubtitle: "", termsContent: "", privacyContent: "",
};

export default function ResellerBrandingPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reseller", "branding"],
    queryFn: async () => api<{ data: Config | null; rootDomain: string | null; fee: FeeStatus | null }>("/api/reseller/branding"),
  });
  const pay = useMutation({
    mutationFn: () => api("/api/reseller/branding/pay", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reseller", "branding"] }),
  });

  // Connection status of the saved custom domain (not of what's being typed).
  const savedDomain = data?.data?.domain ?? null;
  const domainCheck = useQuery({
    queryKey: ["reseller", "branding", "domain", savedDomain],
    queryFn: async () => (await api<{ data: DomainCheck | null }>("/api/reseller/branding/domain")).data,
    enabled: Boolean(savedDomain),
    refetchOnWindowFocus: false,
  });

  const [form, setForm] = useState<Config | null>(null);
  // Seed once from the server, during render (not in an effect).
  if (data !== undefined && form === null) {
    setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(data.data ?? {}).map(([k, v]) => [k, v ?? ""])) } as Config);
  }
  const rootDomain = data?.rootDomain ?? null;
  const fee = data?.fee ?? null;
  const siteUrl = form?.domain ? `https://${form.domain}` : form?.subdomain && rootDomain ? `https://${form.subdomain}.${rootDomain}` : null;

  const save = useMutation({
    mutationFn: () => api<{ domainStatus: { status: string; message: string } | null }>("/api/reseller/branding", { method: "PUT", json: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reseller", "branding"] }),
  });

  if (isLoading || (!form && !isError)) return <SkeletonRows rows={6} />;
  if (isError || !form) return <Card className="p-6 text-sm text-rose-700">{(error as Error)?.message ?? "Couldn't load branding."}</Card>;

  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));
  const text = (k: keyof Config, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`b-${k}`}>
      <input id={`b-${k}`} value={String(form[k] ?? "")} onChange={set(k)} className={inputClass} {...props} />
    </Field>
  );
  const color = /^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : "#059669";

  return (
    <div>
      <PageHeader
        title="Branding"
        description="Your clients see this brand instead of the platform's — in the app, on your domain's login page and in emails."
      />
      {fee && (fee.suspended || (!fee.paid && fee.feeMinor > 0)) && (
        <Card className={`mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${fee.suspended ? "ring-rose-200" : "ring-amber-200"}`}>
          <p className={`flex items-start gap-2 text-sm ${fee.suspended ? "text-rose-700" : "text-amber-800"}`}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {fee.suspended
              ? `Your branding is paused${fee.suspendedReason ? ` (${fee.suspendedReason})` : ""}. Your clients currently see the standard branding.`
              : `This month's white-label fee of ${inr(fee.feeMinor)} is unpaid${fee.dueSince ? ` — branding pauses ${fee.graceDays} days after ${new Date(fee.dueSince).toLocaleDateString("en-IN")}` : ""}.`}
          </p>
          <div className="flex shrink-0 gap-2">
            <Link href="/wallet" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">Top up</Link>
            <Button size="sm" className="h-9" disabled={pay.isPending} onClick={() => pay.mutate()}>
              {pay.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Pay {inr(fee.feeMinor)} now
            </Button>
          </div>
          {pay.isError && <p className="text-xs text-rose-700 sm:basis-full">{(pay.error as Error).message}</p>}
        </Card>
      )}
      {fee && fee.feeMinor > 0 && fee.paid && !fee.suspended && (
        <p className="mb-5 flex items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> White-label fee for {fee.period} paid ({inr(fee.feeMinor)} / month from your wallet).
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Brand</h2>
            {text("brandName", "Brand name", { required: true, maxLength: 60 })}
            <div className="grid gap-4 sm:grid-cols-2">
              {text("logoUrl", "Logo URL (https)", { placeholder: "https://…/logo.png" })}
              {text("faviconUrl", "Favicon URL (https)", { placeholder: "https://…/favicon.png" })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary colour" htmlFor="b-primary">
                <div className="flex gap-2">
                  <input type="color" value={color} onChange={set("primaryColor")} className="h-9 w-12 cursor-pointer rounded-lg ring-1 ring-slate-200" aria-label="Pick primary colour" />
                  <input id="b-primary" value={form.primaryColor} onChange={set("primaryColor")} className={inputClass} maxLength={7} />
                </div>
              </Field>
              {text("accentColor", "Accent colour (optional)", { placeholder: "#0f766e", maxLength: 7 })}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Globe className="h-4 w-4" /> Web address</h2>
            {rootDomain && (
              <Field label="Free address" htmlFor="b-subdomain">
                <div className="flex items-center rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
                  <input
                    id="b-subdomain"
                    value={form.subdomain ?? ""}
                    onChange={(e) => setForm((f) => (f ? { ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } : f))}
                    className="w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-sm focus:outline-none"
                    placeholder="yourbrand"
                    maxLength={30}
                  />
                  <span className="shrink-0 pr-3 text-sm text-slate-400">.{rootDomain}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Works straight away — no DNS needed.</p>
              </Field>
            )}
            {text("domain", "Your own domain (optional)", { placeholder: "crm.yourbrand.com" })}
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Add a CNAME record for this domain pointing to <code className="font-mono">cname.vercel-dns.com</code>. Once it
              resolves, your login page is served there with your brand.
            </p>
            {(form.domain ?? "").trim() && (form.domain ?? "").trim().toLowerCase() !== (savedDomain ?? "") && (
              <p className="text-xs font-medium text-amber-700">Click Save branding (at the bottom) to connect this domain and check its status.</p>
            )}
            {savedDomain && (form.domain ?? "").trim().toLowerCase() === savedDomain && (
              <DomainStatus
                check={domainCheck.data ?? null}
                loading={domainCheck.isFetching}
                failed={domainCheck.isError}
                onCheck={() => domainCheck.refetch()}
              />
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><LayoutTemplate className="h-4 w-4" /> Landing page</h2>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.landingEnabled}
                  onChange={(e) => setForm((f) => (f ? { ...f, landingEnabled: e.target.checked } : f))}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Show a landing page
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Visitors to your address see a home page with your brand, features, your plans and contact details.
              Turned off, they go straight to your login page.
            </p>
            {form.landingEnabled && (
              <>
                {text("landingTitle", "Headline", { maxLength: 120, placeholder: "Grow your business on WhatsApp" })}
                <Field label="Introduction" htmlFor="b-lsub">
                  <textarea id="b-lsub" value={form.landingSubtitle ?? ""} onChange={set("landingSubtitle")} className={inputClass} rows={2} maxLength={400} />
                </Field>
              </>
            )}
            {siteUrl && (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900">
                Open your site <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4" /> Terms &amp; privacy</h2>
            <p className="text-xs text-slate-500">
              Leave empty to use a standard version in your brand&apos;s name. Start a line with # for a heading, and - for a bullet point.
            </p>
            <Field label="Terms of service" htmlFor="b-terms">
              <textarea id="b-terms" value={form.termsContent ?? ""} onChange={set("termsContent")} className={`${inputClass} font-mono text-[13px]`} rows={5} maxLength={30000} placeholder={"# Agreement\nThese terms govern…"} />
            </Field>
            <Field label="Privacy policy" htmlFor="b-privacy">
              <textarea id="b-privacy" value={form.privacyContent ?? ""} onChange={set("privacyContent")} className={`${inputClass} font-mono text-[13px]`} rows={5} maxLength={30000} placeholder={"# What we collect\n- Your name and email…"} />
            </Field>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Login page &amp; contact details</h2>
            {text("loginHeadline", "Login headline", { maxLength: 120, placeholder: `Welcome to ${form.brandName || "your brand"}` })}
            <Field label="Login text" htmlFor="b-sub">
              <textarea id="b-sub" value={form.loginSubtext ?? ""} onChange={set("loginSubtext")} className={inputClass} rows={2} maxLength={300} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("supportEmail", "Support email", { type: "email" })}
              {text("supportPhone", "Support phone", { maxLength: 30 })}
            </div>
            {text("website", "Website (https)")}
            {text("address", "Address", { maxLength: 300 })}
          </Card>

          {save.isError && (
            <p className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {(save.error as Error).message}
            </p>
          )}
          {save.isSuccess && (
            <p className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
              Saved. {save.data?.domainStatus?.message ?? ""}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={!form.brandName.trim() || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save branding
            </Button>
          </div>
        </form>

        {/* Live preview of the login panel */}
        <Card className="overflow-hidden lg:sticky lg:top-0">
          <div className="p-6 text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}>
            <div className="flex items-center gap-2.5">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- preview of the reseller's own logo URL
                <img src={form.logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white/15 object-contain" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><MessageSquare className="h-4 w-4" /></span>
              )}
              <span className="text-lg font-bold">{form.brandName || "Your brand"}</span>
            </div>
            <p className="mt-6 text-xl font-bold leading-tight">{form.loginHeadline || `Welcome to ${form.brandName || "your brand"}`}</p>
            <p className="mt-2 text-sm text-white/85">{form.loginSubtext || "Sign in to manage your customer conversations, campaigns and leads."}</p>
            {(form.supportEmail || form.supportPhone) && (
              <p className="mt-4 text-xs text-white/80">{[form.supportEmail, form.supportPhone].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="space-y-2 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Buttons &amp; highlights</p>
            <span className="inline-flex rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: color }}>Sign in</span>
            <p className="text-xs text-slate-500">{siteUrl ? `${siteUrl}/login` : "Set an address to get your own login page."}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

const STATE_STYLE: Record<DomainCheck["state"], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  connected: { label: "Connected", className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", Icon: CheckCircle2 },
  pending: { label: "Waiting for DNS", className: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: Clock },
  not_added: { label: "Not added yet", className: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: Clock },
  error: { label: "Couldn't check", className: "bg-rose-50 text-rose-700 ring-rose-600/20", Icon: AlertCircle },
};

/** Is the saved custom domain live yet, and which DNS record is missing if not. */
function DomainStatus({ check, loading, failed, onCheck }: { check: DomainCheck | null; loading: boolean; failed: boolean; onCheck: () => void }) {
  const style = check ? STATE_STYLE[check.state] : failed ? STATE_STYLE.error : null;
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">{check?.domain ?? "Your domain"}</span>
          {style && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}>
              <style.Icon className="h-3.5 w-3.5" /> {style.label}
            </span>
          )}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={onCheck} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check now
        </Button>
      </div>
      {check && <p className="text-xs text-slate-600">{check.message}</p>}
      {check?.record && (
        <table className="w-full overflow-hidden rounded-md bg-white text-left text-xs ring-1 ring-slate-200">
          <thead className="bg-slate-100 text-slate-500">
            <tr><th className="px-2.5 py-1.5 font-medium">Type</th><th className="px-2.5 py-1.5 font-medium">Name</th><th className="px-2.5 py-1.5 font-medium">Value</th></tr>
          </thead>
          <tbody>
            <tr className="font-mono text-slate-800">
              <td className="px-2.5 py-1.5">{check.record.type}</td>
              <td className="break-all px-2.5 py-1.5">{check.record.name}</td>
              <td className="break-all px-2.5 py-1.5">{check.record.value}</td>
            </tr>
          </tbody>
        </table>
      )}
      {check && check.state !== "connected" && (
        <p className="text-[11px] text-slate-500">DNS changes can take from a few minutes to a few hours. Click Check now again later.</p>
      )}
    </div>
  );
}
