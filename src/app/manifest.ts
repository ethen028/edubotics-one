import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Lets staff add Orbit to a phone's home screen, where it opens full screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "Edubotics Global's office app",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.page,
    theme_color: BRAND.navy,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
