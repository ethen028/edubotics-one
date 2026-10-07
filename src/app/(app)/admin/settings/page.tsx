import { requireUser } from "@/lib/auth";
import { WEEKDAYS, getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { updateSettings } from "./actions";
import { GST_RATES, INDIAN_STATES } from "@/lib/invoices";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Company-wide rules for attendance, leave, payroll, expenses and invoices." />
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
          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="pt-4 font-semibold">Expense claims</legend>
            <p className="text-sm text-slate-500">
              Travel in your own vehicle is paid per km. Leave a rate at 0 to have people enter the amount themselves.
            </p>
            <div className="flex flex-wrap gap-4">
              <Field label="Two-wheeler, ₹ per km">
                <input name="twoWheelerRatePerKm" type="number" min={0} max={100} step="0.25" defaultValue={Number(s.twoWheelerRatePerKm)} className="input w-28" />
              </Field>
              <Field label="Car, ₹ per km">
                <input name="carRatePerKm" type="number" min={0} max={100} step="0.25" defaultValue={Number(s.carRatePerKm)} className="input w-28" />
              </Field>
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <legend className="pt-4 font-semibold">Invoices</legend>
            <p className="text-xs text-slate-500">Printed at the top and bottom of every invoice.</p>
            <Field label="Company name">
              <input name="companyName" required defaultValue={s.companyName} className="input" />
            </Field>
            <Field label="Address">
              <textarea name="companyAddress" rows={2} required defaultValue={s.companyAddress} className="input" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="State (GST registration)">
                <select name="companyState" defaultValue={s.companyState} className="input">
                  {INDIAN_STATES.map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
              </Field>
              <Field label="Phone">
                <input name="companyPhone" defaultValue={s.companyPhone ?? ""} className="input" />
              </Field>
              <Field label="Email">
                <input name="companyEmail" type="email" defaultValue={s.companyEmail ?? ""} className="input" />
              </Field>
              <Field label="PAN">
                <input name="pan" defaultValue={s.pan ?? ""} maxLength={10} className="input uppercase" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="gstEnabled" defaultChecked={s.gstEnabled} />
              Charge GST on invoices (switch off if Edubotics isn&apos;t GST registered)
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="GSTIN">
                <input name="gstin" defaultValue={s.gstin ?? ""} maxLength={15} className="input uppercase" />
              </Field>
              <Field label="Default GST rate">
                <select name="defaultGstRate" defaultValue={s.defaultGstRate} className="input">
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default SAC / HSN">
                <input name="defaultSac" defaultValue={s.defaultSac ?? ""} className="input" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Invoice number prefix">
                <input name="invoicePrefix" required defaultValue={s.invoicePrefix} maxLength={6} className="input uppercase" />
                <p className="mt-1 text-xs text-slate-500">Numbers look like {s.invoicePrefix}/26-27/001 and restart each April.</p>
              </Field>
              <Field label="Payment due after (days)">
                <input name="paymentTermsDays" type="number" min={0} max={180} defaultValue={s.paymentTermsDays} className="input w-24" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bank">
                <input name="bankName" defaultValue={s.bankName ?? ""} className="input" />
              </Field>
              <Field label="Account name">
                <input name="bankAccountName" defaultValue={s.bankAccountName ?? ""} className="input" />
              </Field>
              <Field label="Account number">
                <input name="bankAccountNo" defaultValue={s.bankAccountNo ?? ""} className="input" />
              </Field>
              <Field label="IFSC">
                <input name="bankIfsc" defaultValue={s.bankIfsc ?? ""} maxLength={11} className="input uppercase" />
              </Field>
              <Field label="UPI ID">
                <input name="upiId" defaultValue={s.upiId ?? ""} className="input" />
              </Field>
            </div>
            <Field label="Note at the bottom of every invoice">
              <textarea name="invoiceNote" rows={2} defaultValue={s.invoiceNote ?? ""} className="input" />
            </Field>
          </fieldset>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
