import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fyLabel } from "@/lib/accounts";
import { accountsSummary } from "../data";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** The accounts summary month by month, one row per month and a total, for the accountant. */
export async function GET(request: NextRequest) {
  await requireUser(["ADMIN", "MANAGER"]);
  const a = await accountsSummary(request.nextUrl.searchParams.get("fy") ?? undefined);
  const columns = [
    ["Month", "label"],
    ["Invoiced (before GST)", "sales"],
    ["Credit notes", "credited"],
    ["Workshop fees", "workshopFees"],
    ["Income", "income"],
    ["Vendor bills (before GST)", "purchases"],
    ["Salaries", "salaries"],
    ["Expense claims", "claims"],
    ["Spending", "spending"],
    ["Profit", "profit"],
    ["Received from schools", "receivedSchools"],
    ["Workshop fees received", "receivedWorkshops"],
    ["Refunded to schools", "refunds"],
    ["Money in", "moneyIn"],
    ["Paid to vendors", "paidVendors"],
    ["Salaries paid", "paidSalaries"],
    ["Claims paid outside payroll", "paidClaims"],
    ["Money out", "moneyOut"],
    ["CGST collected", "cgstOut"],
    ["SGST collected", "sgstOut"],
    ["IGST collected", "igstOut"],
    ["GST collected", "gstNetOut"],
    ["GST paid on bills", "gstIn"],
    ["GST to pay", "gstToPay"],
    ["TDS held back by schools", "tdsBySchools"],
    ["TDS held back from vendors", "tdsOnVendors"],
    ["TDS on salaries", "tdsOnSalaries"],
  ] as const;
  const rows = [...a.rows, { ...a.total, key: "total", label: "Total" }];
  const lines = [columns.map(([h]) => h), ...rows.map((r) => columns.map(([, k]) => r[k]))];
  return new Response(lines.map((l) => l.map(csv).join(",")).join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="accounts-summary-${fyLabel(a.fy)}.csv"`,
    },
  });
}
