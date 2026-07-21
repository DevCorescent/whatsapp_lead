import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-tools bubble is pinned bottom-left, directly on top of the sidebar's
  // user/plan footer, which makes the shell look broken while you are reviewing it.
  devIndicators: false,

  // pdf-parse (pdfjs) and mammoth use dynamic requires / Node built-ins that the
  // bundler can't statically trace. Loading them from node_modules at runtime,
  // instead of bundling, is the supported way to use such packages in route handlers.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
