import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Settings } from "../settings";
import { amountInWords, formatMoney } from "../invoices";
import { LINE, PageNumbers, Pairs, s } from "./layout";

type Money = { toString(): string };
type Doc = {
  placeOfSupply: string;
  billToName: string;
  billToAddress: string | null;
  billToGstin: string | null;
  notes: string | null;
  subtotal: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  total: Money;
};
type Line = { id: string; description: string; sac: string | null; quantity: Money; unitPrice: Money; gstRate: Money; amount: Money };

/** The same layout as the on-screen invoice and quote (BillingDocument), as a PDF to attach to emails. */
export function BillingPdf({
  doc,
  lines,
  settings,
  title,
  partyLabel,
  watermark,
  meta,
  paymentDetails,
  terms,
  footer,
}: {
  doc: Doc;
  lines: Line[];
  settings: Settings;
  title: string;
  partyLabel: string;
  watermark: string | null;
  meta: [string, string][];
  paymentDetails: boolean;
  terms?: string | null;
  footer: string;
}) {
  const interState = doc.placeOfSupply !== settings.companyState;
  const taxed = lines.some((l) => Number(l.gstRate) > 0);
  const bank = (
    [
      ["Account name", settings.bankAccountName],
      ["Bank", settings.bankName],
      ["Account no.", settings.bankAccountNo],
      ["IFSC", settings.bankIfsc],
      ["UPI", settings.upiId],
    ] as [string, string | null][]
  ).filter(([, v]) => v && paymentDetails) as [string, string][];
  const cols = taxed ? [18, 0, 52, 30, 60, 34, 70] : [18, 0, 52, 30, 60, 0, 70];
  const totals: [string, Money][] = [["Taxable value", doc.subtotal]];
  if (taxed) {
    if (interState) totals.push(["IGST", doc.igst]);
    else totals.push(["CGST", doc.cgst], ["SGST", doc.sgst]);
  }

  return (
    <Document title={`${title} ${meta[0][1]}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        {watermark && (
          <Text style={s.watermark} fixed>
            {watermark}
          </Text>
        )}
        <View style={[s.between, s.section, { paddingTop: 0 }]}>
          <View style={{ maxWidth: 280 }}>
            <Text style={s.h1}>{settings.companyName}</Text>
            <Text style={s.muted}>{settings.companyAddress}</Text>
            {(settings.companyPhone || settings.companyEmail) && (
              <Text style={s.muted}>{[settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · ")}</Text>
            )}
            {settings.gstin && <Text style={{ marginTop: 3 }}>GSTIN: {settings.gstin}</Text>}
            {settings.pan && <Text>PAN: {settings.pan}</Text>}
          </View>
          <View>
            <Text style={s.title}>{title}</Text>
            <View style={{ marginTop: 4 }}>
              {meta.map(([k, v], i) => (
                <View key={k} style={[s.row, { justifyContent: "flex-end" }]}>
                  <Text style={[s.muted, { marginRight: 8 }]}>{k}</Text>
                  <Text style={i === 0 ? s.bold : undefined}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[s.between, s.section]}>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.label}>{partyLabel}</Text>
            <Text style={s.bold}>{doc.billToName}</Text>
            {doc.billToAddress && <Text style={s.muted}>{doc.billToAddress}</Text>}
            {doc.billToGstin && <Text style={{ marginTop: 3 }}>GSTIN: {doc.billToGstin}</Text>}
          </View>
          <View>
            <Text style={[s.label, s.right]}>Place of supply</Text>
            <Text style={s.right}>{doc.placeOfSupply}</Text>
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <View style={[s.tr, { borderBottomColor: "#cbd5e1" }]} fixed>
            <Text style={[s.th, { width: cols[0] }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>Description</Text>
            <Text style={[s.th, { width: cols[2] }]}>SAC/HSN</Text>
            <Text style={[s.th, s.right, { width: cols[3] }]}>Qty</Text>
            <Text style={[s.th, s.right, { width: cols[4] + 10 }]}>Rate</Text>
            {taxed && <Text style={[s.th, s.right, { width: cols[5] }]}>GST</Text>}
            <Text style={[s.th, s.right, { width: cols[6] + 10 }]}>Amount</Text>
          </View>
          {lines.map((l, i) => (
            <View key={l.id} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: cols[0] }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1 }]}>{l.description}</Text>
              <Text style={[s.td, { width: cols[2] }]}>{l.sac ?? "—"}</Text>
              <Text style={[s.td, s.right, { width: cols[3] }]}>{Number(l.quantity)}</Text>
              <Text style={[s.td, s.right, { width: cols[4] + 10 }]}>{formatMoney(l.unitPrice)}</Text>
              {taxed && <Text style={[s.td, s.right, { width: cols[5] }]}>{Number(l.gstRate)}%</Text>}
              <Text style={[s.td, s.right, { width: cols[6] + 10 }]}>{formatMoney(l.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={[s.between, { marginTop: 12 }]} wrap={false}>
          <View style={{ maxWidth: 270 }}>
            <Text style={s.label}>Amount in words</Text>
            <Text>{amountInWords(Number(doc.total))}</Text>
            {bank.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={s.label}>Pay to</Text>
                <Pairs rows={bank} />
              </View>
            )}
          </View>
          <View style={{ width: 200 }}>
            {totals.map(([k, v]) => (
              <View key={k} style={[s.between, { paddingVertical: 1.5 }]}>
                <Text style={s.muted}>{k}</Text>
                <Text>{formatMoney(v)}</Text>
              </View>
            ))}
            <View style={[s.between, { borderTopWidth: 1, borderTopColor: LINE, marginTop: 3, paddingTop: 4 }]}>
              <Text style={[s.bold, { fontSize: 11 }]}>Total</Text>
              <Text style={[s.bold, { fontSize: 11 }]}>{formatMoney(doc.total)}</Text>
            </View>
          </View>
        </View>

        {terms && (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={s.label}>Terms</Text>
            <Text>{terms}</Text>
          </View>
        )}
        {doc.notes && <Text style={{ marginTop: 12 }}>{doc.notes}</Text>}
        {paymentDetails && settings.invoiceNote && <Text style={[s.muted, { marginTop: 6 }]}>{settings.invoiceNote}</Text>}

        <View style={{ marginTop: 30, alignItems: "flex-end" }} wrap={false}>
          <Text>For {settings.companyName}</Text>
          <Text style={[s.muted, { marginTop: 22 }]}>Authorised signatory</Text>
        </View>
        <PageNumbers note={footer} />
      </Page>
    </Document>
  );
}
