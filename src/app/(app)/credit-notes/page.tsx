import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { financialYear, formatMoney } from "@/lib/invoices";
import { creditReasonLabel } from "@/lib/credit-notes";
import { todayIST } from "@/lib/time";

export const metadata = { title: "Credit notes" };

export default async function CreditNotesPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const notes = await db.creditNote.findMany({
    include: { invoice: { select: { id: true, number: true, organization: { select: { name: true } } } } },
    orderBy: [{ issueDate: "desc" }, { seq: "desc" }],
  });
  const fy = financialYear(todayIST());
  const live = notes.filter((n) => n.status === "ISSUED");
  const thisYear = live.filter((n) => n.fy === fy);
  const sum = (list: typeof notes, k: "total" | "cgst" | "sgst" | "igst" | "refundAmount") => list.reduce((s, n) => s + Number(n[k]), 0);

  return (
    <>
      <PageHeader
        title="Credit notes"
        subtitle="Corrections to issued invoices. Raise one from the invoice it corrects."
        actions={
          <>
            <Link href="/invoices" className="btn-secondary">
              Invoices
            </Link>
            <a href="/credit-notes/export" download className="btn-secondary">
              Download spreadsheet
            </a>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Credited this year (${fy})`} value={formatINR(sum(thisYear, "total"))} />
        <Stat label="GST reversed this year" value={formatINR(sum(thisYear, "cgst") + sum(thisYear, "sgst") + sum(thisYear, "igst"))} />
        <Stat label="Credit notes this year" value={thisYear.length} />
        <Stat label="Refunded to schools" value={formatINR(sum(live, "refundAmount"))} />
      </div>

      {notes.length === 0 ? (
        <Empty>No credit notes yet. Open an issued invoice and press “Raise a credit note” to correct or partly cancel it.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Credit note</th>
                <th>Date</th>
                <th>Invoice</th>
                <th>School / institution</th>
                <th>Reason</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link href={`/credit-notes/${n.id}`} className="link whitespace-nowrap">
                      {n.number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatDate(n.issueDate)}</td>
                  <td>
                    <Link href={`/invoices/${n.invoice.id}`} className="link whitespace-nowrap">
                      {n.invoice.number}
                    </Link>
                  </td>
                  <td>{n.invoice.organization.name}</td>
                  <td className="text-slate-600">{creditReasonLabel[n.reason]}</td>
                  <td className="text-right whitespace-nowrap">
                    {formatMoney(n.total)}
                    {Number(n.refundAmount) > 0 && <div className="text-xs text-slate-500">{formatMoney(n.refundAmount)} refunded</div>}
                  </td>
                  <td>
                    <Badge color={n.status === "ISSUED" ? "purple" : "gray"}>{n.status === "ISSUED" ? "Issued" : "Cancelled"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
