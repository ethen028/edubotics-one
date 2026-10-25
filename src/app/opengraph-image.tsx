import { ImageResponse } from "next/og";
import { logoSvg } from "@/lib/logo";

export const alt = "Orbit · Global Operations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const mark = `data:image/svg+xml,${encodeURIComponent(logoSvg("reverse"))}`;

export default function Image() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#0a3d47", color: "#f4f8f8", padding: 88, flexDirection: "column", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", fontSize: 46, color: "#8fe0df" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src={mark} width={56} height={72} style={{ marginRight: 24 }} />EDUBOTICS
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 86 }}>Orbit</div><div style={{ fontSize: 32, color: "#8fe0df", marginTop: 24 }}>Learn. Build. Innovate.</div></div>
    <div style={{ display: "flex", alignItems: "center", fontSize: 25 }}><div style={{ width: 40, height: 6, borderRadius: 3, background: "#ff7a30", marginRight: 18 }} />Global Operations</div>
  </div>, size);
}
