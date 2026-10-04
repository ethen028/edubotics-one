import Link from "next/link";
import type { Prisma, StockRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { OPEN_REQUEST_STATUSES, outstanding, requestNo, requestScope } from "@/lib/inventory";
import { RequestBadge } from "../ui";

export const metadata = { title: "Inventory requests" };

const FILTERS = [
  ["open", "Open"],
  ["PENDING", "Waiting for approval"],
  ["APPROVED", "To issue"],
  ["ISSUED", "Items out"],
  ["done", "Closed"],
] as const;

export default async function RequestsPage({ searchParams }: PageProps<"/inventory/requests">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const filter = FILTERS.find(([k]) => k === sp.status)?.[0] ?? "open";
  const mineOnly = sp.mine === "1";
  const today = todayIST();

  const status: Prisma.StockRequestWhereInput =
    filter === "open"
      ? { status: { in: [...OPEN_REQUEST_STATUSES] } }
      : filter === "done"
        ? { status: { in: ["CLOSED", "REJECTED", "CANCELLED"] } }
        : { status: filter as StockRequestStatus };
  const requests = await db.stockRequest.findMany({
    where: { ...requestScope(user), ...status, ...(mineOnly ? { requesterId: user.id } : {}) },
    include: {
      requester: { select: { name: true } },
      project: { select: { id: true, name: true } },
      lines: { include: { item: { select: { name: true, unit: true, returnable: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: filter === "done" ? 100 : undefined,
  });

  const href = (s: string, mine = mineOnly) => `?${new URLSearchParams({ status: s, ...(mine ? { mine: "1" } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Inventory requests"
        subtitle={isAdmin(user) ? "Everyone's requests" : user.role === "MANAGER" ? "Yours and your team's" : "Your requests"}
        actions={
          <>
            <Link href="/inventory" className="btn-secondary">
              Stock
            </Link>
            <Link href="/inventory/requests/new" className="btn-primary">
              Request items
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={href(k)} className={filter === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
            {label}
          </Link>
        ))}
        {user.role !== "EMPLOYEE" && (
          <Link href={href(filter, !mineOnly)} className="btn-secondary btn-sm ml-auto">
            {mineOnly ? "Show everyone's" : "Only mine"}
          </Link>
        )}
      </div>

      {requests.length === 0 ? (
        <Empty>No requests here.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Items</th>
                <th>For</th>
                <th>Dates</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const out = r.lines.reduce((n, l) => n + outstanding(l), 0);
                const late = r.status === "ISSUED" && r.returnBy && r.returnBy < today;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/inventory/requests/${r.id}`} className="link font-medium">
                        {requestNo(r.number)}
                      </Link>
                      <div className="text-xs text-slate-500">{r.requester.name}</div>
                    </td>
                    <td className="max-w-xs text-sm">{r.lines.map((l) => `${l.quantity} × ${l.item.name}`).join(", ")}</td>
                    <td className="text-sm">
                      {r.project ? (
                        <Link href={`/projects/${r.project.id}`} className="link">
                          {r.project.name}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{r.purpose}</span>
                      )}
                    </td>
                    <td className="text-xs whitespace-nowrap text-slate-600">
                      {r.neededBy && <div>Needed {formatDate(r.neededBy)}</div>}
                      {r.returnBy && <div className={late ? "font-medium text-red-600" : ""}>Back by {formatDate(r.returnBy)}</div>}
                    </td>
                    <td>
                      <RequestBadge status={r.status} />
                      {r.status === "ISSUED" && <div className="mt-1 text-xs text-slate-500">{out} still out</div>}
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
