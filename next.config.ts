import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Employee documents (5 MB) and project files (10 MB each, 25 MB per update) are uploaded through server actions.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
