import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { toDateInput } from "@/lib/format";
import { EXIT_KIND_LABEL, fullNoticeLastDay } from "@/lib/exit-math";
import { startExit } from "../actions";

export const metadata = { title: "Record an exit" };

export default async function NewExitPage({ searchParams }: PageProps<"/hr/exits/new">) {
  const user = await requireUser(["ADMIN"]);
  const { employee } = (await searchParams) as Record<string, string | undefined>;
  const [people, settings] = await Promise.all([
    db.employee.findMany({
      where: {
        status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] },
        id: { not: user.employee?.id ?? "__none__" },
        exits: { none: { stage: { in: ["REQUESTED", "ON_NOTICE"] } } },
      },
      select: { id: true, firstName: true, lastName: true, designation: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    getSettings(),
  ]);
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Record an exit"
        subtitle="For a resignation handed in on paper or by email, or when the company ends someone's employment. It starts accepted, with the leaving checklist."
        actions={
          <Link href="/hr/exits" className="btn-secondary">
            Back
          </Link>
        }
      />
      <ActionForm action={startExit} className="card max-w-xl space-y-4">
        <Field label="Person">
          <select name="employeeId" required defaultValue={employee ?? ""} className="input">
            <option value="" disabled>
              Choose…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName} · {p.designation}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why they are leaving">
          <select name="kind" defaultValue="RESIGNATION" className="input">
            {Object.entries(EXIT_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notice given on">
            <input name="noticeGivenOn" type="date" required defaultValue={toDateInput(today)} className="input" />
          </Field>
          <Field label="Last working day">
            <input
              name="lastWorkingDay"
              type="date"
              required
              defaultValue={toDateInput(fullNoticeLastDay(today, settings.noticePeriodDays))}
              className="input"
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Notice period is {settings.noticePeriodDays} days (Admin → Settings). A shorter notice shows up on the settlement, where you can recover
          it or let it go.
        </p>
        <Field label="Note (optional)">
          <textarea name="reason" rows={3} maxLength={2000} className="input" placeholder="e.g. Resignation letter received by email" />
        </Field>
        <SubmitButton>Start the exit</SubmitButton>
      </ActionForm>
    </>
  );
}
