import type { ReactNode } from "react";

/**
 * The one dark band on the homepage.
 *
 * How-it-works and Features are a single argument — the pipeline, then the parts it
 * is built from — so they share one background rather than sitting on two gradients
 * that happen to be similar. Two stacked sections each painting their own navy is a
 * seam you can see at any zoom level, and it makes the band read as two things.
 *
 * FOUR LAYERS, in this order:
 *   1. a deep navy → dark teal linear gradient, the base
 *   2. a 56px blueprint grid, masked so it dissolves before the edges
 *   3. two emerald/teal mesh blobs, breathing out of phase
 *   4. film grain at 3%, which is what stops the gradient from banding on wide screens
 *
 * Everything is `pointer-events-none` and `aria-hidden`: the band is atmosphere, and
 * none of it may intercept a click on the content above it.
 *
 * `isolate` matters. The blobs are large and blurred; without a stacking context they
 * paint over the section that follows once it scrolls into view.
 */
export function DarkBand({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden bg-[linear-gradient(175deg,#0a1120_0%,#0b1a24_38%,#08202a_68%,#07231f_100%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 wa-grid-dark [mask-image:radial-gradient(ellipse_80%_55%_at_50%_40%,#000_35%,transparent_100%)]"
      />

      {/* The mesh. Two washes, one warm-green and one teal, placed off-centre so the
          band is brightest where the content is and falls away at the corners. */}
      <div
        aria-hidden
        className="wa-drift pointer-events-none absolute -left-40 top-[-10%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.20),transparent_100%)] blur-[2px]"
      />
      <div
        aria-hidden
        className="wa-drift-slow pointer-events-none absolute -right-32 top-1/3 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.16),transparent_100%)] blur-[2px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[-14rem] h-[28rem] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(16,185,129,0.12),transparent_100%)]"
      />

      <div aria-hidden className="wa-noise pointer-events-none absolute inset-0 opacity-[0.035]" />

      {/* A hairline at each edge, so the band has a defined start and end against the
          white sections either side rather than fading into them. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent"
      />

      <div className="relative">{children}</div>
    </div>
  );
}
