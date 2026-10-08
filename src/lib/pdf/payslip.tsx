import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Settings } from "../settings";
import { formatDate, formatINR } from "../format";
import { LINE, PageNumbers, s } from "./layout";

type Money = { toString(): string };
export type PayslipPdfData = {
  monthLabel: string;
  name: string;
  code: string;
  designation: string;
  department: string | null;
  daysInMonth: number;
  paidDays: Money;
  lopDays: Money;
  paidOn: Date | null;
  earnings: [string, Money][];
  deductions: [string, Money][];
  gross: Money;
  totalDeductions: Money;
  claims: [string, Money][];
  reimbursements: Money;
  net: Money;
  note: string | null;
};

function Table({ head, rows, total }: { head: string; rows: [string, Money][]; total?: [string, Money] }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[s.tr, { borderBottomColor: "#cbd5e1" }]}>
        <Text style={[s.th, { flex: 1 }]}>{head}</Text>
        <Text style={[s.th, s.right]}>₹</Text>
      </View>
      {rows.length === 0 && <Text style={[s.td, s.muted]}>None</Text>}
      {rows.map(([k, v], i) => (
        <View key={`${k}-${i}`} style={s.tr}>
          <Text style={[s.td, { flex: 1 }]}>{k}</Text>
          <Text style={[s.td, s.right]}>{formatINR(v)}</Text>
        </View>
      ))}
      {total && (
        <View style={s.row}>
          <Text style={[s.td, s.bold, { flex: 1 }]}>{total[0]}</Text>
          <Text style={[s.td, s.bold, s.right]}>{formatINR(total[1])}</Text>
        </View>
      )}
    </View>
  );
}

/** The payslip page as a PDF, attached when payslips are emailed. */
export function PayslipPdf({ p, settings }: { p: PayslipPdfData; settings: Settings }) {
  const facts: [string, string][] = [
    ["Name", p.name],
    ["Employee code", p.code],
    ["Designation", p.designation],
    ["Department", p.department ?? "—"],
    ["Days in month", String(p.daysInMonth)],
    ["Paid days", String(Number(p.paidDays))],
    ["LOP days", String(Number(p.lopDays))],
    ["Paid on", p.paidOn ? formatDate(p.paidOn) : "—"],
  ];
  return (
    <Document title={`Payslip ${p.monthLabel}, ${p.name}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        <View style={[s.between, s.section, { paddingTop: 0 }]}>
          <View>
            <Text style={s.h1}>{settings.companyName}</Text>
            <Text style={s.muted}>{settings.companyAddress}</Text>
          </View>
          <View>
            <Text style={[s.bold, s.right, { fontSize: 12 }]}>Payslip</Text>
            <Text style={[s.muted, s.right]}>{p.monthLabel}</Text>
          </View>
        </View>
        <View style={[s.row, s.section, { flexWrap: "wrap" }]}>
          {facts.map(([k, v]) => (
            <View key={k} style={[s.row, { width: "50%", paddingVertical: 1.5 }]}>
              <Text style={[s.muted, { width: 90 }]}>{k}</Text>
              <Text>{v}</Text>
            </View>
          ))}
        </View>
        <View style={[s.row, { marginTop: 12, gap: 24 }]}>
          <Table head="Earnings" rows={p.earnings} total={["Gross earnings", p.gross]} />
          <Table head="Deductions" rows={p.deductions} total={["Total deductions", p.totalDeductions]} />
        </View>
        {p.claims.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Table head="Expense claims paid back" rows={p.claims} total={["Total expense claims", p.reimbursements]} />
          </View>
        )}
        <View style={[s.between, { marginTop: 16, padding: 12, backgroundColor: "#f1f5f9", borderRadius: 6, borderWidth: 1, borderColor: LINE }]}>
          <View>
            <Text style={s.bold}>Net pay</Text>
            {p.claims.length > 0 && <Text style={[s.muted, { fontSize: 8 }]}>Salary after deductions, plus expense claims</Text>}
          </View>
          <Text style={[s.bold, { fontSize: 16 }]}>{formatINR(p.net)}</Text>
        </View>
        {p.note && <Text style={[s.muted, { marginTop: 8 }]}>Note: {p.note}</Text>}
        <PageNumbers note="This is a computer-generated payslip and needs no signature." />
      </Page>
    </Document>
  );
}
