import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Employee documents (5 MB) and project files (10 MB each, 25 MB per update) are uploaded through server actions.
    serverActions: { bodySizeLimit: "26mb" },
  },
  // Basic browser protections on every page: no showing the app inside another site's frame (click-jacking),
  // no guessing file types, and no full addresses leaking to other sites in links.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
