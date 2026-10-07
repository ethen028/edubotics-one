import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { settledByBill } from "@/lib/purchases";
import { AGE_BUCKETS, ageBucket, billState, round2 } from "@/lib/purchase-math";
import { BillBadge, formatINR2 } from "../ui";

export const metadata = { title: "Payables" };

/** What we owe vendors: every unpaid bill, grouped by vendor, with how late it is. */
export default async function PayablesPage({ searchParams }: PageProps<"/purchases/payables">) {
  await requireUser(["ADMIN"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const showPaid = sp.view === "all";
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);

  const bills = await db.vendorBill.findMany({
    where: showPaid ? {} : { status: "OPEN" },
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }],
    take: showPaid ? 300 : undefined,
  });
  const settled = await settledByBill(bills.map((b) => b.id));
  const rows = bills
    .map((b) => ({ ...b, settled: settled.get(b.id) ?? 0, balance: round2(Number(b.total) - (settled.get(b.id) ?? 0)) }))
    .filter((b) => showPaid || b.balance > 0);

  const unpaid = rows.filter((b) => b.status === "OPEN" && b.balance > 0);
  const totalOwed = round2(unpaid.reduce((s, b) => s + b.balance, 0));
  const overdue = round2(unpaid.filter((b) => b.dueDate < today).reduce((s, b) => s + b.balance, 0));
  const dueSoon = round2(unpaid.filter((b) => b.dueDate >= today && b.dueDate <= weekAhead).reduce((s, b) => s + b.balance, 0));

  // Vendor × ageing bucket.
  const byVendor = new Map<string, { id: string; name: string; buckets: number[]; total: number }>();
  for (const b of unpaid) {
    const v = byVendor.get(b.vendor.id) ?? { id: b.vendor.id, name: b.vendor.name, buckets: AGE_BUCKETS.map(() => 0), total: 0 };
    v.buckets[ageBucket(b.dueDate, today)] += b.balance;
    v.total += b.balance;
    byVendor.set(b.vendor.id, v);
  }
  const vendors = [...byVendor.values()].sort((a, b) => b.total - a.total);

  return (
    <>
      <PageHeader
        title="Payables"
        subtitle="Vendor bills still to pay. Late ones first."
        actions={
          <>
            {/* A file download from a route handler, not a page, so a plain link. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/purchases/bills/export" className="btn-secondary">
              Download spreadsheet
            </a>
            <Link href="/purchases/bills/new" className="btn-primary">
              Enter a bill
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="We owe vendors" value={formatINR2(totalOwed)} />
        <Stat label="Overdue" value={formatINR2(overdue)} />
        <Stat label="Due in the next 7 days" value={formatINR2(dueSoon)} />
      </div>

      {vendors.length > 0 && (
        <section className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b} className="text-right">
                    {b}
                  </th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/purchases/vendors/${v.id}`} className="link">
                      {v.name}
                    </Link>
                  </td>
                  {v.buckets.map((amt, i) => (
                    <td key={i} className={`text-right text-sm ${i > 0 && amt > 0 ? "font-medium text-red-600" : ""}`}>
                      {amt > 0 ? formatINR2(round2(amt)) : "—"}
                    </td>
                  ))}
                  <td className="text-right text-sm font-semibold">{formatINR2(round2(v.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mb-3 flex gap-2 text-sm">
        <Link href="?" className={!showPaid ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          To pay
        </Link>
        <Link href="?view=all" className={showPaid ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          All bills
        </Link>
      </div>

      {rows.length === 0 ? (
        <Empty>{showPaid ? "No bills entered yet." : "Nothing to pay. Every vendor bill is settled."}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Vendor</th>
                <th>Bill date</th>
                <th>Due</th>
                <th className="text-right">Total</th>
                <th className="text-right">Left to pay</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const state = billState(b, b.settled, today);
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/purchases/bills/${b.id}`} className="link font-medium">
                        {b.billNo}
                      </Link>
                    </td>
                    <td className="text-sm">{b.vendor.name}</td>
                    <td className="text-sm">{formatDate(b.billDate)}</td>
                    <td className={`text-sm ${state === "OVERDUE" ? "font-medium text-red-600" : ""}`}>{formatDate(b.dueDate)}</td>
                    <td className="text-right text-sm">{formatINR2(b.total)}</td>
                    <td className="text-right text-sm">{b.status === "OPEN" && b.balance > 0 ? formatINR2(b.balance) : "—"}</td>
                    <td>
                      <BillBadge state={state} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
