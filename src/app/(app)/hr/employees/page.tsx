import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";

export const metadata = { title: "People" };

export default async function EmployeesPage({ searchParams }: PageProps<"/hr/employees">) {
  const user = await requireUser();
  const { q = "", dept = "", status = "ACTIVE" } = (await searchParams) as Record<string, string | undefined>;

  const where: Prisma.EmployeeWhereInput = {
    ...(status !== "ALL" ? { status: status as Prisma.EnumEmployeeStatusFilter["equals"] } : {}),
    ...(dept ? { departmentId: dept } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { designation: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [employees, departments] = await Promise.all([
    db.employee.findMany({
      where,
      include: { department: true, manager: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${employees.length} ${employees.length === 1 ? "person" : "people"}`}
        actions={
          isAdmin(user) && (
            <Link href="/hr/employees/new" className="btn-primary">
              Add employee
            </Link>
          )
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, role or code" className="input max-w-xs" />
        <select name="dept" defaultValue={dept} className="input w-auto">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="ACTIVE">Active</option>
          <option value="ON_NOTICE">On notice</option>
          <option value="EXITED">Exited</option>
          <option value="ALL">All</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {employees.length === 0 ? (
        <Empty>No one matches. {isAdmin(user) && "Add your first employee to get started."}</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Reports to</th>
                <th>Joined</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/hr/employees/${e.id}`} className="link">
                      {e.firstName} {e.lastName}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {e.code} {e.status !== "ACTIVE" && <Badge color={e.status === "EXITED" ? "red" : "amber"}>{humanize(e.status)}</Badge>}
                    </div>
                  </td>
                  <td>
                    {e.designation}
                    <div className="text-xs text-slate-500">{humanize(e.employmentType)}</div>
                  </td>
                  <td>{e.department?.name ?? "—"}</td>
                  <td>{e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"}</td>
                  <td>{formatDate(e.dateOfJoining)}</td>
                  <td className="text-xs">
                    <div>{e.workEmail}</div>
                    <div className="text-slate-500">{e.phone}</div>
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
