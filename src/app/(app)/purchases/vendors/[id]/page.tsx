import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { orderScope, settledByBill } from "@/lib/purchases";
import { billState, poNo, round2 } from "@/lib/purchase-math";
import { toggleVendorActive, updateVendor } from "../../actions";
import { BillBadge, OrderBadge, formatINR2 } from "../../ui";
import { VendorFields } from "../vendor-fields";

export default async function VendorPage({ params }: PageProps<"/purchases/vendors/[id]">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;
  const vendor = await db.vendor.findUnique({
    where: { id },
    include: {
      orders: { where: orderScope(user), orderBy: { number: "desc" }, take: 50 },
      bills: admin ? { orderBy: { billDate: "desc" }, take: 100 } : false,
    },
  });
  if (!vendor) notFound();
  const today = todayIST();
  const bills = vendor.bills ?? [];
  const settled = await settledByBill(bills.map((b) => b.id));
  const open = bills.filter((b) => b.status === "OPEN");
  const owed = round2(open.reduce((s, b) => s + Number(b.total) - (settled.get(b.id) ?? 0), 0));
  const overdue = round2(open.filter((b) => b.dueDate < today).reduce((s, b) => s + Number(b.total) - (settled.get(b.id) ?? 0), 0));
  const yearStart = new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 3, 1));
  const billedThisYear = round2(open.filter((b) => b.billDate >= yearStart).reduce((s, b) => s + Number(b.total), 0));

  return (
    <>
      <PageHeader
        title={vendor.name}
        subtitle={
          <>
            {vendor.state}
            {vendor.gstin && ` · GSTIN ${vendor.gstin}`}
            {!vendor.active && (
              <span className="ml-2">
                <Badge>Archived</Badge>
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link href="/purchases/vendors" className="btn-secondary">
              All vendors
            </Link>
            {vendor.active && (
              <Link href={`/purchases/new?vendor=${vendor.id}`} className="btn-primary">
                New order
              </Link>
            )}
          </>
        }
      />

      {admin && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="We owe" value={formatINR2(owed)} />
          <Stat label="Overdue" value={formatINR2(overdue)} />
          <Stat label="Billed this financial year" value={formatINR2(billedThisYear)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Purchase orders</h2>
            {vendor.orders.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <table className="table">
                <tbody>
                  {vendor.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/purchases/${o.id}`} className="link">
                          {poNo(o.number)}
                        </Link>
                      </td>
                      <td className="text-sm">{formatDate(o.createdAt)}</td>
                      <td className="max-w-xs truncate text-sm">{o.purpose}</td>
                      <td className="text-right text-sm">{formatINR2(o.total)}</td>
                      <td>
                        <OrderBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {admin && (
            <section className="card overflow-x-auto">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Bills</h2>
                <Link href={`/purchases/bills/new?vendor=${vendor.id}`} className="btn-secondary btn-sm">
                  Enter a bill
                </Link>
              </div>
              {bills.length === 0 ? (
                <p className="text-sm text-slate-500">None yet.</p>
              ) : (
                <table className="table">
                  <tbody>
                    {bills.map((b) => {
                      const paid = settled.get(b.id) ?? 0;
                      return (
                        <tr key={b.id}>
                          <td>
                            <Link href={`/purchases/bills/${b.id}`} className="link">
                              {b.billNo}
                            </Link>
                          </td>
                          <td className="text-sm">{formatDate(b.billDate)}</td>
                          <td className="text-sm">due {formatDate(b.dueDate)}</td>
                          <td className="text-right text-sm">{formatINR2(b.total)}</td>
                          <td className="text-right text-sm">{b.status === "OPEN" && paid < Number(b.total) ? `${formatINR2(round2(Number(b.total) - paid))} left` : ""}</td>
                          <td>
                            <BillBadge state={billState(b, paid, today)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          {isManagerOrAdmin(user) ? (
            <section className="card">
              <h2 className="mb-3 font-semibold">Details</h2>
              <ActionForm action={updateVendor.bind(null, vendor.id)} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <VendorFields vendor={vendor} />
                <div>
                  <SubmitButton>Save</SubmitButton>
                </div>
              </ActionForm>
              <form action={toggleVendorActive.bind(null, vendor.id)} className="mt-3">
                <button className="text-sm text-slate-500 hover:text-red-600 hover:underline">
                  {vendor.active ? "Archive this vendor" : "Bring this vendor back"}
                </button>
              </form>
            </section>
          ) : (
            <section className="card space-y-1 text-sm">
              {vendor.contactName && <div>{vendor.contactName}</div>}
              {vendor.phone && <div>{vendor.phone}</div>}
              {vendor.email && <div>{vendor.email}</div>}
              {vendor.address && <div className="whitespace-pre-line text-slate-600">{vendor.address}</div>}
              {vendor.notes && <div className="text-slate-500">{vendor.notes}</div>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
