import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { OPEN_PO_STATUSES, settledByBill } from "@/lib/purchases";
import { round2 } from "@/lib/purchase-math";
import { createVendor } from "../actions";
import { formatINR2 } from "../ui";
import { VendorFields } from "./vendor-fields";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({ searchParams }: PageProps<"/purchases/vendors">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const canEdit = isManagerOrAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const q = sp.q?.trim() ?? "";
  const showArchived = sp.archived === "1";
  const today = todayIST();

  const vendors = await db.vendor.findMany({
    where: {
      active: !showArchived,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: {
      _count: { select: { orders: { where: { status: { in: [...OPEN_PO_STATUSES] } } } } },
      bills: admin ? { where: { status: "OPEN" }, select: { id: true, total: true, dueDate: true } } : false,
    },
    orderBy: { name: "asc" },
  });
  const settled = admin ? await settledByBill(vendors.flatMap((v) => (v.bills ?? []).map((b) => b.id))) : new Map<string, number>();

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers of kits, components, printing and services."
        actions={
          <Link href="/purchases" className="btn-secondary">
            Purchase orders
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="?" className={!showArchived ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          Active
        </Link>
        <Link href="?archived=1" className={showArchived ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          Archived
        </Link>
        <form className="ml-auto flex gap-2">
          {showArchived && <input type="hidden" name="archived" value="1" />}
          <input name="q" defaultValue={q} placeholder="Search name or what they supply" className="input w-60 py-1.5" />
          <button className="btn-secondary btn-sm">Search</button>
        </form>
      </div>

      {vendors.length === 0 ? (
        <Empty>{q || showArchived ? "Nothing matches." : canEdit ? "No vendors yet. Add the first one below." : "No vendors yet."}</Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>State</th>
                <th>Contact</th>
                <th className="text-right">Open orders</th>
                {admin && <th className="text-right">We owe</th>}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const bills = v.bills ?? [];
                const owed = round2(bills.reduce((s, b) => s + Number(b.total) - (settled.get(b.id) ?? 0), 0));
                const overdue = bills.some((b) => b.dueDate < today && Number(b.total) - (settled.get(b.id) ?? 0) > 0);
                return (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/purchases/vendors/${v.id}`} className="link font-medium">
                        {v.name}
                      </Link>
                      {v.notes && <div className="max-w-sm truncate text-xs text-slate-500">{v.notes}</div>}
                    </td>
                    <td className="text-sm">{v.state}</td>
                    <td className="text-sm">
                      {v.contactName}
                      {v.phone && <div className="text-xs text-slate-500">{v.phone}</div>}
                    </td>
                    <td className="text-right text-sm">{v._count.orders || "—"}</td>
                    {admin && (
                      <td className="text-right text-sm">
                        {owed > 0 ? formatINR2(owed) : "—"}
                        {overdue && (
                          <span className="ml-1.5">
                            <Badge color="red">Overdue</Badge>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && !showArchived && (
        <section className="card max-w-3xl" id="add">
          <h2 className="mb-3 font-semibold">Add a vendor</h2>
          <ActionForm action={createVendor} className="grid gap-3 sm:grid-cols-3">
            {sp.back === "order" && <input type="hidden" name="back" value="order" />}
            <VendorFields />
            <div className="sm:col-span-3">
              <SubmitButton>{sp.back === "order" ? "Add and go back to the order" : "Add vendor"}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
