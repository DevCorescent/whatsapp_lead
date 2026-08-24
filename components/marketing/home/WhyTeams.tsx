import { Building2, FileLock2, KeyRound, ShieldCheck, Split, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";

/*
 * Social proof: awaiting real customer data from the client.
 *
 * This slot is where testimonials would go. The project has none that can be
 * verified — the names, companies, quotes and star ratings previously on the
 * marketing pages were placeholder copy — so publishing them would be inventing
 * customers. Until real, attributable quotes are supplied, the space is used for
 * claims that can be checked against the codebase instead.
 *
 * Drop a testimonial carousel in here when the client provides one.
 */

const REASONS = [
  {
    icon: ShieldCheck,
    title: "The official Meta Cloud API",
    body: "Not an unofficial bridge or a phone farm. Your number runs on the WhatsApp Business Platform, with signature-verified webhooks and delivery receipts straight from Meta.",
  },
  {
    icon: Building2,
    title: "Several numbers, one account",
    body: "Each business gets its own inbox, contacts, tags, templates, flows and AI configuration. Run two brands without two subscriptions or two logins.",
  },
  {
    icon: KeyRound,
    title: "Roles that hold at the route",
    body: "Six roles, enforced in middleware rather than by hiding buttons. An agent who types the URL for billing still does not reach it.",
  },
  {
    icon: FileLock2,
    title: "Credentials encrypted at rest",
    body: "Your WhatsApp access token is encrypted before it is stored and never returned to the browser — not in an API response, not in a settings form.",
  },
  {
    icon: UserX,
    title: "Opt-out handled for you",
    body: "STOP, UNSUBSCRIBE, CANCEL and QUIT unsubscribe a contact automatically and confirm it. Opted-out contacts are skipped by AI, flows and campaigns alike.",
  },
  {
    icon: Split,
    title: "Workspaces that cannot see each other",
    body: "Every query is scoped to your workspace. A record from another account answers as if it does not exist, because to you it does not.",
  },
];

export function WhyTeams() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Why teams choose WhatsCRM"
          title="Built to be trusted with your busiest channel"
          description="The things that matter once WhatsApp stops being an experiment and starts being where your revenue comes from."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((reason, i) => (
            <Reveal key={reason.title} delay={i * 70}>
              <div
                className={cn(
                  "wa-hover-lift group h-full rounded-2xl bg-slate-50/80 p-6 ring-1 ring-inset ring-slate-900/5",
                  "hover:bg-white hover:shadow-lg hover:shadow-slate-900/5 hover:ring-emerald-500/20",
                )}
              >
                <span className="wa-icon-tilt flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-inset ring-slate-900/5">
                  <reason.icon className="h-4.5 w-4.5 text-emerald-600" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">
                  {reason.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{reason.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
