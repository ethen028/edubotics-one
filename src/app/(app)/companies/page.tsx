import { rawDb } from "@/lib/db";
import { requireSuperadmin } from "@/lib/auth";
import { allCompanies, currentCompanyId } from "@/lib/company";
import { financialYear, INDIAN_STATES } from "@/lib/invoices";
import { formatDateTime, formatINR } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { createCompany, renameCompany, switchCompany } from "./actions";

export const metadata = { title: "Companies" };

/** Headline numbers and the latest activity log lines of one company, read across the group. */
async function overview(companyId: string) {
  const fy = financialYear(todayIST());
  const [people, logins, openLeads, openDeals, invoiced, activity] = await Promise.all([
    rawDb.employee.count({ where: { companyId, status: { not: "EXITED" } } }),
    rawDb.user.count({ where: { companyId, active: true, closedAt: null } }),
    rawDb.lead.count({ where: { companyId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    rawDb.deal.count({ where: { companyId, stage: { notIn: ["WON", "LOST"] } } }),
    rawDb.invoice.aggregate({ where: { companyId, fy, status: "ISSUED" }, _sum: { total: true } }),
    rawDb.activityLog.findMany({ where: { companyId }, orderBy: { at: "desc" }, take: 5, include: { user: { select: { name: true } } } }),
  ]);
  return { fy, people, logins, openLeads, openDeals, invoiced: invoiced._sum.total ?? 0, activity };
}

function OpenButton({ companyId, next, children, primary }: { companyId: string; next: string; children: string; primary?: boolean }) {
  return (
    <form action={switchCompany}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="next" value={next} />
      <button className={primary ? "btn-primary" : "btn-secondary"}>{children}</button>
    </form>
  );
}

export default async function CompaniesPage() {
  const me = await requireSuperadmin();
  const [companies, here] = await Promise.all([allCompanies(), currentCompanyId()]);
  const facts = await Promise.all(companies.map((c) => overview(c.id)));

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Every company in your group. Open one to work in it with the owner's view; its staff only ever see their own company."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {companies.map((c, i) => {
          const f = facts[i];
          return (
            <section key={c.id} className="card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.id === here && <Badge color="green">Open now</Badge>}
                    {c.id === me.companyId && <Badge color="blue">Your own company</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.id !== here && <OpenButton companyId={c.id} next="/" primary>Open</OpenButton>}
                  <OpenButton companyId={c.id} next="/admin/activity">Activity log</OpenButton>
                  <OpenButton companyId={c.id} next="/admin/settings">Settings</OpenButton>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">People</dt><dd className="text-lg font-semibold">{f.people}</dd></div>
                <div><dt className="text-xs text-slate-500">Logins</dt><dd className="text-lg font-semibold">{f.logins}</dd></div>
                <div><dt className="text-xs text-slate-500">Open leads and deals</dt><dd className="text-lg font-semibold">{f.openLeads + f.openDeals}</dd></div>
                <div><dt className="text-xs text-slate-500">Invoiced {f.fy}</dt><dd className="text-lg font-semibold">{formatINR(f.invoiced)}</dd></div>
              </dl>
              <div>
                <h3 className="mb-1.5 text-sm font-medium">Latest activity</h3>
                {f.activity.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing logged yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {f.activity.map((a) => (
                      <li key={a.id} className="flex flex-wrap gap-x-2">
                        <span className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(a.at)}</span>
                        <span className="min-w-0 [overflow-wrap:anywhere]">{a.summary}{a.user ? ` · ${a.user.name}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <details>
                <summary className="link cursor-pointer text-sm">Rename</summary>
                <ActionForm action={renameCompany.bind(null, c.id)} className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Name in the company list" className="min-w-0 flex-1">
                    <input name="name" required defaultValue={c.name} maxLength={120} className="input" />
                  </Field>
                  <SubmitButton className="btn-secondary">Save name</SubmitButton>
                </ActionForm>
              </details>
            </section>
          );
        })}
      </div>

      <ActionForm action={createCompany} className="card mt-6 space-y-4" draft="new-company">
        <div>
          <h2 className="font-semibold">Add a company</h2>
          <p className="mt-1 text-sm text-slate-500">
            It starts empty, with the usual departments, leave types, Kerala holidays and training modules. Its GSTIN, bank details,
            signatories and email are filled in under its own Settings once you open it.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input name="name" required maxLength={120} className="input" placeholder="Edubotics Kids" /></Field>
          <Field label="Name on invoices and letters (if different)"><input name="legalName" maxLength={120} className="input" placeholder="Edubotics Kids Pvt Ltd" /></Field>
          <Field label="Address" className="sm:col-span-2"><input name="address" maxLength={400} className="input" /></Field>
          <Field label="State (decides CGST + SGST or IGST)">
            <select name="state" defaultValue="Kerala" className="input">
              {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Document prefix">
            <input name="prefix" required maxLength={6} className="input uppercase" placeholder="EBK" />
            <span className="mt-1 block text-xs text-slate-500">Its invoices read EBK/26-27/001 and restart each April. Each company needs its own.</span>
          </Field>
        </div>
        <div>
          <h3 className="text-sm font-medium">First admin (optional)</h3>
          <p className="mt-0.5 text-xs text-slate-500">They become this company&apos;s owner and choose their own password when they first sign in.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><input name="adminName" maxLength={120} className="input" /></Field>
          <Field label="Work email"><input name="adminEmail" type="email" maxLength={254} className="input" /></Field>
          <Field label="Temporary password"><PasswordInput name="adminPassword" autoComplete="new-password" className="input" /></Field>
        </div>
        <SubmitButton>Add company</SubmitButton>
      </ActionForm>
    </>
  );
}
