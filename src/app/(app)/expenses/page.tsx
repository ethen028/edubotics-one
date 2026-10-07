import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { projectScope } from "@/lib/projects";
import { payableOf } from "@/lib/expenses";
import { todayIST } from "@/lib/time";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatINR, toDateInput } from "@/lib/format";
import { withdrawClaim } from "./actions";
import { ClaimForm } from "./claim-form";
import { ClaimAmount, ClaimState, ClaimWhat, claimInclude } from "./ui";

export const metadata = { title: "My expenses" };

export default async function MyExpensesPage() {
  const user = await requireUser();
  const teamLink = isManagerOrAdmin(user) && (
    <Link href="/expenses/team" className="btn-secondary">
      Team expenses
    </Link>
  );
  if (!user.employee) {
    return (
      <>
        <PageHeader title="My expenses" actions={teamLink} />
        <Empty>Expense claims need an employee record linked to your login. Ask an admin to link one under People.</Empty>
      </>
    );
  }

  const today = todayIST();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const [claims, settings, projects, organizations] = await Promise.all([
    db.expenseClaim.findMany({
      where: { employeeId: user.employee.id },
      include: claimInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    getSettings(),
    db.project.findMany({
      where: { ...projectScope(user), stage: { not: "COMPLETE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const sum = (list: typeof claims) => list.reduce((s, c) => s + payableOf(c), 0);
  const waiting = claims.filter((c) => c.status === "SUBMITTED");
  const toBePaid = claims.filter((c) => c.status === "APPROVED");
  const paidThisYear = claims.filter((c) => c.status === "PAID" && c.paidOn && c.paidOn >= yearStart);

  return (
    <>
      <PageHeader
        title="My expenses"
        subtitle="Claim back travel and other money you spend for work. Approved claims are paid with your next salary."
        actions={teamLink}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={`Waiting for approval (${waiting.length})`} value={formatINR(sum(waiting))} />
        <Stat label={`Approved, to be paid (${toBePaid.length})`} value={formatINR(sum(toBePaid))} />
        <Stat label={`Paid in ${today.getUTCFullYear()}`} value={formatINR(sum(paidThisYear))} />
      </div>

      <section className="card mb-6 max-w-3xl">
        <h2 className="mb-3 font-semibold">New claim</h2>
        <ClaimForm
          today={toDateInput(today)}
          rates={{ TWO_WHEELER: Number(settings.twoWheelerRatePerKm), CAR: Number(settings.carRatePerKm) }}
          projects={projects}
          organizations={organizations}
        />
      </section>

      <h2 className="mb-3 font-semibold">My claims</h2>
      {claims.length === 0 ? (
        <Empty>No claims yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>What for</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="whitespace-nowrap">{formatDate(c.date)}</td>
                  <td>
                    <ClaimWhat c={c} />
                  </td>
                  <td>
                    <ClaimAmount c={c} />
                  </td>
                  <td>
                    <ClaimState c={c} />
                  </td>
                  <td>
                    {(c.status === "SUBMITTED" || c.status === "REJECTED") && (
                      <form action={withdrawClaim.bind(null, c.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">
                          {c.status === "SUBMITTED" ? "Withdraw" : "Remove"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
