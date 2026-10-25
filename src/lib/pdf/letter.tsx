import "server-only";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Settings } from "../settings";
import { formatDate } from "../format";
import type { LetterBody, Table } from "../letter-rules";
import { BRAND, LINE, MUTED, PageNumbers, PdfLogo, s } from "./layout";

type SignatureImage = { data: Buffer; type: string } | null;
const pdfImage = (img: SignatureImage) => (img ? { data: img.data, format: img.type === "image/png" ? ("png" as const) : ("jpg" as const) } : null);

/** Logo, company name and contact details across the top of every HR letter. */
export function Letterhead({ settings }: { settings: Settings }) {
  const contact = [settings.companyPhone, settings.companyEmail, settings.companyWebsite].filter(Boolean).join(" · ");
  return (
    <View style={[s.between, { borderBottomWidth: 2, borderBottomColor: BRAND, paddingBottom: 10, alignItems: "flex-end" }]}>
      <View style={[s.row, { alignItems: "center" }]}>
        <PdfLogo height={36} />
        <View style={{ marginLeft: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: 600, color: BRAND }}>{settings.companyName}</Text>
          <Text style={[s.muted, { fontSize: 8.5 }]}>{settings.companyAddress.replace(/\s*\n\s*/g, ", ")}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 210 }}>
        {contact && <Text style={[s.muted, { fontSize: 8, textAlign: "right" }]}>{contact}</Text>}
        {settings.companyRegNo && <Text style={[s.muted, { fontSize: 8 }]}>{settings.companyRegNo}</Text>}
      </View>
    </View>
  );
}

