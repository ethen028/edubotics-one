import { Fragment } from "react";
import { parseSlabs } from "@/lib/payroll";
import { requireUser } from "@/lib/auth";
import { WEEKDAYS, getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import {
  sendTestEmail,
  updateCareersSettings,
  updateCertificateSettings,
  updateGoogleSettings,
  updateMailSettings,
  updateReminderSettings,
  updateSafetySettings,
  updateSettings,
} from "./actions";
import { callbackUrl, googleSetup } from "@/lib/google-sign-in";
import { certificateSignature } from "@/lib/settings";
import { GST_RATES, INDIAN_STATES } from "@/lib/invoices";
import { db } from "@/lib/db";
import { mailSetup } from "@/lib/mail";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui";
import { EmailHistory, emailLogSelect } from "@/components/email";
import { PasswordInput } from "@/components/password-input";

export const metadata = { title: "Settings" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function SettingsPage() {
  const user = await requireUser(["ADMIN"]);
  const s = await getSettings();
  const setup = mailSetup(s);
  const signature = await certificateSignature();
  const googleOn = !!googleSetup(s);
  const [recent, automatic] = await Promise.all([
    db.emailLog.findMany({ select: emailLogSelect, orderBy: { createdAt: "desc" }, take: 15 }),
    db.emailLog.findMany({ where: { automatic: true }, select: emailLogSelect, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Company-wide rules for attendance, leave, payroll, expenses, invoices, email, certificates, the careers page and sign-in." />
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
          <Field label="Notice period when someone resigns (days)">
            <input name="noticePeriodDays" type="number" min={0} max={180} defaultValue={s.noticePeriodDays} className="input w-24" />
            <p className="mt-1 text-xs text-slate-500">The exit page shows any shortfall, which you can recover in the final settlement or let go.</p>
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
                  ["esiEnabled", "ESI: employee and company shares of wages earned, for people within the wage limit (rates below)", s.esiEnabled],
                  ["ptEnabled", "Kerala professional tax: worked out from the half-year slabs below, taken once each half-year", s.ptEnabled],
                  ["tdsEnabled", "Income tax (TDS): entered per payslip", s.tdsEnabled],
                  ["gratuityEnabled", "Gratuity: show the amount the company sets aside each month (never taken from pay)", s.gratuityEnabled],
                ] as const
              ).map(([name, label, checked]) => (
                <label key={name} className="flex items-center gap-2">
                  <input type="checkbox" name={name} defaultChecked={checked} />
                  {label}
                </label>
              ))}
            </div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The ESI, professional tax and gratuity figures below are a best reading of the rules. Check them with your accountant before switching any of these on.
            </p>
            <details className="text-sm" open>
              <summary className="cursor-pointer font-medium">ESI rates</summary>
              <div className="mt-2 flex flex-wrap gap-4">
                <Field label="Employee share, % of wages">
                  <input name="esiEmployeeRate" type="number" min={0} max={10} step="0.01" defaultValue={Number(s.esiEmployeeRate)} className="input w-24" />
                </Field>
                <Field label="Company share, %">
                  <input name="esiEmployerRate" type="number" min={0} max={10} step="0.01" defaultValue={Number(s.esiEmployerRate)} className="input w-24" />
                </Field>
                <Field label="Covered up to gross of ₹ a month">
                  <input name="esiWageLimit" type="number" min={0} max={1000000} defaultValue={s.esiWageLimit} className="input w-28" />
                </Field>
              </div>
            </details>
            <details className="text-sm" open>
              <summary className="cursor-pointer font-medium">Kerala professional tax slabs (per half-year)</summary>
              <p className="mt-1 text-xs text-slate-500">
                Half-years run April–September and October–March. Each line: half-year salary from ₹… pays ₹…. Below the first line, nothing. Clear both boxes to remove a line.
              </p>
              <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
                <div className="label">Half-year salary from ₹</div>
                <div className="label">Tax ₹</div>
                {[...parseSlabs(s.ptSlabs), { from: "", tax: "" }, { from: "", tax: "" }].map((slab, i) => (
                  <Fragment key={i}>
                    <input name="ptSlabFrom" type="number" min={0} defaultValue={slab.from} className="input py-1" aria-label={`Slab ${i + 1} from`} />
                    <input name="ptSlabTax" type="number" min={0} defaultValue={slab.tax} className="input py-1" aria-label={`Slab ${i + 1} tax`} />
                  </Fragment>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <Field label="April–September: take it in">
                  <select name="ptFirstHalfMonth" defaultValue={s.ptFirstHalfMonth} className="input">
                    {[4, 5, 6, 7, 8, 9].map((m) => (
                      <option key={m} value={m}>{MONTHS[m - 1]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="October–March: take it in">
                  <select name="ptSecondHalfMonth" defaultValue={s.ptSecondHalfMonth} className="input">
                    {[10, 11, 12, 1, 2, 3].map((m) => (
                      <option key={m} value={m}>{MONTHS[m - 1]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Not charged under this many days employed in the half-year">
                  <input name="ptMinDays" type="number" min={0} max={183} defaultValue={s.ptMinDays} className="input w-24" />
                </Field>
              </div>
            </details>
            <details className="text-sm" open>
              <summary className="cursor-pointer font-medium">Gratuity</summary>
              <p className="mt-1 text-xs text-slate-500">
                Gratuity is paid on leaving, not taken from pay: monthly basic × days ÷ working days × years of service. The exit page suggests it once the minimum years are served.
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                <Field label="Days' basic per year">
                  <input name="gratuityDays" type="number" min={1} max={60} defaultValue={s.gratuityDays} className="input w-24" />
                </Field>
                <Field label="Working days in a month">
                  <input name="gratuityDivisor" type="number" min={1} max={31} defaultValue={s.gratuityDivisor} className="input w-24" />
                </Field>
                <Field label="Payable after years">
                  <input name="gratuityMinYears" type="number" min={0} max={10} defaultValue={s.gratuityMinYears} className="input w-24" />
                </Field>
                <Field label="Most payable, ₹">
                  <input name="gratuityCap" type="number" min={0} max={100000000} defaultValue={s.gratuityCap} className="input w-32" />
                </Field>
              </div>
            </details>
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
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Field label="Quotes valid for (days)">
                <input name="quoteValidDays" type="number" min={1} max={365} defaultValue={s.quoteValidDays} className="input w-24" />
              </Field>
              <Field label="Starting terms on every new quote">
                <textarea
                  name="quoteTerms"
                  rows={2}
                  defaultValue={s.quoteTerms ?? ""}
                  className="input"
                  placeholder="e.g. 50% advance on confirmation, balance on completion."
                />
              </Field>
            </div>
          </fieldset>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
      </div>

      <section id="email" className="mt-8 grid scroll-mt-6 gap-6 xl:grid-cols-[36rem_1fr]">
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Email</h2>
            {setup === "READY" ? (
              <Badge color="green">On · tested {formatDateTime(s.mailVerifiedAt)}</Badge>
            ) : setup === "UNTESTED" ? (
              <Badge color="amber">Off until a test email goes through</Badge>
            ) : (
              <Badge>Off · not set up</Badge>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Invoices, quotes, payslips, interview invites and payment reminders are sent from the company&apos;s own mail account when
            someone presses Send. Payment reminders can also go out on their own, if switched on below.
          </p>
          <div className="rounded-lg bg-brand-50 p-3 text-xs text-slate-700">
            <strong>Gmail or Google Workspace:</strong> server <code>smtp.gmail.com</code>, port 587, username is the full email address,
            and the password is an <em>app password</em> (Google Account → Security → 2-Step Verification → App passwords), not the normal
            one.
          </div>
          <ActionForm action={updateMailSettings} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field label="Mail server (SMTP)">
                <input name="smtpHost" defaultValue={s.smtpHost ?? ""} className="input" placeholder="smtp.gmail.com" />
              </Field>
              <Field label="Port">
                <select name="smtpPort" defaultValue={s.smtpPort} className="input">
                  <option value={587}>587</option>
                  <option value={465}>465</option>
                  <option value={25}>25</option>
                  {![587, 465, 25].includes(s.smtpPort) && <option value={s.smtpPort}>{s.smtpPort}</option>}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Username">
                <input name="smtpUser" defaultValue={s.smtpUser ?? ""} className="input" autoComplete="off" placeholder="accounts@yourdomain.com" />
              </Field>
              <Field label="Password">
                <PasswordInput
                  name="smtpPassword"
                  className="input"
                  autoComplete="new-password"
                  placeholder={s.smtpPassword ? "Saved. Leave blank to keep it" : "App password"}
                />
              </Field>
              <Field label="Send from (name)">
                <input name="mailFromName" defaultValue={s.mailFromName ?? ""} className="input" placeholder={s.companyName} />
              </Field>
              <Field label="Send from (address)">
                <input name="mailFromAddress" type="email" defaultValue={s.mailFromAddress ?? ""} className="input" />
              </Field>
            </div>
            <Field label="Replies go to (optional)">
              <input name="mailReplyTo" type="email" defaultValue={s.mailReplyTo ?? ""} className="input" placeholder="Same as the send-from address" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="mailBccSelf" defaultChecked={s.mailBccSelf} />
              Keep a copy of every email in the send-from inbox
            </label>
            {s.smtpPassword && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="clearPassword" />
                Remove the saved password
              </label>
            )}
            <SubmitButton>Save email settings</SubmitButton>
          </ActionForm>
          {setup !== "NOT_SET" && (
            <ActionForm action={sendTestEmail} className="space-y-2 border-t border-slate-100 pt-4">
              <Field label="Send a test email to">
                <div className="flex gap-2">
                  <input name="testTo" type="email" required defaultValue={user.email} className="input" />
                  <SubmitButton className="btn-secondary whitespace-nowrap" pendingLabel="Sending…">
                    Send test
                  </SubmitButton>
                </div>
              </Field>
              <p className="text-xs text-slate-500">Sending switches on once a test goes through, and off again if the account details change.</p>
            </ActionForm>
          )}
        </div>
        <div className="min-w-0">
          {recent.length > 0 ? (
            <EmailHistory emails={recent} title="Recently sent" showKind />
          ) : (
            <p className="text-sm text-slate-500">Emails sent from the app will be listed here.</p>
          )}
        </div>
      </section>

      <section id="reminders" className="mt-8 grid scroll-mt-6 gap-6 xl:grid-cols-[36rem_1fr]">
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Automatic payment reminders</h2>
            {!s.autoRemindersEnabled ? (
              <Badge>Off</Badge>
            ) : setup === "READY" ? (
              <Badge color="green">On</Badge>
            ) : (
              <Badge color="amber">On, but waiting for a test email</Badge>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Emails schools the same reminder as the <strong>Send reminder</strong> button on Billing → Payments due, with the overdue
            invoices attached, to the invoice contact (else the school&apos;s email). They go out on working days from 10 AM, never on
            weekly offs or holidays. A school gets at most one email per round, so days when this computer was off never add up to a pile
            of reminders.
          </p>
          <ActionForm action={updateReminderSettings} className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="autoRemindersEnabled" defaultChecked={s.autoRemindersEnabled} />
              Send payment reminders automatically
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="First reminder (days late)">
                <input name="autoReminderAfterDays" type="number" min={1} max={90} defaultValue={s.autoReminderAfterDays} className="input" />
              </Field>
              <Field label="Then every (days)">
                <input name="autoReminderEveryDays" type="number" min={3} max={60} defaultValue={s.autoReminderEveryDays} className="input" />
              </Field>
              <Field label="Most per invoice">
                <input name="autoReminderMaxPerInvoice" type="number" min={1} max={10} defaultValue={s.autoReminderMaxPerInvoice} className="input" />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Reminders sent by hand count towards the gap. After the last automatic reminder an invoice is left for a phone call, and
              Payments due marks it. To stop one school being chased, use <strong>Stop automatic reminders</strong> next to it on Payments
              due.
            </p>
            {s.autoReminderLastRunOn && <p className="text-xs text-slate-500">Last round: {formatDate(s.autoReminderLastRunOn)}.</p>}
            <SubmitButton>Save reminder settings</SubmitButton>
          </ActionForm>
        </div>
        <div className="min-w-0">
          {automatic.length > 0 ? (
            <EmailHistory emails={automatic} title="Automatic reminders sent" />
          ) : (
            <p className="text-sm text-slate-500">Reminders sent automatically will be listed here.</p>
          )}
        </div>
      </section>

      <section id="certificates" className="mt-8 max-w-xl scroll-mt-6">
        <div className="card space-y-4">
          <h2 className="font-semibold">Workshop certificates</h2>
          <p className="text-sm text-slate-600">
            Certificates carry two signatures: the workshop&apos;s first trainer on the left and this person on the right. Upload a scan of their
            signature so emailed certificates arrive signed; without one, there is a blank line to sign by hand.
          </p>
          <ActionForm action={updateCertificateSettings} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Signed by">
                <input name="certSignatoryName" defaultValue={s.certSignatoryName ?? ""} className="input" placeholder="Full name" />
              </Field>
              <Field label="Their title">
                <input name="certSignatoryTitle" defaultValue={s.certSignatoryTitle ?? ""} className="input" placeholder="e.g. Director" />
              </Field>
            </div>
            <Field label="Signature picture (PNG or JPG, under 1 MB)">
              <input type="file" name="signature" accept="image/png,image/jpeg" className="input" />
              <span className="mt-1 block text-xs text-slate-500">Sign in dark ink on white paper and take a close, straight photo. A PNG with a see-through background looks best.</span>
            </Field>
            {signature && (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/admin/settings/signature" alt="Current signature" className="h-14 rounded border border-slate-200 bg-surface p-1" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="removeSignature" /> Remove it
                </label>
              </div>
            )}
            <SubmitButton>Save certificate settings</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section id="careers" className="mt-8 max-w-xl scroll-mt-6">
        <div className="card space-y-4">
          <h2 className="font-semibold">Careers page</h2>
          <p className="text-sm text-slate-600">
            A jobs page at <span className="font-mono text-xs">/careers</span> where candidates apply with their resume. Applications land in
            Recruitment as new candidates. It shows only jobs ticked “Show on the careers page”, and never salaries, staff names or anything
            else inside the app. For now it opens only on the office network; putting it on the internet is a separate step.
          </p>
          <ActionForm action={updateCareersSettings} className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="careersEnabled" defaultChecked={s.careersEnabled} /> Careers page is on
            </label>
            <Field label="Welcome text at the top">
              <textarea
                name="careersIntro"
                rows={3}
                defaultValue={s.careersIntro ?? ""}
                className="input"
                placeholder={`${s.companyName} teaches robotics, coding and STEM to children in schools across Kerala. We are looking for people who enjoy building things and teaching.`}
              />
            </Field>
            <Field label="Email for candidates' questions (optional)">
              <input name="careersContactEmail" type="email" defaultValue={s.careersContactEmail ?? ""} className="input" placeholder="careers@eduboticsglobal.com" />
            </Field>
            <Field label="Delete turned-down applicants after (months)">
              <input name="applicantRetentionMonths" type="number" min={0} max={120} required defaultValue={s.applicantRetentionMonths} className="input max-w-32" />
            </Field>
            <p className="text-xs text-slate-500">
              Applicants marked rejected or withdrawn are deleted, with their resumes, once nothing about them has changed for this long. Hired
              people are never deleted. 0 keeps everyone. Holding personal data only as long as needed is what India&apos;s data protection law asks.
            </p>
            <SubmitButton>Save careers page</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section id="sign-in" className="mt-8 max-w-xl scroll-mt-6">
        <div className="card space-y-4">
          <h2 className="font-semibold">Sign-in safety</h2>
          <p className="text-sm text-slate-600">
            After too many wrong passwords in a row an account is locked for a while, so nobody can keep guessing. An admin can unlock it
            sooner from Users. Passwords need at least 8 characters with a letter and a number, and new or reset passwords are temporary:
            the person picks their own at the next sign-in.
          </p>
          <ActionForm action={updateSafetySettings} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Lock after wrong passwords">
                <input name="loginMaxAttempts" type="number" min={3} max={20} defaultValue={s.loginMaxAttempts} className="input" />
              </Field>
              <Field label="Locked for (minutes)">
                <input name="loginLockMinutes" type="number" min={1} max={1440} defaultValue={s.loginLockMinutes} className="input" />
              </Field>
              <Field label="Sign out after unused (hours)">
                <input name="sessionIdleHours" type="number" min={1} max={168} defaultValue={s.sessionIdleHours} className="input" />
              </Field>
            </div>
            <p className="text-xs text-slate-500">Everyone also signs in again at least once a week. Sensitive actions are kept in Admin → Activity log.</p>
            <SubmitButton>Save sign-in safety</SubmitButton>
          </ActionForm>
        </div>
      </section>

      <section id="google" className="mt-8 max-w-xl scroll-mt-6">
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Google sign-in</h2>
            {googleOn ? <Badge color="green">On</Badge> : <Badge>Off</Badge>}
          </div>
          <p className="text-sm text-slate-600">
            Adds &ldquo;Sign in with Google&rdquo; to the sign-in page, for people whose Google email matches their login here. Password
            sign-in keeps working. Google only sends people back to an <strong>https://</strong> address, so this needs the app on a web
            address first (the office Wi-Fi address won&apos;t do). Step-by-step setup is in <span className="font-mono text-xs">docs/google-sign-in.md</span>.
          </p>
          <ActionForm action={updateGoogleSettings} className="space-y-3">
            <Field label="App address" className="block">
              <input name="appAddress" defaultValue={s.appAddress ?? ""} className="input" placeholder="https://orbit.eduboticsglobal.com" />
            </Field>
            {s.appAddress && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                In Google Cloud, add this as an authorised redirect URI:
                <div className="mt-1 font-mono text-slate-900 select-all">{callbackUrl(s.appAddress)}</div>
              </div>
            )}
            <Field label="Client ID" className="block">
              <input name="googleClientId" defaultValue={s.googleClientId ?? ""} className="input" placeholder="1234567890-abc.apps.googleusercontent.com" />
            </Field>
            <Field label="Client secret" className="block">
              <PasswordInput
                name="googleClientSecret"
                autoComplete="off"
                className="input"
                placeholder={s.googleClientSecret ? "Saved. Type a new one to replace it." : "GOCSPX-…"}
              />
            </Field>
            <Field label="Only allow Google accounts on this domain (optional)" className="block">
              <input name="googleDomain" defaultValue={s.googleDomain ?? ""} className="input" placeholder="eduboticsglobal.com" />
              <span className="mt-1 block text-xs text-slate-500">Leave blank to allow any Google account (including gmail.com) whose email has a login here.</span>
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="googleEnabled" defaultChecked={s.googleEnabled} /> Google sign-in is on
            </label>
            <SubmitButton>Save Google sign-in</SubmitButton>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
