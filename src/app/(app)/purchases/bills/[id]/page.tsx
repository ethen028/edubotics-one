import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { COMPANY_STATE, PAYMENT_METHODS, billState, methodLabel, poNo, round2 } from "@/lib/purchase-math";
import { cancelBill, deletePayment, recordPayment } from "../../actions";
import { BillBadge, TotalsTable, formatINR2 } from "../../ui";

export default async function BillPage({ params }: PageProps<"/purchases/bills/[id]">) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const bill = await db.vendorBill.findUnique({
    where: { id },
    include: {
      vendor: true,
      order: { select: { id: true, number: true, total: true } },
      by: { select: { name: true } },
      file: { select: { fileName: true, size: true } },
      payments: { include: { by: { select: { name: true } } }, orderBy: { paidOn: "asc" } },
    },
  });
  if (!bill) notFound();
  const today = todayIST();
  const paid = round2(bill.payments.reduce((s, p) => s + Number(p.amount), 0));
  const tds = round2(bill.payments.reduce((s, p) => s + Number(p.tds), 0));
  const balance = round2(Number(bill.total) - paid - tds);
  const state = billState(bill, paid + tds, today);

  return (
    <>
      <PageHeader
        title={`Bill ${bill.billNo} · ${bill.vendor.name}`}
        subtitle={<>Entered by {bill.by.name}, {formatDateTime(bill.createdAt)}</>}
        actions={
          <Link href="/purchases/payables" className="btn-secondary">
            Payables
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Bill total" value={formatINR2(bill.total)} />
        <Stat label="Paid" value={formatINR2(paid)} />
        <Stat label="TDS held back" value={formatINR2(tds)} />
        <Stat label="Left to pay" value={bill.status === "CANCELLED" ? "—" : formatINR2(balance)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Payments</h2>
            {bill.payments.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing paid yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>How</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">TDS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bill.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-sm">{formatDate(p.paidOn)}</td>
                      <td className="text-sm">
                        {methodLabel[p.method] ?? p.method}
                        {p.reference && <span className="text-slate-500"> · {p.reference}</span>}
                        {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                        <div className="text-xs text-slate-400">by {p.by.name}</div>
                      </td>
                      <td className="text-right text-sm">{formatINR2(p.amount)}</td>
                      <td className="text-right text-sm">{Number(p.tds) > 0 ? formatINR2(p.tds) : "—"}</td>
                      <td className="text-right">
                        <form action={deletePayment.bind(null, p.id)}>
                          <button className="text-xs text-slate-500 hover:text-red-600">Remove</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {bill.status === "OPEN" && balance > 0 && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Record a payment</h2>
              <p className="mb-3 text-sm text-slate-500">
                If you hold back TDS (for example on a service contract), enter it separately. Paid and TDS together settle the bill.
              </p>
              <ActionForm action={recordPayment.bind(null, bill.id)} className="grid gap-3 sm:grid-cols-3">
                <Field label="Paid on">
                  <input name="paidOn" type="date" required defaultValue={toDateInput(today)} className="input" />
                </Field>
                <Field label="Amount paid (₹)">
                  <input name="amount" required inputMode="decimal" defaultValue={balance} className="input" />
                </Field>
                <Field label="TDS held back (₹)">
                  <input name="tds" inputMode="decimal" defaultValue={0} className="input" />
                </Field>
                <Field label="How">
                  <select name="method" className="input">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {methodLabel[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="UTR / cheque no.">
                  <input name="reference" className="input" />
                </Field>
                <Field label="Note">
                  <input name="note" className="input" />
                </Field>
                <div className="sm:col-span-3">
                  <SubmitButton>Record payment</SubmitButton>
                </div>
              </ActionForm>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card space-y-2 text-sm">
            <BillBadge state={state} />
            <div>
              <span className="text-slate-500">Vendor: </span>
              <Link href={`/purchases/vendors/${bill.vendor.id}`} className="link">
                {bill.vendor.name}
              </Link>
            </div>
            {bill.order && (
              <div>
                <span className="text-slate-500">Order: </span>
                <Link href={`/purchases/${bill.order.id}`} className="link">
                  {poNo(bill.order.number)}
                </Link>{" "}
                <span className="text-slate-500">({formatINR2(bill.order.total)})</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">Bill date: </span>
              {formatDate(bill.billDate)}
            </div>
            <div className={state === "OVERDUE" ? "font-medium text-red-600" : ""}>
              <span className="text-slate-500">Due: </span>
              {formatDate(bill.dueDate)}
            </div>
            {bill.file && (
              <div>
                <a href={`/api/purchases/bills/${bill.id}/file`} target="_blank" rel="noreferrer" className="link">
                  Open the bill ({bill.file.fileName})
                </a>
              </div>
            )}
            {bill.notes && <div className="text-slate-500">{bill.notes}</div>}
            <div className="border-t border-slate-100 pt-2">
              <TotalsTable
                subtotal={Number(bill.subtotal)}
                tax={Number(bill.tax)}
                total={Number(bill.total)}
                interState={bill.vendor.state !== COMPANY_STATE}
              />
            </div>
            {bill.vendor.bankDetails && (
              <div className="border-t border-slate-100 pt-2">
                <div className="text-slate-500">Pay to</div>
                {bill.vendor.bankDetails}
              </div>
            )}
          </section>
          {bill.status === "OPEN" && bill.payments.length === 0 && (
            <form action={cancelBill.bind(null, bill.id)}>
              <button className="text-sm text-slate-500 hover:text-red-600 hover:underline">Cancel this bill (entered by mistake)</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
