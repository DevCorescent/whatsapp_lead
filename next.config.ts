import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-tools bubble is pinned bottom-left, directly on top of the sidebar's
  // user/plan footer, which makes the shell look broken while you are reviewing it.
  devIndicators: false,
};

export default nextConfig;
