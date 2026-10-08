import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { projectScope } from "@/lib/projects";
import { orderScope } from "@/lib/purchases";
import { poNo, round2 } from "@/lib/purchase-math";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "../../../payroll/payslip/[id]/print-button";
import { TotalsTable, formatINR2 } from "../../ui";

export const metadata = { title: "Purchase order" };

/** The order as the vendor sees it: no internal notes, approvals or project names. */
export default async function PrintOrderPage({ params }: PageProps<"/purchases/[id]/print">) {
  const user = await requireUser();
  const { id } = await params;
  const order = await db.purchaseOrder.findFirst({
    where: { id, status: { notIn: ["PENDING", "REJECTED", "CANCELLED"] }, ...(isAdmin(user) ? {} : { OR: [orderScope(user), { project: projectScope(user) }] }) },
    include: { vendor: true, lines: { orderBy: { id: "asc" } }, decidedBy: { select: { name: true } } },
  });
  if (!order) notFound();
  const settings = await getSettings();

  return (
    <>
      <div className="mb-4 flex gap-2 print:hidden">
        <Link href={`/purchases/${order.id}`} className="btn-secondary">
          Back
        </Link>
        <PrintButton />
      </div>
      <article className="card mx-auto max-w-3xl print:border-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="text-sm">
            <div className="text-lg font-semibold">{settings.companyName}</div>
            <div className="whitespace-pre-line text-slate-500">{settings.companyAddress}</div>
            {(settings.companyPhone || settings.companyEmail) && (
              <div className="text-slate-500">{[settings.companyPhone, settings.companyEmail].filter(Boolean).join(" · ")}</div>
            )}
            {settings.gstin && <div className="mt-1">GSTIN {settings.gstin}</div>}
            {settings.pan && <div>PAN {settings.pan}</div>}
          </div>
          <div className="text-right">
            <div className="font-semibold">Purchase order</div>
            <div className="text-sm">{poNo(order.number)}</div>
            <div className="text-sm text-slate-500">{formatDate(order.decidedAt ?? order.createdAt)}</div>
          </div>
        </header>

        <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">To</div>
            <div className="font-medium">{order.vendor.name}</div>
            {order.vendor.contactName && <div>{order.vendor.contactName}</div>}
            {order.vendor.address && <div className="whitespace-pre-line">{order.vendor.address}</div>}
            <div>{order.vendor.state}</div>
            {order.vendor.gstin && <div>GSTIN {order.vendor.gstin}</div>}
          </div>
          <div className="sm:text-right">
            {order.expectedBy && (
              <div>
                <span className="text-slate-500">Deliver by: </span>
                {formatDate(order.expectedBy)}
              </div>
            )}
            <div>
              <span className="text-slate-500">Payment: </span>
              {order.vendor.paymentDays === 0 ? "on delivery" : `${order.vendor.paymentDays} days from bill`}
            </div>
            <div className="text-slate-500">Please quote {poNo(order.number)} on your bill.</div>
          </div>
        </div>

        <table className="table mb-4">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">GST</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.description}</td>
                <td className="text-right">
                  {l.quantity} {l.unit}
                </td>
                <td className="text-right">{formatINR2(l.unitPrice)}</td>
                <td className="text-right">{l.gstRate}%</td>
                <td className="text-right">{formatINR2(round2(l.quantity * Number(l.unitPrice)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TotalsTable subtotal={Number(order.subtotal)} tax={Number(order.tax)} total={Number(order.total)} interState={order.interState} />

        <footer className="mt-10 flex justify-end text-sm">
          <div className="text-center">
            <div className="mb-1 h-10" />
            <div className="border-t border-slate-300 px-6 pt-1">Authorised by {order.decidedBy?.name ?? settings.companyName}</div>
          </div>
        </footer>
      </article>
    </>
  );
}
