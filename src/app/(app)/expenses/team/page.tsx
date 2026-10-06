import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { managedEmployees } from "@/lib/team";
import { readTeamFilter, teamClaimsWhere } from "@/lib/expense-data";
import { CATEGORY_LABEL, CLAIM_LABEL, payableOf } from "@/lib/expenses";
import { istDate } from "@/lib/attendance";
import { monthLabel } from "@/lib/payroll";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR, toDateInput } from "@/lib/format";
import { markClaimPaid } from "../actions";
import { ClaimAmount, ClaimState, ClaimWhat, claimInclude } from "../ui";

export const metadata = { title: "Team expenses" };

export default async function TeamExpensesPage({ searchParams }: PageProps<"/expenses/team">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const admin = isAdmin(user);
  const today = istDate(new Date());
  const thisMonth = toDateInput(today).slice(0, 7);
  const filter = readTeamFilter(await searchParams, thisMonth);

  const [claims, people] = await Promise.all([
    db.expenseClaim.findMany({
      where: teamClaimsWhere(user, filter),
      include: { ...claimInclude, employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    managedEmployees(user),
  ]);

  const sum = (list: typeof claims) => list.reduce((s, c) => s + payableOf(c), 0);
  const counted = claims.filter((c) => c.status !== "REJECTED");
  const byPerson = new Map<string, { name: string; total: number; count: number }>();
  const byCategory = new Map<string, number>();
  for (const c of counted) {
    const name = `${c.employee.firstName} ${c.employee.lastName}`.trim();
    const p = byPerson.get(c.employee.id) ?? { name, total: 0, count: 0 };
    p.total += payableOf(c);
    p.count += 1;
    byPerson.set(c.employee.id, p);
    byCategory.set(CATEGORY_LABEL[c.category], (byCategory.get(CATEGORY_LABEL[c.category]) ?? 0) + payableOf(c));
  }
  const query = new URLSearchParams({ month: filter.month, status: filter.status, person: filter.employeeId }).toString();

  return (
    <>
      <PageHeader
        title="Team expenses"
        subtitle={`${filter.month === "all" ? "All months" : monthLabel(filter.month)} · ${admin ? "everyone" : "your direct reports"}`}
        actions={
          <>
            <a href={`/expenses/team/export?${query}`} className="btn-secondary">
              Download CSV
            </a>
            <Link href="/expenses" className="btn-secondary">
              My expenses
            </Link>
          </>
        }
      />

      <form className="mb-6 flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Month</span>
          <input type="month" name="month" defaultValue={filter.month === "all" ? "" : filter.month} className="input w-auto" />
        </label>
        <label>
          <span className="label">Status</span>
          <select name="status" defaultValue={filter.status} className="input w-auto">
            <option value="">Any</option>
            {Object.entries(CLAIM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Person</span>
          <select name="person" defaultValue={filter.employeeId} className="input w-auto">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary">Show</button>
        <Link href={`/expenses/team?month=all&status=APPROVED`} className="btn-secondary">
          All approved, not yet paid
        </Link>
      </form>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Waiting for approval" value={formatINR(sum(claims.filter((c) => c.status === "SUBMITTED")))} />
        <Stat label="Approved, to be paid" value={formatINR(sum(claims.filter((c) => c.status === "APPROVED")))} />
        <Stat label="Paid" value={formatINR(sum(claims.filter((c) => c.status === "PAID")))} />
      </div>

      {claims.length === 0 ? (
        <Empty>No claims for this selection.</Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">By person</h2>
              <table className="table">
                <tbody>
                  {[...byPerson.values()]
                    .sort((a, b) => b.total - a.total)
                    .map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="text-right text-slate-500">
                          {p.count} claim{p.count === 1 ? "" : "s"}
                        </td>
                        <td className="text-right font-medium">{formatINR(p.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
            <section className="card">
              <h2 className="mb-2 font-semibold">By category</h2>
              <table className="table">
                <tbody>
                  {[...byCategory.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="text-right font-medium">{formatINR(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">Rejected claims aren&apos;t counted.</p>
            </section>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Date</th>
                  <th>What for</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="whitespace-nowrap">
                      {c.employee.firstName} {c.employee.lastName}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(c.date)}</td>
                    <td>
                      <ClaimWhat c={c} />
                    </td>
                    <td>
                      <ClaimAmount c={c} />
                    </td>
                    <td>
                      <ClaimState c={c} />
                      {c.status === "SUBMITTED" && (
                        <Link href="/approvals" className="link mt-1 block text-xs">
                          Decide in Approvals
                        </Link>
                      )}
                      {admin && c.status === "APPROVED" && !c.payslip && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-brand-700">Paid separately?</summary>
                          <form action={markClaimPaid.bind(null, c.id)} className="mt-2 flex flex-col gap-1.5">
                            <input type="date" name="paidOn" required defaultValue={toDateInput(today)} className="input py-1" />
                            <input name="paidNote" placeholder="How, e.g. UPI or cash" className="input py-1" />
                            <button className="btn-primary btn-sm">Mark paid</button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
