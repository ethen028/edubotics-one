import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows isolated CI/verification builds without sharing a generated output
  // directory with a running local development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
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
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
