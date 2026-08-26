"use client";

/**
 * Shared visual primitives for the marketing homepage.
 *
 * These are the Aceternity patterns the design calls for — Spotlight, Glowing
 * Effect, Moving Border, scroll reveal — rebuilt on IntersectionObserver and the
 * CSS keyframes in app/globals.css. The library itself is not installed and would
 * pull `motion` plus a Tailwind v3 config into a v4 project that has neither, so
 * the primitives live here instead. Nothing in this file is imported by the
 * application; it exists only for components/marketing/home/*.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { stagger } from "./motion";

// ─── Scroll reveal ────────────────────────────────────────────────────────────

/**
 * Reveal an element once, the first time it enters the viewport.
 *
 * Unobserves on the first intersection rather than toggling: a section that fades
 * back out when you scroll up reads as a glitch, and keeping an observer alive for
 * every revealed block on a fourteen-section page is work with nothing to show for it.
 */
export function useInView<T extends HTMLElement>(rootMargin = "-12% 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No observer (a bot, or a very old browser): show the content rather than hide it.
    // Deferred a frame rather than set here, so this stays out of the effect body —
    // a synchronous setState during an effect is a cascading render, and starting the
    // page with every section already revealed is not worth one.
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin, threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, shown };
}

/**
 * Always a `div`, deliberately.
 *
 * A polymorphic `as` prop would let this render an `li` directly inside an `ol`, but it
 * makes the forwarded ref the intersection of every tag it could be, which no single
 * ref type satisfies without a cast. Callers that need list semantics put the `li` on
 * the outside and this on the inside — same markup, no cast.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Stagger in milliseconds, for siblings that should arrive in sequence. */
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("wa-reveal", className)}
    >
      {children}
    </div>
  );
}

/**
 * Reveal with a hint of scale, for large surfaces.
 *
 * Used on the hero dashboard and nothing else. A frame that size fading straight in
 * reads flat; 1.5% of scale gives it somewhere to arrive from without becoming a zoom.
 */
export function RevealScale({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn("wa-reveal-scale", className)}
    >
      {children}
    </div>
  );
}

/**
 * Marks a region as "seen" without animating the region itself.
 *
 * `Reveal` already sets `data-shown`, so children inside one get their staged states
 * for free. This exists for the cases where the container must not move — a grid whose
 * cells animate individually, or a card already revealed by an ancestor — but whose
 * children still need something to key off.
 */
export function Stage({
  children,
  className,
  rootMargin,
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  rootMargin?: string;
  style?: CSSProperties;
  /** For the cases where the staged block is also an anchor target. */
  id?: string;
}) {
  const { ref, shown } = useInView<HTMLDivElement>(rootMargin);
  return (
    <div ref={ref} id={id} data-shown={shown} className={className} style={style}>
      {children}
    </div>
  );
}

// ─── Ambient backgrounds ──────────────────────────────────────────────────────

/**
 * Aceternity's Spotlight, as a set of blurred radial washes.
 *
 * The original renders an SVG ellipse under a blur filter; at hero scale the filter
 * is the expensive part and the result is indistinguishable from a gradient, so this
 * uses gradients. `pointer-events-none` throughout — the wash sits above the grid and
 * below the content, and must never eat a click on the CTA.
 */
export function Spotlight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="wa-spotlight absolute left-1/2 top-0 h-[46rem] w-[76rem] -translate-x-1/2 -translate-y-[46%] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.20),rgba(16,185,129,0.06)_55%,transparent_100%)]" />
      <div className="wa-spotlight absolute -left-40 top-40 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.16),transparent_100%)]" />
      <div className="wa-spotlight absolute -right-32 top-24 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.13),transparent_100%)]" />
    </div>
  );
}

/** Faint blueprint grid, masked so it dissolves before it reaches the section edge. */
export function GridBackdrop({ dark = false }: { dark?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        dark ? "wa-grid-dark" : "wa-grid",
        "[mask-image:radial-gradient(ellipse_75%_60%_at_50%_35%,#000_40%,transparent_100%)]",
      )}
    />
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

