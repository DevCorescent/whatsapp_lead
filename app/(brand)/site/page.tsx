// ============================================================================
// PAGE : White-label landing page
//
// The public home of a white-label brand: hero, features, how it works, the
// reseller's own plans (or the platform's if it has none), contact details and a
// closing call to action. All wording is generic or the reseller's own; nothing
// names the platform. A reseller that switched the landing page off sends
// visitors straight to its login page.
// ============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BarChart3, Bot, Check, Globe, Inbox, Mail, MapPin, Megaphone, Phone,
  ShieldCheck, Target, UploadCloud, Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getRequestBrand } from "@/lib/branding";
import { BASE_PLAN_WHERE } from "@/lib/reseller";
import { Container, GridBackdrop, Reveal, SectionHeading, Spotlight } from "@/components/marketing/home/primitives";
import { PageCta, Section } from "@/components/marketing/PageShell";

// Branding and plans change; render per request.
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Inbox, title: "Shared WhatsApp inbox", text: "Your whole team answers customers from one inbox, with assignment and notes." },
  { icon: Megaphone, title: "Bulk broadcasts", text: "Paste numbers or import a sheet and send approved WhatsApp templates in minutes." },
  { icon: Users, title: "Personalised messages", text: "Every contact gets their own details — names, results, due dates — filled in automatically." },
  { icon: Bot, title: "AI replies & chatbot", text: "Answer common questions instantly from your own documents, day and night." },
  { icon: Target, title: "Leads & pipeline", text: "Turn conversations into leads and follow each one through to a sale." },
  { icon: BarChart3, title: "Reports", text: "See what was sent, delivered, read and replied to, for every campaign." },
];

const STEPS = [
  { icon: UploadCloud, title: "Sign up", text: "Create your account in a minute and connect your WhatsApp number." },
  { icon: Megaphone, title: "Reach customers", text: "Import contacts and send your first campaign or broadcast." },
  { icon: ShieldCheck, title: "Grow safely", text: "Opt-outs, blacklists and approved templates keep every send compliant." },
];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const lim = (n: number) => (n > 0 ? n.toLocaleString("en-IN") : "Unlimited");

export default async function BrandLandingPage() {
  const brand = await getRequestBrand();
  if (!brand.isWhiteLabel) redirect("/login");
  if (!brand.landingEnabled) redirect("/login");

  const own = await prisma.plan.findMany({
    where: { resellerId: brand.resellerId, isActive: true },
    orderBy: { priceMonthly: "asc" },
    take: 4,
  });
  const plans = own.length
    ? own
    : await prisma.plan.findMany({ where: BASE_PLAN_WHERE, orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }], take: 4 });

  const title = brand.landingTitle || brand.loginHeadline;
  const subtitle = brand.landingSubtitle || brand.loginSubtext;
  const hasContact = brand.supportEmail || brand.supportPhone || brand.address || brand.website;

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-emerald-50/60 to-white pb-16 pt-14 sm:pb-20 sm:pt-20">
        <GridBackdrop />
        <Spotlight />
        <Container className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-sm ring-1 ring-inset ring-emerald-600/20 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                {brand.name}
              </span>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance text-slate-900 sm:text-5xl">
                {title}
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">{subtitle}</p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 sm:w-auto"
                >
                  Get started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 sm:w-auto"
                >
                  Sign in
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Features ── */}
      <Section id="features" tone="plain">
        <SectionHeading align="center" eyebrow="Features" title="Everything you need to sell on WhatsApp" description="One place for conversations, campaigns and leads." />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title}>
              <Reveal delay={i * 60} className="h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── How it works ── */}
      <Section tone="soft" glow>
        <SectionHeading align="center" eyebrow="How it works" title="Up and running in three steps" />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 80} className="h-full rounded-2xl bg-white/80 p-6 text-center shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-emerald-700">Step {i + 1}</p>
                <h3 className="mt-1 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Pricing ── */}
      {plans.length > 0 && (
        <Section id="pricing" tone="plain">
          <SectionHeading align="center" eyebrow="Pricing" title="Simple plans" description="Start with a free trial. Upgrade when you grow." />
          <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
            {plans.map((p, i) => (
              <Reveal key={p.id} delay={i * 60}>
                <div className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
                  <h3 className="font-semibold text-slate-900">{p.displayName}</h3>
                  {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
                  <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                    {inr(p.priceMonthly)}<span className="text-sm font-normal text-slate-500">/month</span>
                  </p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                    {[`${lim(p.maxContacts)} contacts`, `${lim(p.maxMsgPerMonth)} messages / month`, `${lim(p.maxAgents)} team members`].map((t) => (
                      <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" /> {t}</li>
                    ))}
                  </ul>
                  <Link href="/register" className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                    Choose {p.displayName}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      {/* ── Contact ── */}
      {hasContact && (
        <Section id="contact" tone="soft">
          <SectionHeading align="center" eyebrow="Contact" title={`Talk to ${brand.name}`} />
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
            {brand.supportEmail && (
              <a href={`mailto:${brand.supportEmail}`} className="inline-flex max-w-full items-center gap-2 break-all rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
                <Mail className="h-4 w-4 shrink-0 text-emerald-600" /> {brand.supportEmail}
              </a>
            )}
            {brand.supportPhone && (
              <a href={`tel:${brand.supportPhone.replace(/\s/g, "")}`} className="inline-flex max-w-full items-center gap-2 break-all rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
                <Phone className="h-4 w-4 shrink-0 text-emerald-600" /> {brand.supportPhone}
              </a>
            )}
            {brand.website && (
              <a href={brand.website} rel="noopener noreferrer" target="_blank" className="inline-flex max-w-full items-center gap-2 break-all rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-900/5 hover:bg-slate-50">
                <Globe className="h-4 w-4 shrink-0 text-emerald-600" /> {brand.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {brand.address && (
              <span className="inline-flex max-w-full items-center gap-2 break-words rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-900/5">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-600" /> {brand.address}
              </span>
            )}
          </div>
        </Section>
      )}

      <PageCta
        title={`Start with ${brand.name} today`}
        description="Create your account, connect WhatsApp and send your first campaign in minutes."
        primary={{ label: "Get started", href: "/register" }}
        secondary={{ label: "Sign in", href: "/login" }}
      />
    </>
  );
}
