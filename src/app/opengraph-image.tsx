import { ImageResponse } from "next/og";

export const alt = "Edubotics One · Global Operations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#12382d", color: "#fff", padding: 88, flexDirection: "column", justifyContent: "space-between" }}>
    <div style={{ display: "flex", fontSize: 46, color: "#b4ec92" }}>E · EDUBOTICS</div>
    <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 86 }}>Edubotics One</div><div style={{ fontSize: 32, color: "#b4ec92", marginTop: 24 }}>People. Projects. Possibilities.</div></div>
    <div style={{ fontSize: 25 }}>Global Operations</div>
  </div>, size);
}
