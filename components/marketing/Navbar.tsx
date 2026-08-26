"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  Code2,
  HelpCircle,
  Mail,
  Megaphone,
  MessageSquare,
  Newspaper,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marketing navigation.
 *
 * EVERY DESTINATION IS A PAGE THAT EXISTS. The dropdowns deep-link into the six
 * sections of /features (anchored there for this purpose), into the top-level pages
 * under app/(marketing), and to the homepage's own `#how-it-works` and `#faq`. Nothing
 * here points at a route that has not been built: a nav item that 404s is worse than a
 * nav item that is missing, and it is the kind of defect nobody reports because
 * everyone assumes it is deliberate.
 *
 * SOLUTIONS AND INDUSTRY ARE DIFFERENT QUESTIONS, and they stay separate items for
 * that reason. Solutions answers "what problem does this solve for me"; Industry
 * answers "do you work with businesses like mine". Folding them together forces a
 * visitor who knows one to read the other.
 *
 * "Industry" is singular deliberately — it is the client's label, and the route behind
 * it (/industries) keeps its plural so no existing link breaks.
 *
 * The bar compacts and gains a shadow once the page has scrolled, from a passive
 * scroll listener. Desktop menus open on hover *and* on click, close on Escape, on
 * outside press and on navigation; the mobile sheet is the same data in one column.
 */

type NavChild = { label: string; description: string; href: string; icon: LucideIcon };
type NavItem = { label: string; href: string; children?: NavChild[] };

