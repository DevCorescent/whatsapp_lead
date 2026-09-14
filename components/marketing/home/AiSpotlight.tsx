import { MessageCircle, Sparkles } from "lucide-react";
import type { PublicSection } from "@/lib/cms/sections";
import { Container, Reveal, SectionHeading, Stage } from "./primitives";
import { stagger } from "./motion";
import { CmsIcon } from "./cmsIcon";

/**
 * AI spotlight: what the assistant does, beside what it sees.
 *
 * The panel is the one dark surface in this part of the page. It shows a customer
 * message and the readings the AI takes from it — intent, score, budget, next
 * step — which is the qualification story told as a product screen instead of as
 * another paragraph.
 */
export function AiSpotlight({ section }: { section: PublicSection<"ai"> }) {
  const { content, items } = section;
  const features = items.feature;
  const metrics = items.metric;
  const hasPanel = metrics.length > 0 || content.panelMessage;

  return (
    <section id="ai" className="relative scroll-mt-20 overflow-hidden bg-white py-14 sm:py-16">
      <Container>
        <div className={hasPanel ? "grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14" : undefined}>
          <div>
            <SectionHeading eyebrow={content.eyebrow} title={content.title} description={content.description} />

            {features.length > 0 && (
              <Stage className="mt-7 grid gap-3 sm:grid-cols-2">
                {features.map((feature, i) => (
                  <div
                    key={feature.id}
                    style={stagger(i, 80)}
                    className="wa-lift group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-inset ring-slate-900/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-md hover:ring-emerald-500/25"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover:bg-emerald-600">
                      <CmsIcon name={feature.icon} className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover:text-white" />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold tracking-tight text-slate-900">{feature.title}</h3>
                    {feature.description && (
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{feature.description}</p>
                    )}
                  </div>
                ))}
              </Stage>
            )}
          </div>

          {hasPanel && (
            <Reveal delay={120}>
              <div className="relative isolate overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#0a1120_0%,#0b1a24_55%,#07231f_100%)] p-5 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10 sm:p-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.22),transparent_100%)]"
                />
                <div aria-hidden className="wa-grid-dark pointer-events-none absolute inset-0 -z-10 opacity-40" />

                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-inset ring-emerald-400/25">
                      <Sparkles className="h-4 w-4 text-emerald-300" />
                    </span>
                    <span className="truncate text-sm font-semibold text-white">{content.panelTitle}</span>
                  </p>
                  {content.panelStatus && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="wa-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      {content.panelStatus}
                    </span>
                  )}
                </div>

                {content.panelMessage && (
                  <div className="mt-5 max-w-[92%] rounded-2xl rounded-tl-md bg-white/[0.07] px-3.5 py-2.5 ring-1 ring-inset ring-white/10">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
                      <MessageCircle className="h-3 w-3" />
                      Customer · WhatsApp
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-200">{content.panelMessage}</p>
                  </div>
                )}

                {metrics.length > 0 && (
                  <Stage className="mt-5 divide-y divide-white/[0.07] rounded-2xl bg-white/[0.03] px-4 ring-1 ring-inset ring-white/[0.08]">
                    {metrics.map((metric, i) => (
                      <div key={metric.id} style={stagger(i, 90, 120)} className="wa-lift py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs text-slate-400">{metric.label}</span>
                          <span className="text-right text-[13px] font-semibold text-white">{metric.value}</span>
                        </div>
                        {metric.progress > 0 && (
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10">
                            <span
                              style={{ width: `${Math.min(metric.progress, 100)}%`, ...stagger(i, 90, 360) }}
                              className="wa-grow-x block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
                            />
                          </span>
                        )}
                      </div>
                    ))}
                  </Stage>
                )}
              </div>
            </Reveal>
          )}
        </div>
      </Container>
    </section>
  );
}
