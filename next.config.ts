import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-tools bubble is pinned bottom-left, directly on top of the sidebar's
  // user/plan footer, which makes the shell look broken while you are reviewing it.
  devIndicators: false,
  // `npm run dev` only serves its scripts to localhost. White-label reseller sites are
  // tried locally at <subdomain>.lvh.me:3000 (lvh.me resolves to 127.0.0.1); without
  // this their pages load with no JavaScript. Development only — ignored in production.
  allowedDevOrigins: ["lvh.me", "*.lvh.me"],
  // Native Node.js packages that Turbopack must not bundle — use require() at runtime.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
