import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { logoSvg } from "@/lib/logo";

export const alt = "Orbit · Global Operations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logo = `data:image/svg+xml,${encodeURIComponent(logoSvg("reverse", { lockup: true }))}`;

export default function Image() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: BRAND.navy, color: "#ffffff", padding: 88, flexDirection: "column", justifyContent: "space-between" }}>
    {/* eslint-disable-next-line jsx-a11y/alt-text */}
    <img src={logo} width={200} height={188} />
    <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 86 }}>Orbit</div><div style={{ fontSize: 32, color: BRAND.onNavyMuted, marginTop: 16 }}>Leading way to the future.</div></div>
    <div style={{ display: "flex", alignItems: "center", fontSize: 25 }}><div style={{ width: 40, height: 6, borderRadius: 3, background: BRAND.orange, marginRight: 18 }} />Global Operations</div>
  </div>, size);
}
