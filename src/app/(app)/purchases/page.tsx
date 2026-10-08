import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { OPEN_PO_STATUSES, RECEIVABLE_STATUSES, orderScope } from "@/lib/purchases";
import { poNo } from "@/lib/purchase-math";
import { OrderBadge, formatINR2 } from "./ui";

export const metadata = { title: "Purchases" };

const VIEWS = {
  open: { label: "Open", where: { status: { in: [...OPEN_PO_STATUSES] } } },
  pending: { label: "Waiting for approval", where: { status: "PENDING" } },
  incoming: { label: "Waiting for goods", where: { status: { in: [...RECEIVABLE_STATUSES] } } },
  all: { label: "All", where: {} },
} satisfies Record<string, { label: string; where: Prisma.PurchaseOrderWhereInput }>;

export default async function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const view = (sp.view && sp.view in VIEWS ? sp.view : "open") as keyof typeof VIEWS;
  const q = sp.q?.trim() ?? "";
  const scope = orderScope(user);
  const today = todayIST();

  const [orders, openValue, pending, incoming] = await Promise.all([
    db.purchaseOrder.findMany({
      where: {
        AND: [
          scope,
          VIEWS[view].where,
          q ? { OR: [{ purpose: { contains: q, mode: "insensitive" } }, { vendor: { name: { contains: q, mode: "insensitive" } } }] } : {},
        ],
      },
      include: {
        vendor: { select: { id: true, name: true } },
        requester: { select: { name: true } },
        project: { select: { id: true, name: true } },
        lines: { select: { quantity: true, received: true } },
      },
      orderBy: { number: "desc" },
      take: 200,
    }),
    db.purchaseOrder.aggregate({ where: { AND: [scope, { status: { in: [...RECEIVABLE_STATUSES] } }] }, _sum: { total: true } }),
    db.purchaseOrder.count({ where: { AND: [scope, { status: "PENDING" }] } }),
    db.purchaseOrder.count({ where: { AND: [scope, { status: { in: [...RECEIVABLE_STATUSES] } }] } }),
  ]);

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="Buying kits, parts and services from vendors. Approved in the Approvals inbox, received into stock."
        actions={
          <>
            <Link href="/purchases/vendors" className="btn-secondary">
              Vendors
            </Link>
            {admin && (
              <Link href="/purchases/payables" className="btn-secondary">
                Payables
              </Link>
            )}
            <Link href="/purchases/new" className="btn-primary">
              New purchase order
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Waiting for approval" value={pending} href="?view=pending" />
        <Stat label="Waiting for goods" value={incoming} href="?view=incoming" />
        <Stat label="Value on order (with GST)" value={formatINR2(openValue._sum.total ?? 0)} href="?view=incoming" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
          <Link
            key={v}
            href={`?${new URLSearchParams({ ...(v !== "open" ? { view: v } : {}), ...(q ? { q } : {}) })}`}
            className={view === v ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
          >
            {VIEWS[v].label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {view !== "open" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={q} placeholder="Search vendor or purpose" className="input w-56 py-1.5" />
          <button className="btn-secondary btn-sm">Search</button>
        </form>
      </div>

      {orders.length === 0 ? (
        <Empty>
          {view === "open" && !q ? (
            <>
              No open purchase orders.{" "}
              <Link href="/purchases/new" className="link">
                Raise one
              </Link>{" "}
              when you need to buy kits, parts or a service.
            </>
          ) : (
            "Nothing matches."
          )}
        </Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Vendor</th>
                <th>For</th>
                {isManagerOrAdmin(user) && <th>Raised by</th>}
                <th>Needed by</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const ordered = o.lines.reduce((n, l) => n + l.quantity, 0);
                const got = o.lines.reduce((n, l) => n + Math.min(l.received, l.quantity), 0);
                const late = (RECEIVABLE_STATUSES as readonly string[]).includes(o.status) && o.expectedBy && o.expectedBy < today;
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/purchases/${o.id}`} className="link font-medium">
                        {poNo(o.number)}
                      </Link>
                      <div className="text-xs text-slate-500">{formatDate(o.createdAt)}</div>
                    </td>
                    <td className="text-sm">
                      <Link href={`/purchases/vendors/${o.vendor.id}`} className="hover:underline">
                        {o.vendor.name}
                      </Link>
                    </td>
                    <td className="max-w-xs text-sm">
                      {o.purpose}
                      {o.project && <div className="text-xs text-slate-500">{o.project.name}</div>}
                    </td>
                    {isManagerOrAdmin(user) && <td className="text-sm">{o.requester.name}</td>}
                    <td className={`text-sm ${late ? "font-medium text-red-600" : ""}`}>{o.expectedBy ? formatDate(o.expectedBy) : "—"}</td>
                    <td className="text-right text-sm">{formatINR2(o.total)}</td>
                    <td>
                      <OrderBadge status={o.status} />
                      {o.status === "PART_RECEIVED" && (
                        <div className="mt-0.5 text-xs text-slate-500">
                          {got} of {ordered} in
                        </div>
                      )}
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
