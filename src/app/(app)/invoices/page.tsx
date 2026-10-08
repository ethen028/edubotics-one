import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { formatMoney, payStateColor, payStateLabel, type PayState } from "@/lib/invoices";
import { invoicesWithBalance } from "./data";

export const metadata = { title: "Invoices" };

const FILTERS: [string, string, (s: PayState) => boolean][] = [
  ["unpaid", "Unpaid", (s) => s === "DUE" || s === "PART_PAID" || s === "OVERDUE"],
  ["overdue", "Overdue", (s) => s === "OVERDUE"],
  ["draft", "Drafts", (s) => s === "DRAFT"],
  ["paid", "Paid or credited", (s) => s === "PAID" || s === "CREDITED"],
  ["all", "All", () => true],
];

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const filter = FILTERS.find(([k]) => k === sp.show) ?? FILTERS[0];
  const invoices = await invoicesWithBalance();
  const shown = invoices.filter((i) => filter[2](i.state));

  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const outstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const overdue = invoices.filter((i) => i.state === "OVERDUE");
  const receivedThisMonth = invoices
    .flatMap((i) => (i.status === "CANCELLED" ? [] : i.payments))
    .filter((p) => p.receivedOn >= monthStart)
    .reduce((s, p) => s + Number(p.amount) + Number(p.tds), 0);
  const billedThisMonth = invoices
    .filter((i) => i.status === "ISSUED" && i.issueDate >= monthStart)
    .reduce((s, i) => s + Number(i.total), 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Bills to schools and institutions, and what they still owe."
        actions={
          <>
            <Link href="/invoices/dues" className="btn-secondary">
              Payments due
            </Link>
            <Link href="/credit-notes" className="btn-secondary">
              Credit notes
            </Link>
            <a href={`/invoices/export`} download className="btn-secondary">
              Download spreadsheet
            </a>
            <Link href="/invoices/new" className="btn-primary">
              New invoice
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Still to collect" value={formatINR(outstanding)} href="/invoices/dues" />
        <Stat
          label={`Overdue (${overdue.length})`}
          value={formatINR(overdue.reduce((s, i) => s + i.balance, 0))}
          href="/invoices?show=overdue"
        />
        <Stat label="Billed this month" value={formatINR(billedThisMonth)} />
        <Stat label="Received this month" value={formatINR(receivedThisMonth)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label, test]) => (
          <Link
            key={k}
            href={`?show=${k}`}
            className={`rounded-full px-3 py-1 ${k === filter[0] ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            {label} ({invoices.filter((i) => test(i.state)).length})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty>
          {invoices.length === 0
            ? "No invoices yet. Start one here, or from a won deal or a delivery project."
            : `No ${filter[1].toLowerCase()} invoices.`}
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>School / institution</th>
                <th>Date</th>
                <th>Due</th>
                <th className="text-right">Total</th>
                <th className="text-right">Still due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/invoices/${i.id}`} className="link whitespace-nowrap">
                      {i.number ?? "Draft"}
                    </Link>
                  </td>
                  <td>{i.organization.name}</td>
                  <td className="whitespace-nowrap">{formatDate(i.issueDate)}</td>
                  <td className={`whitespace-nowrap ${i.state === "OVERDUE" ? "font-medium text-red-600" : ""}`}>
                    {formatDate(i.dueDate)}
                    {i.state === "OVERDUE" && <div className="text-xs">{i.daysLate} days late</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">{formatMoney(i.total)}</td>
                  <td className="text-right whitespace-nowrap">
                    {i.balance > 0 ? formatMoney(i.balance) : "—"}
                    {i.owedBack > 0 && <div className="text-xs text-purple-700">{formatMoney(i.owedBack)} to refund</div>}
                  </td>
                  <td>
                    <Badge color={payStateColor[i.state]}>{payStateLabel[i.state]}</Badge>
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
