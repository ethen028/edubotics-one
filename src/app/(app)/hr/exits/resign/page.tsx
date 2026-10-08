import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { formatDate, toDateInput } from "@/lib/format";
import { fullNoticeLastDay } from "@/lib/exit-math";
import { openExitOf } from "@/lib/exits";
import { submitResignation } from "../actions";

export const metadata = { title: "Resign" };

export default async function ResignPage() {
  const user = await requireUser();
  if (!user.employee) redirect("/");
  const open = await openExitOf(user.employee.id);
  if (open) redirect(`/hr/exits/${open.id}`);
  const settings = await getSettings();
  const today = todayIST();
  const fullNotice = fullNoticeLastDay(today, settings.noticePeriodDays);

  return (
    <>
      <PageHeader
        title="Resign"
        subtitle="Your manager gets this in Approvals and agrees your last working day with you. You can take it back until it is accepted."
        actions={
          <Link href={`/hr/employees/${user.employee.id}`} className="btn-secondary">
            Back to my profile
          </Link>
        }
      />
      <ActionForm action={submitResignation} className="card max-w-xl space-y-4">
        <p className="text-sm text-slate-600">
          The notice period is {settings.noticePeriodDays} days. Resigning today, a full notice ends on {formatDate(fullNotice)}. If you ask for an
          earlier day, the company may ask you to work the full notice or adjust it in your final settlement.
        </p>
        <Field label="Last working day you are asking for">
          <input name="proposedLastDay" type="date" required min={toDateInput(today)} defaultValue={toDateInput(fullNotice)} className="input" />
        </Field>
        <Field label="Reason (optional, seen by your manager and admins)">
          <textarea name="reason" rows={4} maxLength={2000} className="input" />
        </Field>
        <SubmitButton pendingLabel="Sending…">Send my resignation</SubmitButton>
      </ActionForm>
    </>
  );
}
