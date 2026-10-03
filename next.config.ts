import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Employee documents are uploaded through server actions (5 MB per file).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
