"use client";

/**
 * Shared interaction primitives for the marketing homepage.
 *
 * Sibling to primitives.tsx, which handles arrival (scroll reveal, staged motion).
 * This file handles what happens after arrival: selection, guided demos, and the
 * detail panels a selection opens.
 *
 * There is deliberately no animation library here. The page already ships a CSS
 * motion system in app/globals.css driven by data attributes, and every effect
 * below is expressed the same way — React toggles `data-open` / `data-active` /
 * `data-pressed` and CSS does the transition. Adding Framer Motion would put a
 * second, heavier motion system next to a working one and put ~30kB of JavaScript
 * on a landing page whose whole argument is that it loads fast.
 *
 * Everything here is keyboard-reachable: selections are real <button>s carrying
 * `aria-pressed` / `aria-expanded`, so the demos are operable without a pointer.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Reduced motion ───────────────────────────────────────────────────────────

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION).matches ?? false;
}

/**
 * Whether the visitor has asked for less movement.
 *
 * CSS handles this for the transitions themselves, but the auto-playing demos are
 * JavaScript — a timer that keeps re-highlighting regions is exactly the kind of
 * unrequested movement the setting exists to stop, and no stylesheet can switch a
 * `setInterval` off.
 *
 * `useSyncExternalStore` rather than an effect that calls setState: matchMedia is an
 * external store, and the server snapshot (`false`) is what makes the first client
 * render match the HTML instead of correcting itself a frame later.
 */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

// ─── Demo controller ──────────────────────────────────────────────────────────

export type DemoSequence<T extends HTMLElement = HTMLDivElement> = {
  /**
   * Attach as the `ref` of the element whose visibility starts the demo.
   *
   * A callback ref rather than a ref object, and named `observe` rather than `ref`,
   * for two reasons. It is generic over the element type — sections attach it to
   * whatever already wraps their steps, an `ol` here, a `div` there — and it keeps
   * anything ref-shaped out of the returned object, so reading `index` from it in
   * JSX is an ordinary property read.
   */
  observe: (node: T | null) => void;
  /** Currently highlighted step. */
  index: number;
  /** Whether the demo is advancing on its own right now. */
  playing: boolean;
  /** Select a step by hand. Stops the auto-advance — the visitor is driving now. */
  select: (index: number) => void;
  /** Step forward or back by hand, for swipe and arrow keys. */
  step: (delta: number) => void;
  /** Play/pause button. */
  toggle: () => void;
};

/**
 * The gentle auto-advance shared by the journey, the workflow and the inbox.
 *
 * Rules, in the order they matter:
 *  1. Nothing moves until the section is actually on screen.
 *  2. Any manual selection stops it. A demo that keeps walking away from the step
 *     you just clicked is fighting you.
 *  3. `prefers-reduced-motion` means it never starts, and the play button is the
 *     only way to run it.
 *  4. It stops at the end unless `loop` is set, so a section left open in a
 *     background tab isn't animating forever.
 */
export function useDemoSequence<T extends HTMLElement = HTMLDivElement>({
  count,
  interval = 2600,
  loop = false,
  autoStart = true,
}: {
  count: number;
  interval?: number;
  loop?: boolean;
  autoStart?: boolean;
}): DemoSequence<T> {
  const reduced = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(false);
  // Once the visitor has taken over, entering the viewport again must not restart
  // the demo underneath them.
  const [touched, setTouched] = useState(false);

  /**
   * Watch for the section arriving, then stop watching. Unobserving on the first
   * intersection is the same choice primitives.tsx makes for scroll reveals: a demo
   * that restarts every time you scroll past is not a demo, it is a distraction.
   * The cleanup returned from the callback ref is React 19's own — it runs when the
   * element is detached.
   */
  const observe = useCallback((node: T | null) => {
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
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
      { rootMargin: "-10% 0px -10% 0px", threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shown || touched || reduced || !autoStart) return;
    const start = window.setTimeout(() => setPlaying(true), 700);
    return () => window.clearTimeout(start);
  }, [shown, touched, reduced, autoStart]);

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next < count) return next;
        if (loop) return 0;
        setPlaying(false);
        return current;
      });
    }, interval);

    return () => window.clearInterval(timer);
  }, [playing, count, interval, loop]);

  const select = useCallback((next: number) => {
    setTouched(true);
    setPlaying(false);
    setIndex(next);
  }, []);

  const step = useCallback(
    (delta: number) => {
      setTouched(true);
      setPlaying(false);
      setIndex((current) => Math.min(count - 1, Math.max(0, current + delta)));
    },
    [count],
  );

  const toggle = useCallback(() => {
    setTouched(true);
    setPlaying((current) => {
      // Restarting from the last step replays from the top rather than sitting
      // on a finished demo with a play button that appears to do nothing.
      if (!current) setIndex((i) => (i >= count - 1 ? 0 : i));
      return !current;
    });
  }, [count]);

  return { observe, index, playing, select, step, toggle };
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

