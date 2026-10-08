import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { createCycle } from "../../actions";
import { CycleFields, PeoplePicker } from "../../ui";

export const metadata = { title: "New review cycle" };

export default async function NewCyclePage() {
  await requireUser(["ADMIN"]);
  const people = await db.employee.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] } },
    select: { id: true, firstName: true, lastName: true, designation: true, manager: { select: { firstName: true, lastName: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  // Default to the current financial year, April to March.
  const today = todayIST();
  const fy = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const label = `${fy}-${String(fy + 1).slice(2)}`;

  return (
    <>
      <PageHeader
        title="New review cycle"
        subtitle="Everyone ticked gets a review. They write their goals, their manager agrees them, then you open reviews for the self review and the manager's rating."
        actions={
          <Link href="/hr/reviews" className="btn-secondary">
            Back
          </Link>
        }
      />
      <ActionForm action={createCycle} className="max-w-3xl space-y-4">
        <div className="card">
          <CycleFields
            values={{
              name: `${label} yearly review`,
              kind: "ANNUAL",
              periodStart: new Date(Date.UTC(fy, 3, 1)),
              periodEnd: new Date(Date.UTC(fy + 1, 2, 31)),
              goalsDue: null,
              selfDue: null,
              managerDue: null,
            }}
          />
        </div>
        <div className="card text-sm">
          <h2 className="mb-1 font-semibold">Who is reviewed</h2>
          <p className="mb-3 text-xs text-slate-500">
            Each person&apos;s manager reviews them. People with no manager, or whose manager has no login, are reviewed by an admin.
            You can change the reviewer later.
          </p>
          <PeoplePicker people={people} ticked={(p) => !!p.manager} />
        </div>
        <SubmitButton>Start review cycle</SubmitButton>
      </ActionForm>
    </>
  );
}
