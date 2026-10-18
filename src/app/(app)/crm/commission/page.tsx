import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/time";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { DEFAULT_COMMISSION_RATE, byPerson, commissionRows } from "@/lib/commission";
import { addMonths, monthLabel, monthParam, monthStart, parseMonth } from "@/lib/plan-rules";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { approveStatement, prepareStatement } from "./actions";

export const metadata = { title: "Sales commission" };

export default async function CommissionPage({ searchParams }: PageProps<"/crm/commission">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  // The statement is made by the 5th for the month before, so that month opens first.
  const month = parseMonth(sp.month) ?? addMonths(monthStart(todayIST()), -1);
  const statement = await db.commissionStatement.findUnique({
    where: { month },
    include: {
      lines: { include: { user: { select: { name: true } } }, orderBy: { receivedOn: "asc" } },
      preparedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  const rate = statement ? Number(statement.rate) : DEFAULT_COMMISSION_RATE;
  const live = await commissionRows(month, rate);
  const rows = statement
    ? statement.lines.map((l) => ({
        userId: l.userId,
        userName: l.user.name,
        invoiceNo: l.invoiceNo,
        dealTitle: l.dealTitle,
        school: l.school,
        receivedOn: l.receivedOn,
        received: Number(l.received),
        base: Number(l.base),
        commission: Number(l.commission),
      }))
    : live.rows;
  const people = byPerson(rows);
  const total = rows.reduce((s, r) => s + r.commission, 0);
  const changed = statement?.status === "PREPARED" && live.rows.length !== statement.lines.length;
  const due = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 5));

  return (
    <>
      <PageHeader
        title="Sales commission"
        subtitle={`${rate}% to the sales executive who closed the sale, on money received without GST. Approved by the 5th of the next month.`}
        actions={
          <>
            <Link href={`?month=${monthParam(addMonths(month, -1))}`} className="btn-secondary">
              ← {monthLabel(addMonths(month, -1)).split(" ")[0]}
            </Link>
            <Link href={`?month=${monthParam(addMonths(month, 1))}`} className="btn-secondary">
              {monthLabel(addMonths(month, 1)).split(" ")[0]} →
            </Link>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Commission for ${monthLabel(month)}`} value={formatINR(total)} />
        <Stat label="Payments counted" value={rows.length} />
        <Stat label="Sales executives" value={people.length} />
        <Stat label="Statement due" value={formatDate(due)} />
      </div>

      <section className="card mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Statement for {monthLabel(month)}</h2>
            {statement ? (
              statement.status === "APPROVED" ? <Badge color="green">Approved</Badge> : <Badge color="amber">Waiting for approval</Badge>
            ) : (
              <Badge>Not prepared</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {statement
              ? `Prepared by ${statement.preparedBy.name} on ${formatDateTime(statement.createdAt)}${statement.approvedBy ? `, approved by ${statement.approvedBy.name} on ${formatDateTime(statement.approvedAt)}` : ""}.`
              : "The figures below are worked out live from payments. Prepare the statement to fix them for approval."}
          </p>
          {changed && <p className="mt-1 text-sm text-amber-800">Payments have changed since it was prepared. Prepare it again to include them.</p>}
          {statement?.notes && <p className="mt-1 text-sm">{statement.notes}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {statement?.status !== "APPROVED" && (
            <ActionForm action={prepareStatement} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="month" value={monthParam(month)} />
              <Field label="Rate (%)">
                <input name="rate" defaultValue={rate} className="input w-20" inputMode="decimal" />
              </Field>
              <Field label="Note">
                <input name="notes" defaultValue={statement?.notes ?? ""} className="input w-48" />
              </Field>
              <SubmitButton className={statement ? "btn-secondary" : "btn-primary"}>{statement ? "Prepare again" : "Prepare statement"}</SubmitButton>
            </ActionForm>
          )}
          {statement?.status === "PREPARED" && isAdmin(user) && (
            <form action={approveStatement.bind(null, statement.id)}>
              <ConfirmButton message={`Approve ${formatINR(total)} commission for ${monthLabel(month)}? It can't be changed afterwards.`} className="btn-primary">
                Approve
              </ConfirmButton>
            </form>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-0">
          <h2 className="border-b border-[var(--line)] px-5 py-4 font-semibold">By person</h2>
          {people.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No commission this month.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sales executive</th>
                  <th className="text-right">Base</th>
                  <th className="text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.userId}>
                    <td>
                      {p.name}
                      <div className="text-xs text-slate-500">
                        {p.count} payment{p.count === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="text-right">{formatINR(p.base)}</td>
                    <td className="text-right font-semibold">{formatINR(p.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card overflow-x-auto p-0 lg:col-span-2">
          <h2 className="border-b border-[var(--line)] px-5 py-4 font-semibold">Payments</h2>
          {rows.length === 0 ? (
            <div className="p-5">
              <Empty>No payments on invoices from deals were received in {monthLabel(month)}.</Empty>
            </div>
          ) : (
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Invoice</th>
                  <th>Deal</th>
                  <th>Sales executive</th>
                  <th className="text-right">Received</th>
                  <th className="text-right">Without GST</th>
                  <th className="text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDate(r.receivedOn)}</td>
                    <td>{r.invoiceNo}</td>
                    <td>
                      {r.dealTitle}
                      <div className="text-xs text-slate-500">{r.school}</div>
                    </td>
                    <td>{r.userName}</td>
                    <td className="text-right">{formatINR(r.received)}</td>
                    <td className="text-right">{formatINR(r.base)}</td>
                    <td className="text-right font-medium">{formatINR(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      {!statement && live.unassigned.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-semibold">Payments with no sales executive</h2>
          <p className="mt-1 text-sm text-slate-500">These invoices aren&apos;t linked to a deal with an owner, so they earn no commission. Link the invoice to its deal if that is wrong.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {live.unassigned.map((u, i) => (
              <li key={i}>
                {formatDate(u.receivedOn)} · {u.invoiceNo} · {u.school} · {formatINR(u.received)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
