import type { MetadataRoute } from "next";
import { publicOrigin, publicPaths } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: { userAgent: "*", disallow: "/", ...(origin ? { allow: [...publicPaths, "/careers/"] } : {}) },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
