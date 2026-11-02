import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/invoices";
import { invoicesWithBalance } from "../data";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { remindSchool, setSchoolAutoReminders } from "../../emails/actions";
import { schoolReminderPlans } from "@/lib/payment-reminders";
import type { SchoolPlan } from "@/lib/reminder-rules";
import { Badge } from "@/components/ui";

export const metadata = { title: "Payments due" };

const BUCKETS = [
  ["Not yet due", (d: number) => d <= 0],
  ["1–30 days late", (d: number) => d >= 1 && d <= 30],
  ["31–60", (d: number) => d >= 31 && d <= 60],
  ["61–90", (d: number) => d >= 61 && d <= 90],
  ["Over 90", (d: number) => d > 90],
] as const;

/** Who owes what, school by school, oldest debts first: the list to work through when chasing payments. */
export default async function DuesPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  const open = (await invoicesWithBalance({ status: "ISSUED" })).filter((i) => i.balance > 0);
  const settings = await getSettings();
  const mailOn = mailSetup(settings) === "READY";
  const autoOn = mailOn && settings.autoRemindersEnabled;
  const plans = await schoolReminderPlans();

  const bySchool = new Map<
    string,
    { org: (typeof open)[number]["organization"]; contact: (typeof open)[number]["contact"]; invoices: typeof open }
  >();
  for (const i of open) {
    const row = bySchool.get(i.organizationId) ?? { org: i.organization, contact: i.contact, invoices: [] };
    row.contact ??= i.contact;
    row.invoices.push(i);
    bySchool.set(i.organizationId, row);
  }
  const schools = [...bySchool.values()]
    .map((s) => ({
      ...s,
      total: s.invoices.reduce((n, i) => n + i.balance, 0),
      buckets: BUCKETS.map(([, test]) => s.invoices.filter((i) => test(i.daysLate)).reduce((n, i) => n + i.balance, 0)),
      oldest: Math.max(...s.invoices.map((i) => i.daysLate)),
      email: s.invoices.find((i) => i.daysLate > 0 && i.contact?.email)?.contact?.email ?? s.org.email,
      reminded: s.invoices.flatMap((i) => i.emails).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0],
      plan: plans.get(s.org.id),
      paused: isPaused(plans.get(s.org.id)),
      invoices: s.invoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()),
    }))
    .sort((a, b) => b.oldest - a.oldest || b.total - a.total);
  const column = (k: number) => schools.reduce((n, s) => n + s.buckets[k], 0);
  const total = schools.reduce((n, s) => n + s.total, 0);

  return (
    <>
      <PageHeader
        title="Payments due"
        subtitle={
          mailOn
            ? `Unpaid invoices by school, the longest overdue first. A reminder lists all of a school's overdue invoices, with copies attached.${
                autoOn ? " Automatic reminders are on (Admin → Settings → Email)." : ""
              }`
            : "Unpaid invoices by school, the longest overdue first."
        }
        actions={
          <Link href="/invoices" className="btn-secondary">
            All invoices
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Still to collect" value={formatMoney(total)} />
        <Stat label="Overdue" value={formatMoney(total - column(0))} />
        <Stat label="Over 60 days late" value={formatMoney(column(3) + column(4))} />
        <Stat label="Schools owing" value={schools.length} />
      </div>

      {schools.length === 0 ? (
        <Empty>Nothing is owed right now.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>School / institution</th>
                {BUCKETS.map(([label]) => (
                  <th key={label} className="text-right">
                    {label}
                  </th>
                ))}
                <th className="text-right">Total due</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.org.id}>
                  <td>
                    <Link href={`/crm/organizations/${s.org.id}`} className="link">
                      {s.org.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {[s.contact?.name, s.contact?.phone ?? s.org.phone].filter(Boolean).join(" · ")}
                    </div>
                    {s.oldest > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {s.reminded && (
                          <span className="text-slate-500">
                            Reminded {formatDate(s.reminded.createdAt)}
                            {s.reminded.automatic && " (automatic)"}
                          </span>
                        )}
                        {!s.email ? (
                          <span className="text-slate-400">No email address on file</span>
                        ) : (
                          mailOn && (
                            <ActionForm action={remindSchool.bind(null, s.org.id)} className="contents">
                              <SubmitButton className="btn-secondary btn-sm" pendingLabel="Sending…">
                                {s.reminded ? "Remind again" : "Send reminder"}
                              </SubmitButton>
                            </ActionForm>
                          )
                        )}
                      </div>
                    )}
                    {s.oldest > 0 && (autoOn || s.paused) && s.plan && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <AutoStatus plan={s.plan} on={autoOn} />
                        {autoOn && (
                          <ActionForm action={setSchoolAutoReminders.bind(null, s.org.id, !s.paused)} className="contents">
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
                              {s.paused ? "Restart automatic reminders" : "Stop automatic reminders"}
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {s.invoices.map((i) => (
                        <li key={i.id}>
                          <Link href={`/invoices/${i.id}`} className="link">
                            {i.number}
                          </Link>{" "}
                          <span className={i.daysLate > 0 ? "text-red-600" : "text-slate-500"}>
                            {formatMoney(i.balance)}, due {formatDate(i.dueDate)}
                            {i.daysLate > 0 && ` (${i.daysLate} days late)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  {s.buckets.map((v, k) => (
                    <td key={k} className={`text-right whitespace-nowrap ${v > 0 && k > 0 ? "text-red-600" : ""}`}>
                      {v > 0 ? formatMoney(v) : "—"}
                    </td>
                  ))}
                  <td className="text-right font-semibold whitespace-nowrap">{formatMoney(s.total)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                {BUCKETS.map(([label], k) => (
                  <td key={label} className="text-right whitespace-nowrap">
                    {formatMoney(column(k))}
                  </td>
                ))}
                <td className="text-right whitespace-nowrap">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const isPaused = (p: SchoolPlan | undefined) => !!p && !p.send && p.why === "paused";

/** Where a school stands with the automatic reminders, in a few words. */
function AutoStatus({ plan, on }: { plan: SchoolPlan; on: boolean }) {
  if (!plan.send && plan.why === "paused") return <Badge color="amber">Automatic reminders stopped</Badge>;
  if (!on) return null;
  if (plan.send) return <span className="text-brand-700">Automatic reminder in the next round</span>;
  switch (plan.why) {
    case "limit-reached":
      return <Badge color="red">Automatic reminders used up: call them</Badge>;
    case "no-email":
      return null; // already said above
    default:
      return plan.nextOn ? <span className="text-slate-500">Next automatic reminder from {formatDate(plan.nextOn)}</span> : null;
  }
}
