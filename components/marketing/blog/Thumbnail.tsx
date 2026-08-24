import { cn } from "@/lib/utils";
import type { PostMotif } from "./posts";

/**
 * Article cover art, drawn rather than photographed.
 *
 * Six motifs, all built from the same parts: a pale mint ground, a faint grid, and a
 * simplified fragment of the product's own UI in emerald and slate. Stock photography
 * was rejected because a blog of unrelated desk photos looks like every other SaaS blog;
 * a gradient block was rejected because it says nothing about the article.
 *
 * The whole set shares one palette on purpose — the covers should read as a series, and
 * a reader scanning the grid should be able to tell an AI piece from an automation piece
 * before reading the badge.
 */

export function Thumbnail({ motif, className }: { motif: PostMotif; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate flex h-full w-full items-center justify-center overflow-hidden",
        "bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60",
        className,
      )}
    >
      {/* Faint grid, masked so it fades before the edges. Same treatment as the homepage. */}
      <div className="wa-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_65%_at_50%_50%,#000_35%,transparent_100%)]" />
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_100%)]" />

      <div className="relative w-full max-w-[15rem] px-6 transition-transform duration-500 ease-out group-hover:scale-[1.035]">
        {MOTIF[motif]}
      </div>
    </div>
  );
}

// ─── Shared parts ─────────────────────────────────────────────────────────────

const CARD = "rounded-lg bg-white/95 shadow-sm ring-1 ring-inset ring-slate-900/5";
const BAR = "rounded-full bg-slate-200";

function Line({ w, tone = "slate" }: { w: string; tone?: "slate" | "emerald" }) {
  return (
    <span
      className={cn("block h-1.5 rounded-full", tone === "emerald" ? "bg-emerald-400" : BAR)}
      style={{ width: w }}
    />
  );
}

// ─── Motifs ───────────────────────────────────────────────────────────────────

/** A conversation: one inbound bubble, one emerald reply. */
const Chat = (
  <div className="space-y-2">
    <div className={cn(CARD, "w-[72%] rounded-tl-sm p-2.5")}>
      <div className="space-y-1.5">
        <Line w="100%" />
        <Line w="62%" />
      </div>
    </div>
    <div className="flex justify-end">
      <div className="w-[80%] rounded-lg rounded-tr-sm bg-emerald-50 p-2.5 shadow-sm ring-1 ring-inset ring-emerald-600/20">
        <div className="space-y-1.5">
          <Line w="100%" tone="emerald" />
          <Line w="84%" tone="emerald" />
          <Line w="45%" tone="emerald" />
        </div>
        <div className="mt-2 flex items-center gap-1 border-t border-emerald-600/15 pt-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <Line w="55%" tone="emerald" />
        </div>
      </div>
    </div>
    <div className={cn(CARD, "w-[58%] rounded-tl-sm p-2.5")}>
      <Line w="80%" />
    </div>
  </div>
);

/** A lead score: four criteria ticked, a figure, a filled meter. */
const Score = (
  <div className={cn(CARD, "p-3.5")}>
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      <Line w="42%" />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-1.5 rounded bg-slate-50 px-1.5 py-1">
          <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-100">
            <span className="h-1 w-1 rounded-full bg-emerald-600" />
          </span>
          <Line w="60%" />
        </div>
      ))}
    </div>
    <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-2.5">
      <span className="nums text-xl font-bold leading-none tracking-tight text-slate-900">85</span>
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Qualified
      </span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" />
    </div>
  </div>
);

/** A flow: three nodes on a rail, the middle one active. */
const Flow = (
  <div className="relative space-y-2.5">
    <span
      aria-hidden
      className="absolute left-[13px] top-3 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-emerald-400 via-emerald-300 to-teal-200"
    />
    {[
      { active: false, w: "70%" },
      { active: true, w: "84%" },
      { active: false, w: "58%" },
    ].map((node, i) => (
      <div key={i} className="relative flex items-center gap-2.5">
        <span
          className={cn(
            "relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            node.active
              ? "bg-emerald-500 ring-emerald-600/30"
              : "bg-white ring-slate-900/10",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-sm",
              node.active ? "bg-white" : "bg-slate-300",
            )}
          />
        </span>
        <div className={cn(CARD, "flex-1 px-2.5 py-2")}>
          <Line w={node.w} tone={node.active ? "emerald" : "slate"} />
        </div>
      </div>
    ))}
  </div>
);

/** A pipeline: three columns, a card landing in the emerald one. */
const Pipeline = (
  <div className="grid grid-cols-3 gap-1.5">
    {[
      { tone: "bg-slate-300", cards: 2, active: false },
      { tone: "bg-emerald-500", cards: 3, active: true },
      { tone: "bg-slate-300", cards: 1, active: false },
    ].map((col, i) => (
      <div
        key={i}
        className={cn(
          "rounded-lg p-1.5 ring-1 ring-inset",
          col.active ? "bg-emerald-50/70 ring-emerald-600/20" : "bg-slate-50 ring-slate-900/5",
        )}
      >
        <span className={cn("mb-1.5 block h-1 w-8 rounded-full", col.tone)} />
        <div className="space-y-1.5">
          {Array.from({ length: col.cards }).map((_, c) => (
            <div key={c} className={cn(CARD, "space-y-1 p-1.5")}>
              <Line w="86%" />
              <Line w="52%" tone={col.active && c === 0 ? "emerald" : "slate"} />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** Analytics: a rising bar set under a KPI row. */
const Chart = (
  <div className={cn(CARD, "p-3.5")}>
    <div className="flex items-center justify-between">
      <Line w="38%" />
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700">
        +18%
      </span>
    </div>
    <div className="mt-3 flex h-[52px] items-end gap-1.5">
      {[34, 48, 40, 62, 55, 78, 92].map((h, i) => (
        <span
          key={i}
          style={{ height: `${h}%` }}
          className={cn(
            "flex-1 rounded-sm",
            i >= 5 ? "bg-gradient-to-t from-emerald-500 to-teal-400" : "bg-slate-200",
          )}
        />
      ))}
    </div>
    <div className="mt-2.5 flex gap-2 border-t border-slate-100 pt-2">
      <Line w="30%" />
      <Line w="22%" tone="emerald" />
    </div>
  </div>
);

/** A document, with the citation chip that the product actually attaches. */
const Doc = (
  <div className="relative">
    <div className={cn(CARD, "space-y-1.5 p-3.5")}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="h-4 w-3 rounded-[2px] bg-emerald-100 ring-1 ring-inset ring-emerald-600/20" />
        <Line w="46%" />
      </div>
      <Line w="100%" />
      <Line w="92%" />
      <Line w="97%" />
      <Line w="64%" />
      <div className="!mt-3 space-y-1.5 rounded bg-emerald-50/70 p-2 ring-1 ring-inset ring-emerald-600/15">
        <Line w="88%" tone="emerald" />
        <Line w="56%" tone="emerald" />
      </div>
    </div>
    <div className="absolute -bottom-2 -right-1 flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 shadow-lg">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span className="text-[8px] font-semibold text-white">Source cited</span>
    </div>
  </div>
);

const MOTIF: Record<PostMotif, React.ReactElement> = {
  chat: Chat,
  score: Score,
  flow: Flow,
  pipeline: Pipeline,
  chart: Chart,
  doc: Doc,
};
