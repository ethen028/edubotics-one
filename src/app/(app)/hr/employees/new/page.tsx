import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "../../employee-form";
import { createEmployee } from "../../actions";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireUser(["ADMIN"]);
  const [departments, managers, count] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: { firstName: "asc" } }),
    db.employee.count(),
  ]);
  return (
    <>
      <PageHeader title="Add employee" />
      <EmployeeForm
        action={createEmployee}
        departments={departments}
        managers={managers}
        withLogin
        suggestedCode={`EBG-${String(count + 1).padStart(3, "0")}`}
      />
    </>
  );
}