/**
 * Opens a panel to its content's own height.
 *
 * `aria-hidden` while closed so a screen reader doesn't read six collapsed
 * explanations as though they were all on the page at once.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("wa-collapse", className)} data-open={open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

// ─── Detail popover / bottom sheet ────────────────────────────────────────────

/** Distance kept between an anchored panel and the edge of the viewport. */
const EDGE = 12;
/** Gap between the trigger and the panel. */
const GAP = 8;

/**
 * One component, two presentations: an anchored popover where there is a pointer and
 * room for one, a bottom sheet on a phone where there is neither.
 *
 * USAGE. Wrap the trigger and this together in an element carrying
 * `data-popover-root` and `className="relative"`:
 *
 *   <span className="relative" data-popover-root>
 *     <button onClick={toggle}>…</button>
 *     <DetailPopover open={open} onClose={close} title="…">…</DetailPopover>
 *   </span>
 *
 * The shared root is what makes dismissal behave. An outside-click handler that only
 * excluded the panel would fire on the trigger itself, closing the popover a moment
 * before the trigger's own click reopened it — the panel would appear stuck open.
 * Excluding the whole root means the trigger stays a toggle.
 *
 * WHY THIS RENDERS IN A PORTAL
 *
 * It used to be an absolutely-positioned child of its trigger, and that is not a
 * layering problem a z-index can solve. A card with `overflow-hidden`, a `transform`,
 * a `filter` or its own `z-index` creates a stacking or clipping context, and a
 * descendant cannot escape either one however large its z-index is — which is exactly
 * what clipped the BANT criterion panels behind the pipeline card below them. So the
 * panel is portalled to `document.body`, where it has no ancestor left to be trapped
 * by, and is positioned against the viewport instead.
 *
 * PLACEMENT. Measured from the trigger's own rect, then:
 *   • below it if it fits, flipped above if it does not, and pinned inside the
 *     viewport if it fits in neither — a long panel is scrolled, never cropped;
 *   • centred on the trigger horizontally, then clamped so it can never hang off
 *     either edge and give the document a horizontal scrollbar.
 * Position is written straight to the node rather than held in state: it is measured
 * after layout, and a setState there is a second render for something the browser is
 * about to paint anyway.
 */
