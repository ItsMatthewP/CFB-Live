// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow images if you ever pull team logos
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // loosened for testing; you can restrict to ncaa.com, espncdn.com, etc later
      },
    ],
  },

  // Experimental features can go here if you want
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