/**
 * Aceternity's Glowing Effect card: an emerald aura that lifts on hover.
 *
 * The glow is a sibling layer rather than a `box-shadow` on the card itself, so it
 * can be blurred well past the card's bounds without the border smearing with it.
 */
export function GlowCard({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-400/25 to-teal-400/10 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100"
      />
      <div
        className={cn(
          "relative h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-inset ring-slate-900/5",
          "transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-emerald-900/5 group-hover:ring-emerald-500/25",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Aceternity's Moving Border: a highlight travelling around the edge of a container.
 *
 * A conic gradient rotating behind a slightly inset panel, which is what produces the
 * travelling arc. Used once, on the hero dashboard — the effect reads as "this is
 * live" and stops meaning anything the moment it appears on every card.
 */
export function MovingBorder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-[1.35rem] p-px", className)}>
      <div aria-hidden className="absolute inset-0 overflow-hidden rounded-[1.35rem]">
        <div className="wa-orbit absolute left-1/2 top-1/2 h-[240%] w-[240%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0deg,transparent_288deg,rgba(16,185,129,0.5)_330deg,rgba(45,212,191,0.85)_351deg,transparent_360deg)]" />
      </div>
      <div className="relative h-full w-full rounded-[1.3rem] bg-white">{children}</div>
    </div>
  );
}

// ─── Section furniture ────────────────────────────────────────────────────────

export function Eyebrow({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.18em]",
        tone === "dark" ? "text-emerald-400" : "text-emerald-600",
      )}
    >
      {children}
    </p>
  );
}

/**
 * A section's eyebrow, heading and description, staged in that order.
 *
 * The stagger lives here rather than at each call site so all fourteen sections read
 * in the same rhythm — eyebrow, then heading 90ms later, then description at 180ms.
 * Callers therefore do NOT wrap this in a Reveal: it observes itself, and wrapping it
 * would animate the block twice at two different speeds.
 *
 * 180ms total is deliberately short. The heading is the answer to "what is this
 * section", and making someone wait half a second for it is a cost with no return.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  tone = "light",
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
  className?: string;
}) {
  const { ref, shown } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}
    >
      {eyebrow && (
        <div className="wa-lift">
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2
        style={stagger(1, 90)}
        className={cn(
          "wa-lift mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl",
          tone === "dark" ? "text-white" : "text-slate-900",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          style={stagger(2, 90)}
          className={cn(
            "wa-lift mt-4 text-base leading-relaxed",
            tone === "dark" ? "text-slate-400" : "text-slate-600",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

/** Standard horizontal rhythm. Every section on the page uses exactly this. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
  );
}

// ─── Count-up ─────────────────────────────────────────────────────────────────

/**
 * Animate a number once it is on screen — the hero's 40 → 85 lead score.
 *
 * Driven by requestAnimationFrame against a wall-clock duration rather than a
 * per-frame increment, so the run takes the same time on a 60Hz and a 144Hz display.
 * Honours `prefers-reduced-motion` by jumping straight to the final value: the number
 * is information, and it has to be readable even when the animation is unwelcome.
 */
export function CountUp({
  from,
  to,
  duration = 1400,
  className,
  format,
}: {
  from: number;
  to: number;
  duration?: number;
  className?: string;
  /**
   * Render the running value. Without it the number is rounded to an integer, which
   * is right for a score but not for "3.2m" or "18.6%" — the analytics KPIs pass a
   * formatter so the figure counts up in the units it is finally shown in.
   */
  format?: (value: number) => string;
}) {
  const { ref, shown } = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!shown) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const start = performance.now();

    // Reduced motion is folded into the loop rather than short-circuited above it:
    // the first frame reports progress 1, lands on the final value and stops. Setting
    // it here instead would be a synchronous setState inside the effect body.
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.min((now - start) / duration, 1);
      // easeOutCubic — fast arrival, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, from, to, duration]);

  return (
    <span ref={ref} className={cn("nums", className)}>
      {format ? format(value) : Math.round(value)}
    </span>
  );
}
