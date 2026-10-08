import "server-only";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Settings } from "../settings";
import { formatDate } from "../format";
import { BRAND, MUTED, s } from "./layout";

export type CertificateFacts = {
  number: string;
  issuedOn: Date;
  cancelled: boolean;
  name: string;
  institution: string | null;
  title: string; // "Certificate of Participation"
  wording: string[]; // from certificateWording()
  trainer: string | null; // the lead trainer, signs on the left
};

const GOLD = "#b08d3c";

/** One landscape A4 page per certificate, so a whole workshop prints from one file. */
export function CertificatePdf({
  certificates,
  settings,
  signatureImage,
}: {
  certificates: CertificateFacts[];
  settings: Settings;
  signatureImage: { data: Buffer; type: string } | null;
}) {
  const signature = signatureImage ? { data: signatureImage.data, format: signatureImage.type === "image/png" ? ("png" as const) : ("jpg" as const) } : null;
  return (
    <Document title={certificates.length === 1 ? `Certificate ${certificates[0].number}` : "Certificates"} author={settings.companyName}>
      {certificates.map((c) => (
        <Page key={c.number} size="A4" orientation="landscape" style={[s.page, { padding: 22, lineHeight: 1.25 }]}>
          <View style={{ flex: 1, borderWidth: 3, borderColor: BRAND, padding: 5 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: GOLD, paddingVertical: 34, paddingHorizontal: 56, alignItems: "center" }}>
              {c.cancelled && (
                <Text style={[s.watermark, { top: 200, fontSize: 90 }]} fixed>
                  cancelled
                </Text>
              )}
              <Text style={{ fontSize: 13, fontWeight: 600, color: BRAND, letterSpacing: 2, textTransform: "uppercase" }}>{settings.companyName}</Text>
              {settings.companyAddress && <Text style={[s.muted, { fontSize: 8.5, marginTop: 2 }]}>{settings.companyAddress.replace(/\s*\n\s*/g, ", ")}</Text>}

              <Text style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 600, color: "#0f172a", marginTop: 30, letterSpacing: 1 }}>{c.title}</Text>
              <View style={{ width: 90, height: 2, backgroundColor: GOLD, marginTop: 12 }} />

              <Text style={{ fontSize: 11, color: MUTED, marginTop: 24 }}>This is to certify that</Text>
              <Text style={{ fontSize: 26, lineHeight: 1.2, fontWeight: 600, color: BRAND, marginTop: 8, textAlign: "center" }}>{c.name}</Text>
              {c.institution && <Text style={{ fontSize: 11, marginTop: 6, textAlign: "center" }}>of {c.institution}</Text>}

              <View style={{ marginTop: 18, width: 600, alignItems: "center" }}>
                {c.wording.map((line, i) => (
                  <Text key={i} style={{ fontSize: i === 1 ? 15 : 11.5, lineHeight: 1.35, fontWeight: i === 1 ? 600 : 400, textAlign: "center", marginTop: i ? 5 : 0 }}>
                    {line}
                  </Text>
                ))}
              </View>

              <View style={{ flex: 1 }} />

              <View style={[s.between, { width: "100%", alignItems: "flex-end" }]}>
                <Signature name={c.trainer} role="Trainer" />
                <View style={{ alignItems: "center", paddingBottom: 2 }}>
                  <Text style={[s.label, { marginBottom: 1 }]}>Certificate no.</Text>
                  <Text style={{ fontWeight: 600 }}>{c.number}</Text>
                  <Text style={[s.muted, { fontSize: 8.5, marginTop: 2 }]}>Issued on {formatDate(c.issuedOn)}</Text>
                </View>
                <Signature name={settings.certSignatoryName} role={settings.certSignatoryTitle ?? ""} image={signature} />
              </View>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}

function Signature({ name, role, image }: { name: string | null; role: string; image?: { data: Buffer; format: "png" | "jpg" } | null }) {
  return (
    <View style={{ width: 190, alignItems: "center" }}>
      <View style={{ height: 46, justifyContent: "flex-end", alignItems: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
        {image && <Image src={image} style={{ maxHeight: 44, maxWidth: 160, objectFit: "contain" }} />}
      </View>
      <View style={{ width: "100%", borderTopWidth: 1, borderTopColor: "#94a3b8", marginTop: 2, paddingTop: 4, alignItems: "center" }}>
        <Text style={{ fontWeight: 600 }}>{name || " "}</Text>
        <Text style={[s.muted, { fontSize: 8.5 }]}>{role}</Text>
      </View>
    </View>
  );
}
