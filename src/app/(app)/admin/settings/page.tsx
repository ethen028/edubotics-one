import { requireUser } from "@/lib/auth";
import { WEEKDAYS, getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { updateSettings } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Company-wide rules for attendance and leave." />
      <div className="card max-w-xl">
        <ActionForm action={updateSettings} className="space-y-4">
          <Field label="Working time per day">
            <div className="flex items-center gap-2">
              <input name="hours" type="number" min={1} max={16} defaultValue={Math.floor(s.workMinutesPerDay / 60)} className="input w-20" />
              <span className="text-sm">hours</span>
              <input name="minutes" type="number" min={0} max={59} defaultValue={s.workMinutesPerDay % 60} className="input w-20" />
              <span className="text-sm">minutes</span>
            </div>
          </Field>
          <Field label="Count as OD (overtime) after this many extra minutes">
            <input name="overtimeAfterMins" type="number" min={0} max={600} defaultValue={s.overtimeAfterMins} className="input w-28" />
          </Field>
          <Field label="Weekly off days">
            <div className="flex flex-wrap gap-3 text-sm">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input type="checkbox" name="weeklyOffDays" value={i} defaultChecked={s.weeklyOffDays.includes(i)} />
                  {d}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Weekly offs aren&apos;t counted as leave days or absences.</p>
          </Field>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
