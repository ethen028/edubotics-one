import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/time";
import { formatDate, toDateInput } from "@/lib/format";
import { addMonths, monthLabel, monthParam, monthStart, reviewDays } from "@/lib/plan-rules";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { loadCalendar, saveMonth, saveMonthReview } from "../actions";

export const metadata = { title: "Annual plan" };

/** The operating year runs June to May; the financial year runs April to March. */
function operatingYearStart(d: Date) {
  return new Date(Date.UTC(d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1, 5, 1));
}

export default async function AnnualPlanPage({ searchParams }: PageProps<"/plan/year">) {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const sp = await searchParams;
  const today = todayIST();
  const startYear = Number(sp.year) || operatingYearStart(today).getUTCFullYear();
  const start = new Date(Date.UTC(startYear, 5, 1));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  const [plans, holidays, taskCounts] = await Promise.all([
    db.planMonth.findMany({ where: { month: { gte: start, lt: addMonths(start, 12) } }, orderBy: { month: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: start, lt: addMonths(start, 12) }, optional: false }, select: { date: true } }),
    db.planTask.groupBy({ by: ["monthId", "status"], _count: true, where: { month: { month: { gte: start, lt: addMonths(start, 12) } } } }),
  ]);
  const byMonth = new Map(plans.map((p) => [p.month.getTime(), p]));
  const current = monthStart(today).getTime();
  const hol = holidays.map((h) => h.date);

  return (
    <>
      <PageHeader
        title="Annual plan"
        subtitle={`Operating year June ${startYear} – May ${startYear + 1}. One line per month: its focus, main activities and targets.`}
        actions={
          <>
            <Link href={`?year=${startYear - 1}`} className="btn-secondary">
              ← {startYear - 1}–{String(startYear).slice(2)}
            </Link>
            <Link href={`?year=${startYear + 1}`} className="btn-secondary">
              {startYear + 1}–{String(startYear + 2).slice(2)} →
            </Link>
            <Link href="/plan" className="btn-primary">
              This month&apos;s work plan
            </Link>
          </>
        }
      />
      {plans.length === 0 && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Nothing planned for this year yet</h2>
            <p className="mt-1 text-sm text-slate-500">
              {manager && startYear === 2026
                ? "Load the operational calendar for June 2026 – May 2027 to start, then change anything below."
                : "Managers fill in each month below."}
            </p>
          </div>
          {manager && startYear === 2026 && (
            <ActionForm action={loadCalendar}>
              <SubmitButton pendingLabel="Loading…">Load the operating calendar</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {months.map((m) => {
          const p = byMonth.get(m.getTime());
          const state = m.getTime() === current ? "now" : m.getTime() < current ? "past" : "next";
          const counts = taskCounts.filter((c) => c.monthId === p?.id);
          const total = counts.reduce((s, c) => s + c._count, 0);
          const done = counts.find((c) => c.status === "DONE")?._count ?? 0;
          const reviews = reviewDays(m, hol).map((d) => d.getUTCDate());
          return (
            <section key={m.toISOString()} className={`card flex flex-col ${state === "now" ? "ring-2 ring-brand-700" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold tracking-tight">{monthLabel(m)}</h2>
                {state === "now" ? <Badge color="blue">This month</Badge> : state === "past" ? <Badge color="green">Done</Badge> : <Badge>Upcoming</Badge>}
              </div>
              <p className="mt-2 font-medium">{p?.focus ?? <span className="text-slate-500">Not planned yet</span>}</p>
              {p?.activities && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {p.activities
                    .split("\n")
                    .filter(Boolean)
                    .map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                </ul>
              )}
              {p?.targets && (
                <div className="mt-3 rounded-xl bg-[var(--page-bg)] px-3 py-2 text-sm">
                  <div className="text-xs font-semibold text-slate-500">Targets</div>
                  <div className="whitespace-pre-line">{p.targets}</div>
                </div>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Lead</dt>
                  <dd className="font-medium">{p?.leads ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Planning meeting</dt>
                  <dd className="font-medium">{p?.planningMeeting ? formatDate(p.planningMeeting) : "1st working day"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Weekly reviews (Saturdays, 10 am)</dt>
                  <dd className="font-medium">{reviews.join(", ")}</dd>
                </div>
              </dl>
              {p?.review && (
                <div className="mt-3 rounded-xl bg-mint px-3 py-2 text-sm text-ink">
                  <div className="text-xs font-semibold">Month-end review</div>
                  <div className="whitespace-pre-line">{p.review}</div>
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
                <Link href={`/plan?month=${monthParam(m)}`} className="link">
                  Work plan{total > 0 ? ` · ${done} of ${total} done` : ""}
                </Link>
              </div>
              {manager && (
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer text-sm text-slate-600">Change this month</summary>
                  <ActionForm action={saveMonth} className="mt-3 space-y-3">
                    <input type="hidden" name="month" value={monthParam(m)} />
                    <Field label="Focus" className="block">
                      <input name="focus" required defaultValue={p?.focus ?? ""} className="input" />
                    </Field>
                    <Field label="Main activities (one per line)" className="block">
                      <textarea name="activities" rows={4} defaultValue={p?.activities ?? ""} className="input" />
                    </Field>
                    <Field label="Targets" className="block">
                      <textarea name="targets" rows={2} defaultValue={p?.targets ?? ""} className="input" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Lead">
                        <input name="leads" defaultValue={p?.leads ?? ""} className="input" />
                      </Field>
                      <Field label="Planning meeting">
                        <input type="date" name="planningMeeting" defaultValue={toDateInput(p?.planningMeeting)} className="input" />
                      </Field>
                    </div>
                    <SubmitButton>Save month</SubmitButton>
                  </ActionForm>
                  {p && state !== "next" && (
                    <ActionForm action={saveMonthReview} className="mt-4 space-y-3">
                      <input type="hidden" name="month" value={monthParam(m)} />
                      <Field label="Month-end review (achieved / notes)" className="block">
                        <textarea name="review" rows={3} defaultValue={p.review ?? ""} className="input" />
                      </Field>
                      <SubmitButton className="btn-secondary">Save review</SubmitButton>
                    </ActionForm>
                  )}
                </details>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
