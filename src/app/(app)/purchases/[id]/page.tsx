import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { projectScope } from "@/lib/projects";
import { BILLABLE_STATUSES, RECEIVABLE_STATUSES, canApproveOrder, orderScope, settledByBill } from "@/lib/purchases";
import { billState, poNo, round2 } from "@/lib/purchase-math";
import { cancelOrder, closeOrder, decidePurchaseOrder, markOrdered, receiveOrder } from "../actions";
import { BillBadge, OrderBadge, TotalsTable, formatINR2 } from "../ui";

export default async function OrderPage({ params }: PageProps<"/purchases/[id]">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;
  const order = await db.purchaseOrder.findFirst({
    // Others also see orders for projects they're on.
    where: { id, ...(admin ? {} : { OR: [orderScope(user), { project: projectScope(user) }] }) },
    include: {
      vendor: true,
      requester: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
      project: { select: { id: true, name: true } },
      lines: { include: { item: { select: { id: true, sku: true, onHand: true } } }, orderBy: { id: "asc" } },
      receipts: { include: { by: { select: { name: true } }, lines: { include: { line: { select: { description: true, unit: true } } } } }, orderBy: { createdAt: "desc" } },
      bills: admin ? { orderBy: { billDate: "asc" } } : false,
    },
  });
  if (!order) notFound();

  const today = todayIST();
  const canApprove = order.status === "PENDING" && (await canApproveOrder(user, order));
  const anyReceived = order.lines.some((l) => l.received > 0);
  const canCancel = ["PENDING", "APPROVED", "ORDERED"].includes(order.status) && !anyReceived && (order.requesterId === user.id || admin);
  const receivable = (RECEIVABLE_STATUSES as readonly string[]).includes(order.status);
  const billable = (BILLABLE_STATUSES as readonly string[]).includes(order.status);
  const showReceived = anyReceived || receivable;
  const bills = order.bills ?? [];
  const settled = bills.length ? await settledByBill(bills.map((b) => b.id)) : new Map<string, number>();
  const billed = round2(bills.filter((b) => b.status === "OPEN").reduce((s, b) => s + Number(b.total), 0));
  const receivedValue = round2(
    order.lines.reduce((s, l) => s + Math.min(l.received, l.quantity) * Number(l.unitPrice) * (1 + l.gstRate / 100), 0),
  );
  const late = receivable && order.expectedBy && order.expectedBy < today;

  return (
    <>
      <PageHeader
        title={`${poNo(order.number)} · ${order.vendor.name}`}
        subtitle={<>Raised by {order.requester.name}, {formatDateTime(order.createdAt)}</>}
        actions={
          <>
            <Link href="/purchases" className="btn-secondary">
              All orders
            </Link>
            {order.status !== "PENDING" && order.status !== "REJECTED" && order.status !== "CANCELLED" && (
              <Link href={`/purchases/${order.id}/print`} className="btn-secondary">
                Print for vendor
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>What</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Amount</th>
                  {showReceived && <th className="text-right">Received</th>}
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.item ? (
                        <Link href={`/inventory/${l.item.id}`} className="link">
                          {l.description}
                        </Link>
                      ) : (
                        l.description
                      )}
                      <div className="text-xs text-slate-500">{l.item ? `${l.item.sku} · goes into stock` : "Not a stock item"}</div>
                    </td>
                    <td className="text-right">
                      {l.quantity} <span className="text-xs text-slate-500">{l.unit}</span>
                    </td>
                    <td className="text-right">{formatINR2(l.unitPrice)}</td>
                    <td className="text-right">{l.gstRate}%</td>
                    <td className="text-right">{formatINR2(round2(l.quantity * Number(l.unitPrice)))}</td>
                    {showReceived && (
                      <td className={`text-right ${l.received >= l.quantity ? "text-emerald-700" : "font-semibold"}`}>
                        {l.received} / {l.quantity}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4">
              <TotalsTable subtotal={Number(order.subtotal)} tax={Number(order.tax)} total={Number(order.total)} interState={order.interState} />
            </div>
          </section>

          {admin && receivable && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Record a delivery</h2>
              <p className="mb-3 text-sm text-slate-500">
                Enter what arrived. Stock items are added to inventory straight away and their unit cost is updated to this order&apos;s price.
                You can record a part delivery now and the rest later.
              </p>
              <ActionForm action={receiveOrder.bind(null, order.id)} className="space-y-2">
                {order.lines
                  .filter((l) => l.received < l.quantity)
                  .map((l) => (
                    <label key={l.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {l.description}{" "}
                        <span className="text-slate-500">
                          ({l.quantity - l.received} {l.unit} still to come{l.item ? `, ${l.item.onHand} in stock` : ""})
                        </span>
                      </span>
                      <input
                        name={`recv_${l.id}`}
                        type="number"
                        min={0}
                        max={l.quantity - l.received}
                        defaultValue={l.quantity - l.received}
                        className="input w-24"
                      />
                    </label>
                  ))}
                <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <input name="receivedOn" type="date" defaultValue={toDateInput(today)} className="input" aria-label="Received on" />
                  <input name="note" placeholder="Note, e.g. delivery challan 4471, 2 boxes damaged" className="input" />
                </div>
                <SubmitButton>Record delivery</SubmitButton>
              </ActionForm>
            </section>
          )}

          {order.receipts.length > 0 && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Deliveries</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {order.receipts.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="font-medium">
                      {formatDate(r.receivedOn)} <span className="font-normal text-slate-500">· recorded by {r.by.name}</span>
                    </div>
                    <div>{r.lines.map((rl) => `${rl.quantity} ${rl.line.unit} ${rl.line.description}`).join(" · ")}</div>
                    {r.note && <div className="text-slate-500">{r.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {admin && billable && (
            <section className="card">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">Vendor bills</h2>
                <Link href={`/purchases/bills/new?order=${order.id}`} className="btn-secondary btn-sm">
                  Enter the vendor&apos;s bill
                </Link>
              </div>
              {bills.length === 0 ? (
                <p className="text-sm text-slate-500">No bill entered yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {bills.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <Link href={`/purchases/bills/${b.id}`} className="link">
                          {b.billNo}
                        </Link>{" "}
                        · {formatDate(b.billDate)} · {formatINR2(b.total)}
                      </span>
                      <BillBadge state={billState(b, settled.get(b.id) ?? 0, today)} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Billed {formatINR2(billed)} of {formatINR2(order.total)} ordered · goods received worth {formatINR2(receivedValue)} with GST.
                {billed > Number(order.total) && <span className="font-medium text-red-600"> Billed more than the order.</span>}
              </p>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card space-y-2 text-sm">
            <div>
              <OrderBadge status={order.status} />
              {late && <span className="ml-2 text-xs font-medium text-red-600">Delivery late</span>}
            </div>
            <div>
              <span className="text-slate-500">For: </span>
              {order.purpose}
            </div>
            {order.project && (
              <div>
                <span className="text-slate-500">Project: </span>
                <Link href={`/projects/${order.project.id}`} className="link">
                  {order.project.name}
                </Link>
              </div>
            )}
            {order.expectedBy && (
              <div>
                <span className="text-slate-500">Needed by: </span>
                {formatDate(order.expectedBy)}
              </div>
            )}
            <div className="border-t border-slate-100 pt-2">
              <Link href={`/purchases/vendors/${order.vendor.id}`} className="link font-medium">
                {order.vendor.name}
              </Link>
              <div className="text-slate-500">
                {order.vendor.state}
                {order.vendor.gstin && ` · GSTIN ${order.vendor.gstin}`}
              </div>
              {order.vendor.phone && <div>{order.vendor.phone}</div>}
            </div>
            {order.decidedBy && (
              <div className="border-t border-slate-100 pt-2">
                {order.status === "REJECTED" ? "Rejected" : "Approved"} by {order.decidedBy.name}, {formatDateTime(order.decidedAt)}
                {order.decisionNote && <div className="text-slate-500">“{order.decisionNote}”</div>}
              </div>
            )}
            {order.orderedAt && <div>Ordered {formatDateTime(order.orderedAt)}</div>}
          </section>

          {canApprove && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Your decision</h2>
              <form action={decidePurchaseOrder.bind(null, order.id)} className="space-y-2">
                <input name="note" placeholder="Note (optional)" className="input" />
                <div className="flex gap-2">
                  <button name="decision" value="APPROVED" className="btn-primary btn-sm">
                    Approve
                  </button>
                  <button name="decision" value="REJECTED" className="btn-danger btn-sm">
                    Reject
                  </button>
                </div>
              </form>
            </section>
          )}

          {order.status === "PENDING" && !canApprove && (
            <p className="text-sm text-slate-500">Waiting for {order.requester.name}&apos;s manager or an admin to approve.</p>
          )}
          {order.status === "APPROVED" && !admin && <p className="text-sm text-slate-500">Approved. An admin will place the order.</p>}

          {admin && order.status === "APPROVED" && (
            <section className="card space-y-2 text-sm">
              <p className="text-slate-500">Print or send the order to the vendor, then mark it as ordered.</p>
              <form action={markOrdered.bind(null, order.id)}>
                <button className="btn-primary btn-sm">Mark as ordered</button>
              </form>
            </section>
          )}

          {admin && order.status === "PART_RECEIVED" && (
            <form action={closeOrder.bind(null, order.id)}>
              <button className="text-sm text-slate-500 hover:text-red-600 hover:underline">Stop waiting for the rest (close short)</button>
            </form>
          )}

          {canCancel && (
            <form action={cancelOrder.bind(null, order.id)}>
              <button className="text-sm text-slate-500 hover:text-red-600 hover:underline">Cancel this order</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
