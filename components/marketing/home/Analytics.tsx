import { Clock, MessageSquare, Percent, Target, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Reveal, SectionHeading } from "./primitives";
import { stagger } from "./motion";

/**
 * The dashboard, framed honestly.
 *
 * Every metric named here is computed by /api/analytics from the tenant's own rows —
 * response time from paired inbound/outbound messages, conversion from leads grouped by
 * stage outcome. The figures rendered are a labelled sample, not a platform statistic,
 * and the caption says so rather than leaving a visitor to assume otherwise.
 */

const KPIS = [
  { icon: MessageSquare, label: "Conversations", value: "1,284", delta: "+12.4%", up: true },
  { icon: Target, label: "Leads created", value: "417", delta: "+8.1%", up: true },
  { icon: Trophy, label: "Qualified leads", value: "163", delta: "+21.6%", up: true },
  { icon: Clock, label: "Avg. response time", value: "3.2m", delta: "−41%", up: true },
  { icon: Percent, label: "Conversion rate", value: "18.6%", delta: "+3.2%", up: true },
];

// Sample series for the sparkline — sent vs received, the shape /api/analytics returns.
const SENT = [18, 26, 22, 34, 30, 42, 38, 52, 48, 61, 57, 72];
const RECEIVED = [12, 19, 17, 24, 22, 31, 28, 37, 35, 44, 41, 53];

const STAGES = [
  { name: "New Lead", count: 142, tone: "bg-blue-400" },
  { name: "Contacted", count: 98, tone: "bg-violet-400" },
  { name: "Qualified", count: 63, tone: "bg-amber-400" },
  { name: "Proposal Sent", count: 41, tone: "bg-orange-400" },
  { name: "Won", count: 24, tone: "bg-emerald-500" },
];

/** Builds a smooth-ish polyline from a series, normalised into the viewBox. */
function polyline(series: number[], height: number, width: number) {
  const max = Math.max(...series);
  const step = width / (series.length - 1);
  return series
    .map((value, i) => `${(i * step).toFixed(1)},${(height - (value / max) * height).toFixed(1)}`)
    .join(" ");
}

export function Analytics() {
  const maxStage = Math.max(...STAGES.map((s) => s.count));

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-emerald-50/40 py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Analytics"
          title="Know what your conversations are actually producing"
          description="Response time, leads created, qualified leads and conversion rate — all computed from your own conversations, over the window you pick."
        />

        <Reveal delay={100}>
          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {KPIS.map((kpi, i) => (
              <div
                key={kpi.label}
                style={stagger(i, 80)}
                className="wa-lift wa-hover-lift rounded-2xl bg-white p-5 shadow-sm ring-1 ring-inset ring-slate-900/5 hover:shadow-md hover:shadow-slate-900/5"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/15">
                    <kpi.icon className="h-3.5 w-3.5 text-emerald-600" />
                  </span>
                  <span
                    className={cn(
                      "nums inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      kpi.up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                    )}
                  >
                    <TrendingUp className="h-2.5 w-2.5" />
                    {kpi.delta}
                  </span>
                </div>
                <p
                  style={stagger(i, 80, 140)}
                  className="wa-pop nums mt-4 text-2xl font-bold tracking-tight text-slate-900"
                >
                  {kpi.value}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{kpi.label}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Reveal delay={160} className="lg:col-span-3">
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Messages over time</p>
                  <p className="text-xs text-slate-500">Outbound vs inbound volume</p>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sent
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Received
                  </span>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <svg
                  viewBox="0 0 320 110"
                  className="h-32 w-full min-w-[18rem]"
                  role="img"
                  aria-label="Sample chart of sent and received message volume trending upward"
                >
                  {[0, 27.5, 55, 82.5, 110].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="320"
                      y2={y}
                      stroke="rgb(241 245 249)"
                      strokeWidth="1"
                    />
                  ))}
                  <polyline
                    points={polyline(SENT, 100, 320)}
                    fill="none"
                    stroke="rgb(16 185 129)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ strokeDasharray: 620, ["--wa-dash-len" as string]: "620" }}
                    className="wa-draw-in"
                  />
                  <polyline
                    points={polyline(RECEIVED, 100, 320)}
                    fill="none"
                    stroke="rgb(56 189 248)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 620,
                      ["--wa-dash-len" as string]: "620",
                      transitionDelay: "180ms",
                    }}
                    className="wa-draw-in"
                  />
                </svg>
              </div>
            </div>
          </Reveal>

          <Reveal delay={220} className="lg:col-span-2">
            <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5">
              <p className="text-sm font-semibold text-slate-900">Leads by stage</p>
              <p className="text-xs text-slate-500">Where the pipeline is sitting right now</p>

              <ul className="mt-6 space-y-3.5">
                {STAGES.map((stage, i) => (
                  <li key={stage.name}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium text-slate-600">{stage.name}</span>
                      <span className="nums text-xs font-semibold text-slate-900">
                        {stage.count}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("wa-grow-x h-full rounded-full", stage.tone)}
                        style={{
                          width: `${(stage.count / maxStage) * 100}%`,
                          ...stagger(i, 110, 200),
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal delay={280}>
          <p className="mt-6 text-center text-xs text-slate-500">
            Figures shown are a sample dashboard. Your numbers are computed from your own workspace.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
