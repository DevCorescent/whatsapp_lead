// TODO [AMAN]: Build Navbar and Footer components, import them here.
// Navbar should have: Logo, Nav links (Features, Pricing, Industries, Blog),
// Login button, "Start Free Trial" CTA button.
// Footer should have: 4 columns – Product, Company, Legal, Social links.

import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* TODO [AMAN]: Replace with <Navbar /> component */}
      <header className="h-16 border-b flex items-center px-6 bg-white">
        <span className="font-bold text-xl text-green-600">WhatsCRM</span>
      </header>

      <main className="flex-1">{children}</main>

      {/* TODO [AMAN]: Replace with <Footer /> component */}
      <footer className="border-t py-8 text-center text-sm text-gray-500">
        © 2026 WhatsCRM by Corescent Technologies Pvt Ltd
      </footer>
    </div>
  );
}
