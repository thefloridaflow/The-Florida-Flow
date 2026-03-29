import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server-side fetch caching for NOAA APIs
  experimental: {
    // ppr: true — enable when stable if desired
  },
};

export default nextConfig;
