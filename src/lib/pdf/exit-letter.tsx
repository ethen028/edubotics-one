import "server-only";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Settings } from "../settings";
import { formatDate } from "../format";
import { BRAND, LINE, PageNumbers, s } from "./layout";

export type ExitLetterFacts = {
  name: string;
  firstName: string;
  code: string;
  designation: string;
  department: string | null;
  joined: Date;
  lastDay: Date;
  resigned: boolean; // resignation wording, else neutral "relieved"
  issuedOn: Date;
  draft: boolean;
};

/** Relieving and experience letter in one, on A4 letterhead. Neutral wording, no reason for leaving. */
export function ExitLetterPdf({
  f,
  settings,
  signatureImage,
}: {
  f: ExitLetterFacts;
  settings: Settings;
  signatureImage: { data: Buffer; type: string } | null;
}) {
  const signature = signatureImage ? { data: signatureImage.data, format: signatureImage.type === "image/png" ? ("png" as const) : ("jpg" as const) } : null;
  const role = `${f.designation}${f.department ? `, ${f.department}` : ""}`;
  const paragraphs = [
    `This is to certify that ${f.name} (employee code ${f.code}) worked with ${settings.companyName} as ${role} from ${formatDate(f.joined)} to ${formatDate(f.lastDay)}.`,
    f.resigned
      ? `${f.firstName} resigned from the company and has been relieved of all duties with effect from the close of working hours on ${formatDate(f.lastDay)}.`
      : `${f.firstName} has been relieved of all duties with effect from the close of working hours on ${formatDate(f.lastDay)}.`,
    `We thank ${f.firstName} for the contribution made during this time and wish ${f.firstName} every success in the future.`,
  ];
  return (
    <Document title={`Relieving letter, ${f.name}`} author={settings.companyName}>
      <Page size="A4" style={[s.page, { padding: 56, fontSize: 10.5, lineHeight: 1.55 }]}>
        {f.draft && (
          <Text style={s.watermark} fixed>
            draft
          </Text>
        )}
        <View style={{ borderBottomWidth: 2, borderBottomColor: BRAND, paddingBottom: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: 600, color: BRAND }}>{settings.companyName}</Text>
          <Text style={s.muted}>{settings.companyAddress.replace(/\s*\n\s*/g, ", ")}</Text>
          {(settings.companyPhone || settings.companyEmail) && (
            <Text style={s.muted}>{[settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · ")}</Text>
          )}
        </View>
        <View style={[s.between, { marginTop: 18 }]}>
          <Text style={s.muted}>Ref: {f.code}</Text>
          <Text style={s.muted}>Date: {formatDate(f.issuedOn)}</Text>
        </View>
        <Text style={{ marginTop: 26, fontSize: 13, fontWeight: 600, textAlign: "center", letterSpacing: 0.5 }}>RELIEVING AND EXPERIENCE LETTER</Text>
        <Text style={{ marginTop: 22 }}>To whom it may concern,</Text>
        {paragraphs.map((p, i) => (
          <Text key={i} style={{ marginTop: 12, textAlign: "justify" }}>
            {p}
          </Text>
        ))}
        <View style={{ marginTop: 40, width: 220 }}>
          <Text>For {settings.companyName}</Text>
          <View style={{ height: 52, justifyContent: "flex-end" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
            {signature && <Image src={signature} style={{ maxHeight: 48, maxWidth: 170, objectFit: "contain" }} />}
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 }}>
            <Text style={s.bold}>{settings.certSignatoryName || " "}</Text>
            <Text style={s.muted}>{settings.certSignatoryTitle ?? ""}</Text>
          </View>
        </View>
        <PageNumbers note={`${settings.companyName} · relieving letter for ${f.name}`} />
      </Page>
    </Document>
  );
}