const NAV_ITEMS: NavItem[] = [
  {
    label: "Features",
    href: "/features",
    children: [
      {
        label: "Shared inbox",
        description: "One number, your whole team",
        href: "/features#shared-inbox",
        icon: MessageSquare,
      },
      {
        label: "AI auto-reply",
        description: "Answers from your documents",
        href: "/features#ai-auto-reply",
        icon: Sparkles,
      },
      {
        label: "Lead pipeline",
        description: "A CRM that scores itself",
        href: "/features#lead-pipeline",
        icon: TrendingUp,
      },
      {
        label: "Campaigns",
        description: "Broadcast to a segment",
        href: "/features#campaigns",
        icon: Megaphone,
      },
      {
        label: "Analytics",
        description: "What your chats produce",
        href: "/features#analytics",
        icon: BarChart3,
      },
      {
        label: "Knowledge base",
        description: "Teach the AI once",
        href: "/features#knowledge-base",
        icon: BookOpen,
      },
    ],
  },
  {
    label: "Solutions",
    href: "/solutions",
    children: [
      {
        label: "Reply instantly",
        description: "AI answers in seconds, 24×7",
        href: "/solutions#reply-instantly",
        icon: Bot,
      },
      {
        label: "Qualify every lead",
        description: "BANT scored automatically",
        href: "/solutions#qualify-every-lead",
        icon: Target,
      },
      {
        label: "Never lose a lead",
        description: "One inbox, clear ownership",
        href: "/solutions#never-lose-a-lead",
        icon: Workflow,
      },
      {
        label: "All solutions",
        description: "Six problems, one workspace",
        href: "/solutions",
        icon: Sparkles,
      },
    ],
  },
  { label: "Industry", href: "/industries" },
  { label: "Pricing", href: "/pricing" },
  { label: "Portfolio", href: "/portfolio" },
  {
    label: "Resources",
    href: "/resources",
    children: [
      {
        label: "Resource hub",
        description: "Everything in one place",
        href: "/resources",
        icon: BookOpen,
      },
      { label: "Blog", description: "Guides and product news", href: "/blog", icon: Newspaper },
      { label: "WhatsCRM API", description: "Build on the platform", href: "/api-docs", icon: Code2 },
      { label: "FAQ", description: "Answers to the common ones", href: "/#faq", icon: HelpCircle },
      { label: "About us", description: "Who builds WhatsCRM", href: "/about", icon: Users },
      { label: "Contact", description: "Talk to a human", href: "/contact", icon: Mail },
    ],
  },
];

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30 transition-transform duration-300 hover:scale-105">
        <MessageSquare className="h-4 w-4 text-white" />
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900">WhatsCRM</span>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openMobileMenu, setOpenMobileMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  // Closing a menu on pointer-leave immediately makes the gap between the trigger and
  // the panel a trap door. A short grace period lets the pointer cross it.
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!openMenu) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openMenu]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const hoverOpen = (label: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpenMenu(label);
  };
  const hoverClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 140);
  };

  // Every link closes whatever is open, which is also what ends the navigation — so no
  // route change can leave a panel hanging, and no effect is needed to catch one.
  const closeAll = () => {
    setIsOpen(false);
    setOpenMenu(null);
    setOpenMobileMenu(null);
  };

  const isCurrent = (item: NavItem) =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-slate-200/80 bg-gradient-to-b from-white/95 to-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-md"
          : "border-transparent bg-gradient-to-b from-white/80 to-white/50 backdrop-blur",
      )}
    >
      <nav
        aria-label="Main"
        ref={navRef}
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-4 px-4 transition-all duration-300 sm:px-6 lg:px-8",
          scrolled ? "h-14" : "h-16",
        )}
      >
        <Wordmark onClick={closeAll} />

        <ul className="mx-auto hidden items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isCurrent(item);
            const open = openMenu === item.label;

            return (
              <li
                key={item.label}
                className="relative"
                onPointerEnter={() => item.children && hoverOpen(item.label)}
                onPointerLeave={() => item.children && hoverClose()}
              >
                {item.children ? (
                  <button
                    type="button"
                    onClick={() => setOpenMenu(open ? null : item.label)}
                    aria-expanded={open}
                    aria-haspopup="true"
                    className={cn(
                      "group relative flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                      active || open ? "text-emerald-700" : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-300",
                        open && "rotate-180",
                      )}
                    />
                    <NavUnderline shown={active || open} />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    onClick={closeAll}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                      active ? "text-emerald-700" : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                    <NavUnderline shown={active} />
                  </Link>
                )}

                {item.children && open && (
                  <div className="wa-detail-in absolute left-1/2 top-full z-50 w-[19rem] -translate-x-1/2 pt-2">
                    <div className="overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
                      {item.children.map((child) => (
                        <Link
                          key={child.href + child.label}
                          href={child.href}
                          onClick={closeAll}
                          className="group/item flex items-start gap-3 rounded-xl px-2.5 py-2 transition hover:bg-emerald-50/70"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-inset ring-emerald-600/15 transition-colors duration-300 group-hover/item:bg-emerald-600 group-hover/item:ring-emerald-600">
                            <child.icon className="h-4 w-4 text-emerald-600 transition-colors duration-300 group-hover/item:text-white" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-slate-900">
                              {child.label}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {child.description}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-600/30 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Start Free Trial
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Animated hamburger: two bars that cross into an X rather than two icons
            swapped, so the control morphs instead of blinking. */}
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 lg:hidden"
        >
          <span aria-hidden className="relative block h-4 w-5">
            <span
              className={cn(
                "absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-300",
                isOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0.5",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-1/2 block h-0.5 w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200",
                isOpen && "opacity-0",
              )}
            />
            <span
              className={cn(
                "absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-300",
                isOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0.5",
              )}
            />
          </span>
        </button>
      </nav>

      {isOpen && (
        <div
          id="mobile-nav"
          className="wa-detail-in max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-200 bg-white shadow-lg shadow-slate-900/5 lg:hidden"
        >
          <ul className="space-y-0.5 px-4 py-3">
            {NAV_ITEMS.map((item) => {
              const expanded = openMobileMenu === item.label;
              return (
                <li key={item.label}>
                  {item.children ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpenMobileMenu(expanded ? null : item.label)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-base font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        {item.label}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-slate-400 transition-transform duration-300",
                            expanded && "rotate-180 text-emerald-600",
                          )}
                        />
                      </button>
                      <div className="wa-collapse" data-open={expanded} aria-hidden={!expanded}>
                        <div>
                          <ul className="space-y-0.5 py-1 pl-3">
                            {item.children.map((child) => (
                              <li key={child.href + child.label}>
                                <Link
                                  href={child.href}
                                  onClick={closeAll}
                                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  <child.icon className="h-4 w-4 shrink-0 text-emerald-600" />
                                  {child.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={closeAll}
                      className="block rounded-lg px-3 py-2.5 text-base font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-4">
            <Link
              href="/login"
              onClick={closeAll}
              className="rounded-lg px-4 py-2.5 text-center text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
            >
              Log in
            </Link>
            <Link
              href="/register"
              onClick={closeAll}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/** The green rule that slides in under a nav item on hover, focus or when current. */
function NavUnderline({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-emerald-500 transition-transform duration-300",
        shown ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100",
      )}
    />
  );
}