function LetterTable({ t }: { t: Table }) {
  const wide = (t.head?.length ?? t.rows[0]?.length ?? 2) > 4;
  const cell = (i: number) => [s.td, { flex: i === 0 ? (wide ? 1.1 : 2) : 1, fontSize: wide ? 8 : 10 }, t.numeric?.includes(i) ? s.right : {}];
  return (
    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: LINE, width: wide ? "100%" : t.head && t.head.length > 2 ? "85%" : "65%" }}>
      {t.head && (
        <View style={[s.tr, { backgroundColor: "#f4f8f8" }]}>
          {t.head.map((h, i) => (
            <Text key={i} style={[...cell(i), s.bold, { color: MUTED, fontSize: wide ? 7.5 : 8.5 }]}>
              {h}
            </Text>
          ))}
        </View>
      )}
      {t.rows.map((r, j) => (
        <View key={j} style={s.tr} wrap={false}>
          {r.map((v, i) => (
            <Text key={i} style={cell(i)}>
              {v}
            </Text>
          ))}
        </View>
      ))}
      {t.foot && (
        <View style={s.row} wrap={false}>
          {t.foot.map((v, i) => (
            <Text key={i} style={[...cell(i), s.bold]}>
              {v}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** Any HR letter on A4 letterhead: reference and date, addressee, title, wording, signature, and a line to sign for receipt. */
export function LetterPdf({
  body,
  number,
  issuedOn,
  settings,
  signatureImage,
  watermark,
}: {
  body: LetterBody;
  number: string | null;
  issuedOn: Date;
  settings: Settings;
  signatureImage: SignatureImage;
  watermark: string | null;
}) {
  const signature = pdfImage(signatureImage);
  const recipient = body.to[0] ?? body.title;
  return (
    <Document title={`${body.title}${body.to[0] ? `, ${body.to[0]}` : ""}`} author={settings.companyName}>
      <Page size="A4" style={[s.page, { paddingHorizontal: 54, paddingTop: 42, paddingBottom: 54, fontSize: 10.5, lineHeight: 1.5 }]}>
        {watermark && (
          <Text style={s.watermark} fixed>
            {watermark}
          </Text>
        )}
        <Letterhead settings={settings} />
        <View style={[s.between, { marginTop: 14 }]}>
          <Text style={s.muted}>{number ? `Ref: ${number}` : ""}</Text>
          <Text style={s.muted}>Date: {formatDate(issuedOn)}</Text>
        </View>
        {body.to.length > 0 && (
          <View style={{ marginTop: 14 }}>
            {body.to.map((line, i) => (
              <Text key={i} style={i === 0 ? s.bold : undefined}>
                {line}
              </Text>
            ))}
          </View>
        )}
        <Text style={{ marginTop: 20, fontSize: 13, fontWeight: 600, textAlign: "center", letterSpacing: 0.5, textTransform: "uppercase", color: BRAND }}>{body.title}</Text>
        {body.subject && <Text style={{ marginTop: 6, textAlign: "center", fontWeight: 600 }}>{body.subject}</Text>}
        {body.salutation && <Text style={{ marginTop: 16 }}>{body.salutation}</Text>}
        {body.blocks.map((b, i) =>
          "p" in b ? (
            <Text key={i} style={{ marginTop: 9, textAlign: "justify" }}>
              {b.p}
            </Text>
          ) : "heading" in b ? (
            <Text key={i} style={{ marginTop: 12, fontWeight: 600 }} minPresenceAhead={40}>
              {b.heading}
            </Text>
          ) : (
            <LetterTable key={i} t={b.table} />
          ),
        )}
        <View style={[s.between, { marginTop: 34, alignItems: "flex-end" }]} wrap={false}>
          <View style={{ width: 220 }}>
            <Text>For {settings.companyName}</Text>
            <View style={{ height: 50, justifyContent: "flex-end" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
              {signature && <Image src={signature} style={{ maxHeight: 46, maxWidth: 170, objectFit: "contain" }} />}
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 }}>
              <Text style={s.bold}>{body.signatory.name || "Authorised signatory"}</Text>
              <Text style={s.muted}>{body.signatory.name ? (body.signatory.title ?? "") : " "}</Text>
            </View>
          </View>
          {body.ack && (
            <View style={{ width: 200 }}>
              <Text style={[s.muted, { fontSize: 9 }]}>{body.ack}</Text>
              <View style={{ height: 40 }} />
              <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4 }}>
                <Text style={s.bold}>{recipient}</Text>
                <Text style={s.muted}>Signature and date</Text>
              </View>
            </View>
          )}
        </View>
        {body.note && <Text style={[s.muted, { marginTop: 24, fontSize: 8.5 }]}>{body.note}</Text>}
        <PageNumbers note={`${settings.companyName}${number ? ` · ${number}` : ""}`} />
      </Page>
    </Document>
  );
}

/** ID card, 85.6 × 54 mm (bank card size), front and back side by side on an A4 sheet with cut marks. */
export function IdCardPdf({
  body,
  settings,
  photo,
  signatureImage,
  watermark,
}: {
  body: LetterBody;
  settings: Settings;
  photo: { data: Buffer; format: "png" | "jpg" } | null;
  signatureImage: SignatureImage;
  watermark: string | null;
}) {
  const c = body.card!;
  const mm = (v: number) => (v * 72) / 25.4;
  const card = { width: mm(85.6), height: mm(54), borderWidth: 0.5, borderColor: "#94a3b8", borderStyle: "dashed" as const, borderRadius: 6, overflow: "hidden" as const };
  const signature = pdfImage(signatureImage);
  return (
    <Document title={`ID card, ${c.name}`} author={settings.companyName}>
      <Page size="A4" style={[s.page, { padding: 48 }]}>
        <Text style={[s.muted, { marginBottom: 14 }]}>Print at 100% (actual size), cut along the dashed lines, fold or place back to back and laminate.</Text>
        <View style={s.row}>
          <View style={[card, { marginRight: 18 }]}>
            {watermark && <Text style={[s.watermark, { top: 50, fontSize: 30 }]}>{watermark}</Text>}
            <View style={[s.row, { backgroundColor: BRAND, paddingHorizontal: 8, paddingVertical: 5, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#ff7a30" }]}>
              <View style={{ backgroundColor: "#ffffff", borderRadius: 3, padding: 2 }}>
                <PdfLogo height={14} />
              </View>
              <Text style={{ marginLeft: 6, color: "#ffffff", fontSize: 9, fontWeight: 600 }}>{settings.companyName}</Text>
            </View>
            <View style={[s.row, { padding: 8, flex: 1 }]}>
              <View style={{ width: mm(20), height: mm(25), borderWidth: 0.5, borderColor: LINE, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f8f8" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
                {photo ? <Image src={photo} style={{ width: mm(20), height: mm(25), objectFit: "cover" }} /> : <Text style={[s.muted, { fontSize: 6, textAlign: "center" }]}>Paste photo</Text>}
              </View>
              <View style={{ marginLeft: 8, flex: 1, justifyContent: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: 600, color: BRAND, lineHeight: 1.2 }}>{c.name}</Text>
                <Text style={{ fontSize: 7.5, marginTop: 2 }}>{c.designation}</Text>
                {c.department && <Text style={[s.muted, { fontSize: 7 }]}>{c.department}</Text>}
                <Text style={[s.label, { fontSize: 6, marginTop: 6, marginBottom: 0 }]}>Employee code</Text>
                <Text style={{ fontSize: 9, fontWeight: 600 }}>{c.code}</Text>
              </View>
            </View>
          </View>
          <View style={[card, { padding: 8 }]}>
            <View style={{ flex: 1, fontSize: 7, lineHeight: 1.45 }}>
              {(
                [
                  ["Blood group", c.bloodGroup],
                  ["Phone", c.phone],
                  ["In an emergency", c.emergency],
                  ["Joined", c.joined],
                ] as [string, string | null][]
              ).map(([k, v]) => (
                <View key={k} style={s.row}>
                  <Text style={[s.muted, { width: 62 }]}>{k}</Text>
                  <Text style={{ flex: 1 }}>{v || "—"}</Text>
                </View>
              ))}
              <Text style={[s.muted, { marginTop: 5, fontSize: 6.5 }]}>If found, please return to {settings.companyName}, {settings.companyAddress.replace(/\s*\n\s*/g, ", ")}{settings.companyPhone ? `, ${settings.companyPhone}` : ""}.</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ height: 16, justifyContent: "flex-end" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image, not an HTML one */}
                {signature && <Image src={signature} style={{ maxHeight: 15, maxWidth: 70, objectFit: "contain" }} />}
              </View>
              <Text style={[s.muted, { fontSize: 6 }]}>{body.signatory.name ? `${body.signatory.name}, ${body.signatory.title ?? ""}` : "Authorised signatory"}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
