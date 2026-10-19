import { ImageResponse } from "next/og";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";

export const alt = "Orbit · Global Operations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const mark = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><path fill="#f8fafc" d="${LOGO_PATH}"/></svg>`)}`;

export default function Image() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#0b1020", color: "#fff", padding: 88, flexDirection: "column", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", fontSize: 46, color: "#a78bfa" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src={mark} width={54} height={72} style={{ marginRight: 24 }} />EDUBOTICS
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 86 }}>Orbit</div><div style={{ fontSize: 32, color: "#a78bfa", marginTop: 24 }}>Learn. Build. Innovate.</div></div>
    <div style={{ fontSize: 25 }}>Global Operations</div>
  </div>, size);
}
