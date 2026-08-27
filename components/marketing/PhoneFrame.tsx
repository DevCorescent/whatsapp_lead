import type { ReactNode } from "react";
import {
  BadgeCheck,
  BatteryFull,
  Camera,
  ChevronLeft,
  Mic,
  Paperclip,
  Signal,
  Smile,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A phone. An actual one, with a business chat open on it.
 *
 * WHY THE DEVICE IS DRAWN THIS CAREFULLY. The earlier version was a rounded white
 * card, and a rounded white card at hero size reads as a tablet or as "a UI panel" —
 * which is exactly the wrong first impression for a product whose whole story is
 * "your customers' WhatsApp, answered for you". A handset silhouette says that
 * before anyone reads a word, so the silhouette is worth the markup:
 *
 *   • PROPORTION does most of the work. The width is fixed and the screen carries a
 *     19:9-ish minimum height, so the thing is always tall and narrow the way a phone
 *     is. It is a `min-height` rather than an `aspect-ratio` on purpose: a taller
 *     conversation grows the device by a few millimetres instead of being clipped by
 *     it, and a slightly tall phone still reads as a phone.
 *   • THREE SHELLS, not one border. A brushed rail (the light-to-dark-to-light
 *     gradient), then a hairline of true black for the bezel, then the screen. A
 *     single 4px border reads as a stroke; three shells read as machined edges.
 *   • A DYNAMIC ISLAND, floating over the top of the screen with the status bar
 *     flowing around it, and three button slivers on the rails. Small details, but
 *     they are the ones that make the eye stop arguing about what it is looking at.
 *   • DEPTH. A long, soft, green-tinted drop shadow — the phone is lit by the same
 *     emerald wash the hero sits in, so it belongs to the page rather than floating
 *     on top of it.
 *
 * DELIBERATELY NOT A COPY OF ANY MESSENGER. No third-party wordmark, logo, or lifted
 * palette. What makes the screen legible is the *grammar* of a business chat —
 * contact header, a day divider, left/right bubbles, ticks, a composer — which is not
 * anyone's trademark. That keeps the visual honest and keeps us clear of a trademark
 * problem we have no reason to take on.
 *
 * PRESENTATIONAL ONLY. No state, no effects, no "use client" — the animated thread is
 * passed in as children by whichever component owns the timeline, so this renders from
 * a server component and is shared by the homepage hero and every industry page
 * without either one importing the other's clock.
 */
export function PhoneFrame({
  contact,
  initials,
  /** The line under the contact name — "Business Account", "online", whatever fits. */
  status,
  /** Show the verified tick beside the name. */
  verified = false,
  /** The right-hand chip in the header, if the scene has one. */
  headerBadge,
  /** The thread itself. Grows into the space between the header and the composer. */
  children,
  /** Wall-clock in the status bar. A string, so it never differs server to client. */
  time = "9:41",
  className,
}: {
  contact: string;
  initials: string;
  status?: ReactNode;
  verified?: boolean;
  headerBadge?: ReactNode;
  children: ReactNode;
  time?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-[15.5rem] shrink-0 sm:w-[16.25rem]", className)}>
      {/* Button slivers on the rails: mute, volume up, volume down, wake. */}
      <span
        aria-hidden
        className="absolute -left-[2px] top-[5.25rem] h-6 w-[2px] rounded-l-full bg-slate-600/70"
      />
      <span
        aria-hidden
        className="absolute -left-[2px] top-[7.25rem] h-10 w-[2px] rounded-l-full bg-slate-600/70"
      />
      <span
        aria-hidden
        className="absolute -left-[2px] top-[10rem] h-10 w-[2px] rounded-l-full bg-slate-600/70"
      />
      <span
        aria-hidden
        className="absolute -right-[2px] top-[8rem] h-14 w-[2px] rounded-r-full bg-slate-600/70"
      />

      {/* Rail → bezel → screen. */}
      <div className="relative rounded-[2.5rem] bg-[linear-gradient(160deg,#64748b_0%,#0f172a_28%,#020617_60%,#334155_100%)] p-[2.5px] shadow-[0_32px_64px_-20px_rgba(4,47,36,0.45),0_12px_28px_-14px_rgba(15,23,42,0.35)]">
        <div className="rounded-[2.4rem] bg-slate-950 p-[3px]">
          <div className="relative flex min-h-[29.5rem] flex-col overflow-hidden rounded-[2.2rem] bg-white sm:min-h-[31rem]">
            {/* ── Dynamic Island ──────────────────────────────────────────── */}
            <span
              aria-hidden
              className="absolute left-1/2 top-[0.5rem] z-20 flex h-[1.35rem] w-[4.5rem] -translate-x-1/2 items-center justify-end rounded-full bg-slate-950 pr-[0.45rem]"
            >
              <span className="h-[0.3rem] w-[0.3rem] rounded-full bg-slate-700" />
            </span>

            {/* ── Status bar. Flows around the island: time left, radios right. ─ */}
            <div
              aria-hidden
              className="relative z-10 flex items-center justify-between px-[1.15rem] pb-1 pt-[0.72rem] text-slate-900"
            >
              <span className="nums text-[10.5px] font-semibold tracking-tight">{time}</span>
              <span className="flex items-center gap-[3px]">
                <Signal className="h-[0.6rem] w-[0.6rem]" />
                <Wifi className="h-[0.6rem] w-[0.6rem]" />
                <BatteryFull className="h-[0.72rem] w-[0.72rem]" />
              </span>
            </div>

            {/* ── Contact header ──────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 border-b border-slate-200/70 bg-white px-2.5 py-2">
              <ChevronLeft aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-sm shadow-emerald-600/25">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate text-[12.5px] font-semibold leading-tight text-slate-900">
                    {contact}
                  </span>
                  {verified && (
                    <BadgeCheck
                      aria-label="Verified business"
                      className="h-3 w-3 shrink-0 text-emerald-600"
                    />
                  )}
                </span>
                {status && (
                  <span className="mt-px block truncate text-[9.5px] leading-tight text-slate-500">
                    {status}
                  </span>
                )}
              </span>
              {headerBadge}
            </div>

            {/* ── Thread. The wallpaper is a faint emerald dot field on a warm
                   off-white, so bubbles read as sitting on a chat surface. ───── */}
            <div className="relative flex flex-1 flex-col">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[#eef4f0] bg-[radial-gradient(rgb(16_185_129_/_0.09)_1px,transparent_1px)] bg-[length:16px_16px]"
              />
              {/* `flex-1` and not `h-full`: this column's own height comes from
                  flexbox, so a percentage height on the child resolves against `auto`
                  and collapses — which silently defeats any `justify-end` a thread
                  uses to sit its messages at the bottom of the screen. */}
              <div className="relative flex flex-1 flex-col">{children}</div>
            </div>

            {/* ── Composer. Scenery — not focusable, announces nothing. ─────── */}
            <div
              aria-hidden
              className="flex items-center gap-1.5 border-t border-slate-200/70 bg-white px-2 py-1.5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-[0.35rem]">
                <Smile className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate text-[10px] text-slate-400">Message</span>
                <Paperclip className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" />
                <Camera className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </span>
              <span className="flex h-[1.85rem] w-[1.85rem] shrink-0 items-center justify-center rounded-full bg-emerald-600 shadow-sm shadow-emerald-600/30">
                <Mic className="h-3.5 w-3.5 text-white" />
              </span>
            </div>

            {/* Home indicator. */}
            <span
              aria-hidden
              className="mx-auto mb-[0.35rem] h-[3px] w-[5.5rem] rounded-full bg-slate-900/25"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
