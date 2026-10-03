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
      <PageHeader title="Settings" subtitle="Company-wide rules for attendance, leave and payroll." />
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
          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="pt-4 font-semibold">Payroll</legend>
            <Field label="Loss of pay per day = monthly gross ÷">
              <input name="lopDivisor" type="number" min={20} max={31} defaultValue={s.lopDivisor} className="input w-24" />
            </Field>
            <div className="space-y-2 text-sm">
              <div className="label">Deductions (switched-off ones are never taken)</div>
              {(
                [
                  ["pfEnabled", "Provident fund (PF): 12% of basic, on basic up to ₹15,000", s.pfEnabled],
                  ["esiEnabled", "ESI: 0.75% of gross, for gross up to ₹21,000", s.esiEnabled],
                  ["ptEnabled", "Professional tax: entered per payslip", s.ptEnabled],
                  ["tdsEnabled", "Income tax (TDS): entered per payslip", s.tdsEnabled],
                ] as const
              ).map(([name, label, checked]) => (
                <label key={name} className="flex items-center gap-2">
                  <input type="checkbox" name={name} defaultChecked={checked} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
