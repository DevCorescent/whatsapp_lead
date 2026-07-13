// TODO [HEMANT]: Style this auth layout.
// Left panel (hidden on mobile): Product branding, feature highlights, testimonial quote.
// Right panel: The auth form (children).
// Background: Subtle green gradient on left, white on right.

import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left branding panel – TODO [HEMANT]: Replace with styled component */}
      <div className="hidden lg:flex flex-col bg-green-600 text-white p-12 justify-between">
        <Link href="/" className="text-2xl font-bold">WhatsCRM</Link>
        <div>
          <blockquote className="text-lg italic">
            "WhatsCRM helped us qualify 3x more leads without adding a single agent."
          </blockquote>
          <p className="mt-4 font-medium">— Rajesh Kumar, Director at TechSales India</p>
        </div>
        <p className="text-green-200 text-sm">© 2026 Corescent Technologies Pvt Ltd</p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
