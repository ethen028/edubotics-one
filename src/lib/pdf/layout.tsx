import "server-only";
import path from "node:path";
import type { ReactNode } from "react";
import { Font, StyleSheet, Text, View } from "@react-pdf/renderer";

// Inter has the rupee sign, which the built-in PDF fonts lack.
const fonts = path.join(process.cwd(), "src/lib/pdf/fonts");
Font.register({
  family: "Inter",
  fonts: [{ src: path.join(fonts, "Inter-Regular.otf") }, { src: path.join(fonts, "Inter-SemiBold.otf"), fontWeight: 600 }],
});
// Keep long words (school names, descriptions) whole instead of breaking them with hyphens.
Font.registerHyphenationCallback((word) => [word]);

export const BRAND = "#0a5a4d";
export const MUTED = "#64748b";
export const LINE = "#e2e8f0";

export const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: "#0f172a", padding: 40, lineHeight: 1.4 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  muted: { color: MUTED },
  bold: { fontWeight: 600 },
  h1: { fontSize: 15, fontWeight: 600, marginBottom: 3 },
  title: { fontSize: 16, fontWeight: 600, color: BRAND, textTransform: "uppercase", textAlign: "right" },
  label: { fontSize: 7.5, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  section: { borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 10 },
  th: { fontSize: 8, fontWeight: 600, color: MUTED, paddingVertical: 5, paddingHorizontal: 4 },
  td: { paddingVertical: 5, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  right: { textAlign: "right" },
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 80,
    fontWeight: 600,
    color: "#e2e8f0",
    textTransform: "uppercase",
    transform: "rotate(-12deg)",
  },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7.5, color: "#94a3b8", flexDirection: "row", justifyContent: "space-between" },
});

/** label / value pairs in two columns. */
export function Pairs({ rows, align = "left" }: { rows: [string, ReactNode][]; align?: "left" | "right" }) {
  return (
    <View>
      {rows.map(([k, v]) => (
        <View key={k} style={[s.row, { justifyContent: align === "right" ? "flex-end" : "flex-start" }]}>
          <Text style={[s.muted, { width: align === "right" ? undefined : 80, marginRight: 8 }]}>{k}</Text>
          <Text>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function PageNumbers({ note }: { note: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{note}</Text>
      <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "")} />
    </View>
  );
}

/** "EBG/26-27/001" → "EBG-26-27-001", safe in a file name. */
export const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9 _-]+/g, "-");
