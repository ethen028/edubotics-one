import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { BILLABLE_STATUSES } from "@/lib/purchases";
import { orderTotals, poNo, round2 } from "@/lib/purchase-math";
import { createBill } from "../../actions";
import { formatINR2 } from "../../ui";

export const metadata = { title: "Enter a vendor bill" };

export default async function NewBillPage({ searchParams }: PageProps<"/purchases/bills/new">) {
  await requireUser(["ADMIN"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const [vendors, orders] = await Promise.all([
    db.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({
      where: { status: { in: [...BILLABLE_STATUSES] } },
      include: { vendor: { select: { name: true } }, lines: true, bills: { where: { status: "OPEN" }, select: { total: true } } },
      orderBy: { number: "desc" },
      take: 100,
    }),
  ]);
  const order = orders.find((o) => o.id === sp.order);
  const vendorId = order?.vendorId ?? (vendors.some((v) => v.id === sp.vendor) ? sp.vendor : undefined);
  // From an order: suggest what has arrived and isn't billed yet (or the whole order if nothing has arrived).
  let suggested: { subtotal: number; tax: number } | undefined;
  if (order) {
    const anyIn = order.lines.some((l) => l.received > 0);
    const t = orderTotals(
      order.lines.map((l) => ({ quantity: anyIn ? Math.min(l.received, l.quantity) : l.quantity, unitPrice: Number(l.unitPrice), gstRate: l.gstRate })),
    );
    const billed = order.bills.reduce((s, b) => s + Number(b.total), 0);
    if (billed === 0) suggested = t;
    else if (t.total > billed) {
      // Already part billed: suggest the rest, split in the same ratio as the order.
      const share = (t.total - billed) / t.total;
      suggested = { subtotal: round2(t.subtotal * share), tax: round2(t.tax * share) };
    }
  }
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Enter a vendor bill"
        subtitle="The vendor's invoice to us. Attach a photo or PDF so the accountant can find it."
        actions={
          <Link href={order ? `/purchases/${order.id}` : "/purchases/payables"} className="btn-secondary">
            Back
          </Link>
        }
      />
      <div className="card max-w-3xl">
        <ActionForm action={createBill} className="grid gap-3 sm:grid-cols-3">
          <Field label="Vendor" className="sm:col-span-2">
            <select name="vendorId" required defaultValue={vendorId ?? ""} className="input">
              <option value="">Pick a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Against purchase order">
            <select name="orderId" defaultValue={order?.id ?? ""} className="input">
              <option value="">No order</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {poNo(o.number)} · {o.vendor.name} · {formatINR2(o.total)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vendor's invoice number">
            <input name="billNo" required placeholder="INV/2026/0412" className="input" />
          </Field>
          <Field label="Bill date">
            <input name="billDate" type="date" required defaultValue={toDateInput(today)} className="input" />
          </Field>
          <Field label="Due date (blank = vendor's terms)">
            <input name="dueDate" type="date" className="input" />
          </Field>
          <Field label="Amount before GST (₹)">
            <input name="subtotal" required inputMode="decimal" defaultValue={suggested?.subtotal ?? ""} className="input" />
          </Field>
          <Field label="GST on the bill (₹)">
            <input name="tax" required inputMode="decimal" defaultValue={suggested?.tax ?? 0} className="input" />
          </Field>
          <Field label="Bill photo or PDF (optional)">
            <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input py-1.5" />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <input name="notes" className="input" />
          </Field>
          {suggested && (
            <p className="text-xs text-slate-500 sm:col-span-3">
              Filled in from {poNo(order!.number)}: {formatINR2(round2(suggested.subtotal + suggested.tax))} with GST. Change it to match the
              vendor&apos;s paper if it differs.
            </p>
          )}
          <div className="sm:col-span-3">
            <SubmitButton>Save bill</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
