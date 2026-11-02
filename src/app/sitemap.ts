import type { MetadataRoute } from "next";
import { publicOrigin, publicPaths } from "@/lib/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return origin ? publicPaths.map((path) => ({ url: `${origin}${path}` })) : [];
}