export function DetailPopover({
  open,
  onClose,
  title,
  children,
  className,
  width = "18rem",
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the panel, and the heading shown at the top of it. */
  title: string;
  children: ReactNode;
  className?: string;
  /** Anchored width. The sheet is always full-bleed. */
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Stays behind in the component tree when the panel leaves for the portal, so the
  // trigger it belongs to can still be found — for measuring, and for deciding what
  // counts as an outside click.
  const anchor = useRef<HTMLSpanElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const place = useCallback(() => {
    const node = panel.current;
    const root = anchor.current?.closest("[data-popover-root]");
    if (!node || !root) return;

    // Below `sm` this is a bottom sheet pinned by its classes; leave it alone.
    if (!window.matchMedia("(min-width: 640px)").matches) {
      node.style.top = "";
      node.style.left = "";
      return;
    }

    const trigger = root.getBoundingClientRect();
    const { width: panelW, height: panelH } = node.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    const below = trigger.bottom + GAP;
    const above = trigger.top - GAP - panelH;
    let top: number;
    if (below + panelH <= viewportH - EDGE) top = below;
    else if (above >= EDGE) top = above;
    else top = Math.max(EDGE, viewportH - EDGE - panelH);

    const centred = trigger.left + trigger.width / 2 - panelW / 2;
    const left = Math.min(Math.max(centred, EDGE), Math.max(EDGE, viewportW - EDGE - panelW));

    node.style.top = `${Math.round(top)}px`;
    node.style.left = `${Math.round(left)}px`;
  }, []);

  // Dismissal: Escape, or a press anywhere outside this popover's own root.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      // The panel is no longer inside the root, so both have to be excluded.
      if (panel.current?.contains(target)) return;
      const root = anchor.current?.closest("[data-popover-root]");
      if (root?.contains(target)) return;
      onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  // Focus moves into the panel on open and back to the trigger on close, so the
  // detail is reachable and dismissible without a pointer.
  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });

    return () => {
      const previous = restoreFocus.current;
      restoreFocus.current = null;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  // Place before paint, then follow the trigger. `capture` on the scroll listener
  // because the trigger may sit inside a scrolling container of its own, whose
  // scroll events never reach window.
  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, place]);

  return (
    <>
      {/* Zero-size, always mounted, never painted: the panel's tie back to the
          trigger it describes. */}
      <span ref={anchor} aria-hidden className="pointer-events-none absolute" />

      {open &&
        createPortal(
          <>
            {/* A scrim on phones only. On a pointer device a popover that dims the
                page is a modal, and this is a footnote. */}
            <div
              aria-hidden
              onClick={onClose}
              className="wa-scrim-in fixed inset-0 z-[90] bg-slate-900/25 sm:hidden"
            />

            <div
              ref={panel}
              role="dialog"
              aria-label={title}
              tabIndex={-1}
              style={{ ["--wa-popover-w" as string]: width }}
              className={cn(
                "wa-detail-in fixed inset-x-0 bottom-0 z-[100] max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 text-left shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/10 focus:outline-none",
                "sm:inset-x-auto sm:bottom-auto sm:max-h-[min(80vh,28rem)] sm:w-[var(--wa-popover-w)] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-2xl",
                className,
              )}
            >
              {/* The grab handle reads as "this can be dismissed" on a touch screen. */}
              <div
                aria-hidden
                className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden"
              />

              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="wa-tap -mr-1 -mt-1 shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2">{children}</div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/**
 * A labelled row inside a detail panel. Every popover on the page uses these, so a
 * document's "indexed sections" and a metric's "trend" line up the same way.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5 first:border-t-0">
      <span className="shrink-0 text-[11px] text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-[11px] font-medium text-slate-800">{value}</span>
    </div>
  );
}

/** Open/close state for a set of mutually exclusive popovers keyed by id. */
export function useOnePopover<T extends string>() {
  const [openId, setOpenId] = useState<T | null>(null);
  const toggle = useCallback((id: T) => setOpenId((current) => (current === id ? null : id)), []);
  const close = useCallback(() => setOpenId(null), []);
  return { openId, toggle, close, setOpenId };
}

// ─── Demo controls ────────────────────────────────────────────────────────────

/** Play/pause plus a dot per step. Small enough to sit in a card header. */
export function DemoControls({
  playing,
  onToggle,
  count,
  index,
  onSelect,
  labels,
  tone = "light",
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  count: number;
  index: number;
  onSelect: (index: number) => void;
  /** Accessible name per dot — "Lead score", "Pipeline", and so on. */
  labels: string[];
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={playing}
        className={cn(
          "wa-tap inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
          tone === "dark"
            ? "bg-white/5 text-slate-200 ring-white/15 hover:bg-white/10"
            : "bg-white text-slate-700 shadow-sm ring-slate-900/10 hover:bg-slate-50",
        )}
      >
        {playing ? (
          <>
            <Pause className="h-3 w-3 text-emerald-500" />
            Pause
          </>
        ) : (
          <>
            <Play className="h-3 w-3 text-emerald-500" />
            Play demo
          </>
        )}
      </button>

      <div className="flex items-center gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={labels[i] ?? i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Show step ${i + 1}: ${labels[i] ?? ""}`}
            aria-current={i === index}
            className={cn(
              "wa-tap h-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
              i === index
                ? "w-5 bg-emerald-500"
                : tone === "dark"
                  ? "w-1.5 bg-white/25 hover:bg-white/40"
                  : "w-1.5 bg-slate-300 hover:bg-slate-400",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Swipe ────────────────────────────────────────────────────────────────────

/**
 * Vertical or horizontal swipe over a region, for stepping a demo by hand.
 *
 * Only fires past a 44px threshold and only when the gesture is more along the
 * chosen axis than across it, so a page scroll that starts on the frame is still
 * a page scroll. Nothing is prevented — the demo never traps the scroll.
 */
export function useSwipe(
  onSwipe: (delta: number) => void,
  axis: "x" | "y" = "y",
  threshold = 44,
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      const along = axis === "y" ? dy : dx;
      const across = axis === "y" ? dx : dy;

      if (Math.abs(along) < threshold || Math.abs(along) <= Math.abs(across)) return;
      swiped.current = true;
      // Swiping up / left moves forward, which is how a carousel reads.
      onSwipe(along < 0 ? 1 : -1);
    },
    [onSwipe, axis, threshold],
  );

  /**
   * Swallow the click a finished swipe leaves behind.
   *
   * A swipe over an interactive surface still ends with `pointerup` and therefore a
   * `click` on whatever is under the finger. Without this, a swipe that lands on one
   * of the demo's own regions immediately selects it and undoes the swipe — the
   * gesture appears to do nothing at all. Capture phase, so it runs before the
   * region's own handler.
   */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { onPointerDown, onPointerUp, onClickCapture };
}
