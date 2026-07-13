"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Industries", href: "/industries" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          onClick={closeMenu}
          className="text-xl font-extrabold tracking-tight text-[#6C3FC4]"
        >
          WhatsCRM
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={
                    isActive
                      ? "text-sm font-semibold text-[#6C3FC4]"
                      : "text-sm font-medium text-gray-700 transition-colors hover:text-[#6C3FC4]"
                  }
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-[#6C3FC4]"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[#6C3FC4] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#5A32A6]"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 md:hidden"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile slide-down nav */}
      {isOpen && (
        <div id="mobile-nav" className="border-t border-gray-200 bg-white md:hidden">
          <ul className="space-y-1 px-4 py-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-2 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-[#6C3FC4]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-4">
            <Link
              href="/login"
              onClick={closeMenu}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Login
            </Link>
            <Link
              href="/register"
              onClick={closeMenu}
              className="rounded-lg bg-[#6C3FC4] px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#5A32A6]"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
