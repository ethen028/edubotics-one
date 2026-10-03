import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { monthLabel, monthlyGross } from "@/lib/payroll";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";

export const metadata = { title: "My payslips" };

export default async function MyPayslipsPage() {
  const user = await requireUser();
  if (!user.employee) {
    return (
      <>
        <PageHeader title="My payslips" />
        <Empty>Your login isn&apos;t linked to an employee record yet.</Empty>
      </>
    );
  }
  const [slips, salary] = await Promise.all([
    db.payslip.findMany({
      where: { employeeId: user.employee.id, run: { status: { not: "DRAFT" } } },
      include: { run: true },
      orderBy: { run: { month: "desc" } },
    }),
    db.salaryStructure.findFirst({ where: { employeeId: user.employee.id }, orderBy: { effectiveFrom: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title="My payslips" />
      {salary && (
        <div className="card mb-6 max-w-xl text-sm">
          <h2 className="mb-2 font-semibold">Current monthly salary</h2>
          <div className="grid grid-cols-2 gap-y-1">
            <span className="text-slate-500">Basic</span>
            <span>{formatINR(salary.basic)}</span>
            <span className="text-slate-500">HRA</span>
            <span>{formatINR(salary.hra)}</span>
            <span className="text-slate-500">Special allowance</span>
            <span>{formatINR(salary.specialAllowance)}</span>
            <span className="font-semibold">Gross</span>
            <span className="font-semibold">
              {formatINR(monthlyGross({ basic: Number(salary.basic), hra: Number(salary.hra), specialAllowance: Number(salary.specialAllowance) }))}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Effective from {formatDate(salary.effectiveFrom)}</p>
        </div>
      )}
      {slips.length === 0 ? (
        <Empty>No payslips yet.</Empty>
      ) : (
        <div className="card max-w-xl p-0">
          <table className="table">
            <tbody>
              {slips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/payroll/payslip/${p.id}`} className="link">
                      {monthLabel(p.run.month)}
                    </Link>
                  </td>
                  <td className="text-right font-semibold">{formatINR(p.net)}</td>
                  <td>{p.run.status === "PAID" ? <Badge color="green">Paid</Badge> : <Badge color="blue">Processing</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
