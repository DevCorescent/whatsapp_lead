"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marketing navigation.
 *
 * Every entry points at a page that exists under app/(marketing) — "Solutions" is the
 * industries page and "Resources" is the blog, rather than two new routes invented to
 * fill a nav bar. Login and Start Free Trial go to the real auth routes; nothing about
 * authentication changes here.
 *
 * Aceternity's Resizable Navbar behaviour: the bar compacts and gains a shadow once the
 * page has scrolled, done with a passive scroll listener rather than a motion value.
 */

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/industries" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/blog" },
];

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/30">
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Every link in the sheet closes it on click, which is also what ends the navigation —
  // so there is no route change that can leave it open, and no effect needed to catch one.
  const closeMenu = () => setIsOpen(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-slate-200/80 bg-white/85 shadow-sm shadow-slate-900/5 backdrop-blur-md"
          : "border-transparent bg-white/60 backdrop-blur",
      )}
    >
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between px-4 transition-all duration-300 sm:px-6 lg:px-8",
          scrolled ? "h-14" : "h-16",
        )}
      >
        <Wordmark onClick={closeMenu} />

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "rounded-lg px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
                    isActive
                      ? "text-emerald-700"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 md:hidden"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {isOpen && (
        <div
          id="mobile-nav"
          className="border-t border-slate-200 bg-white shadow-lg shadow-slate-900/5 md:hidden"
        >
          <ul className="space-y-1 px-4 py-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-2.5 text-base font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-4">
            <Link
              href="/login"
              onClick={closeMenu}
              className="rounded-lg px-4 py-2.5 text-center text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
            >
              Log in
            </Link>
            <Link
              href="/register"
              onClick={closeMenu}
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
