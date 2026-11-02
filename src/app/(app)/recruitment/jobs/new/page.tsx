import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { JobForm } from "../../forms";
import { createJob } from "../../actions";

export const metadata = { title: "New job opening" };

export default async function NewJobPage() {
  await requireUser(["ADMIN", "HR", "MANAGER"]);
  const [departments, users] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="New job opening"
        actions={
          <Link href="/recruitment" className="btn-secondary">
            Back
          </Link>
        }
      />
      <div className="max-w-3xl">
        <JobForm action={createJob} departments={departments} users={users} />
      </div>
    </>
  );
}
