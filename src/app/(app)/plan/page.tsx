import Link from "next/link";
import type { Rag } from "@prisma/client";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/time";
import { formatDate, formatDateTime, formatINR, humanize, toDateInput } from "@/lib/format";
import { METRIC_SOURCE, isAutoMetric, metricActuals } from "@/lib/plan";
import {
  MONTHLY_RHYTHM,
  PLAN_AREAS,
  RAG_RULES,
  addMonths,
  monthLabel,
  monthParam,
  monthRhythm,
  monthStart,
  needsUpdate,
  parseMonth,
  percent,
  suggestRag,
} from "@/lib/plan-rules";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, Options, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  addMetric,
  addPlanTask,
  carryOver,
  deleteMetric,
  deletePlanTask,
  editPlanTask,
  loadCalendar,
  reviewPlanTask,
  setMetricActual,
  updatePlanTask,
} from "./actions";

export const metadata = { title: "Monthly work plan" };

const STATUS_COLOR = { NOT_STARTED: "gray", IN_PROGRESS: "blue", DONE: "green", BLOCKED: "red" } as const;
const ragLabel = (r: Rag | null) => (r ? humanize(r) : "Not reviewed");
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function money(kind: string, v: number) {
  return kind === "INVOICED" || kind === "RECEIVED" ? formatINR(v) : v.toLocaleString("en-IN");
}

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIST();
  const month = parseMonth(typeof sp.month === "string" ? sp.month : null) ?? monthStart(today);
  const manager = isManagerOrAdmin(user);
  const mine = sp.mine === "1";
  const [plan, users, holidays, anyMonth] = await Promise.all([
    db.planMonth.findUnique({
      where: { month },
      include: {
        metrics: { orderBy: { sort: "asc" } },
        tasks: {
          where: mine ? { ownerId: user.id } : undefined,
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          include: {
            owner: { select: { id: true, name: true } },
            updates: { orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: month, lt: addMonths(month, 1) }, optional: false }, select: { date: true } }),
    db.planMonth.count(),
  ]);
  const actuals = plan?.metrics.some((m) => isAutoMetric(m.kind)) ? await metricActuals(month) : null;
  const tasks = plan?.tasks ?? [];
  const rhythm = monthRhythm(month, holidays.map((h) => h.date), plan?.planningMeeting);
  const upcoming = rhythm.filter((e) => e.date >= today).slice(0, 4);
  const counts = { GREEN: 0, AMBER: 0, RED: 0, NONE: 0 } as Record<Rag | "NONE", number>;
  for (const t of tasks) counts[t.rag ?? "NONE"]++;
  const toUpdate = tasks.filter((t) => t.owner?.id === user.id && needsUpdate(t, today)).length;
  const isCurrent = month.getTime() === monthStart(today).getTime();
  const q = (m: Date) => `?month=${monthParam(m)}${mine ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Monthly work plan"
        subtitle={`${monthLabel(month)} · agreed at the planning meeting, updated every Friday, reviewed every Saturday.`}
        actions={
          <>
            <Link href={q(addMonths(month, -1))} className="btn-secondary" aria-label="Previous month">
              ← {monthLabel(addMonths(month, -1)).split(" ")[0]}
            </Link>
            {!isCurrent && (
              <Link href="/plan" className="btn-secondary">
                This month
              </Link>
            )}
            <Link href={q(addMonths(month, 1))} className="btn-secondary" aria-label="Next month">
              {monthLabel(addMonths(month, 1)).split(" ")[0]} →
            </Link>
            <Link href="/plan/year" className="btn-primary">
              Annual plan
            </Link>
          </>
        }
      />

      {anyMonth === 0 && manager && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Load the operating calendar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Adds June 2026 – May 2027 from the company&apos;s operational calendar: each month&apos;s focus, activities, leads and targets.
            </p>
          </div>
          <ActionForm action={loadCalendar}>
            <SubmitButton pendingLabel="Loading…">Load June 2026 – May 2027</SubmitButton>
          </ActionForm>
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow text-brand-700">Focus of the month</div>
              <h2 className="mt-1 text-xl font-bold tracking-tight">{plan?.focus ?? "Not planned yet"}</h2>
            </div>
            {plan?.leads && (
              <div className="text-right text-sm">
                <div className="text-xs text-slate-500">Lead</div>
                <div className="font-medium">{plan.leads}</div>
              </div>
            )}
          </div>
          {plan?.activities ? (
            <ul className="mt-4 space-y-1.5 text-sm">
              {plan.activities
                .split("\n")
                .filter(Boolean)
                .map((a) => (
                  <li key={a} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                    {a}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {manager ? (
                <>
                  Set this month&apos;s focus and activities in the <Link href="/plan/year" className="link">annual plan</Link>.
                </>
              ) : (
                "The month's focus will appear here after the planning meeting."
              )}
            </p>
          )}
          {plan?.planningMeeting && (
            <p className="mt-4 text-xs text-slate-500">Planning meeting: {formatDateTime(plan.planningMeeting)}</p>
          )}
        </section>
        <section className="card">
          <h2 className="font-semibold">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing left this month.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {upcoming.map((e) => (
                <li key={`${e.title}-${e.date.toISOString()}`} className="flex items-center gap-3">
                  <span className="date-chip">
                    <span className="text-base font-bold">{e.date.getUTCDate()}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-slate-500 uppercase">
                      {e.date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}
                    </span>
                  </span>
                  <span>
                    {e.title}
                    {e.time && <span className="block text-xs text-slate-500">{e.time}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {toUpdate > 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {toUpdate} of your tasks {toUpdate === 1 ? "needs" : "need"} this week&apos;s update (by Friday 6 pm).
            </p>
          )}
        </section>
      </div>

      <section className="mb-6">
        <div className="directory-heading">
          <h2>Targets this month</h2>
          <span>Counted numbers update by themselves from CRM, workshops, projects and billing.</span>
        </div>
        {!plan || plan.metrics.length === 0 ? (
          <Empty>No targets set for {monthLabel(month)}.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.metrics.map((m) => {
              const target = Number(m.target);
              const actual = isAutoMetric(m.kind) ? (actuals?.[m.kind] ?? 0) : num(m.manualActual);
              const pct = percent(actual, target) ?? 0;
              return (
                <div key={m.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{m.label}</div>
                    {manager && (
                      <form action={deleteMetric.bind(null, m.id)}>
                        <ConfirmButton message={`Remove the target "${m.label}"?`} className="text-xs text-slate-500 hover:text-red-700" title="Remove target">
                          Remove
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight">{actual === null ? "—" : money(m.kind, actual)}</span>
                    <span className="text-sm text-slate-500">of {money(m.kind, target)}</span>
                  </div>
                  <div className="progress-track mt-3">
                    <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{METRIC_SOURCE[m.kind]}</span>
                    <span className="font-semibold text-slate-700">{pct}%</span>
                  </div>
                  {!isAutoMetric(m.kind) && manager && (
                    <form action={setMetricActual.bind(null, m.id)} className="mt-3 flex gap-2">
                      <input name="actual" defaultValue={actual ?? ""} aria-label={`Actual for ${m.label}`} className="input py-1.5" inputMode="decimal" />
                      <button className="btn-secondary btn-sm">Save</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {manager && (
          <details className="mt-3">
            <summary className="link inline-block cursor-pointer text-sm">Add a target</summary>
            <ActionForm action={addMetric} className="card mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
              <input type="hidden" name="month" value={monthParam(month)} />
              <Field label="Counted from">
                <select name="kind" className="input" defaultValue="LEADS">
                  <Options
                    values={["LEADS", "MEETINGS", "CONVERSIONS", "WORKSHOP_STUDENTS", "INTERNSHIP_STUDENTS", "COLLEGE_PROJECTS", "SCHOOL_PROPOSALS", "INVOICED", "RECEIVED", "CUSTOM"]}
                    labels={(v) => (v === "CUSTOM" ? "Entered by hand" : humanize(v))}
                  />
                </select>
              </Field>
              <Field label="Name">
                <input name="label" required className="input" placeholder="New leads" />
              </Field>
              <Field label="Target">
                <input name="target" required className="input" inputMode="decimal" placeholder="25" />
              </Field>
              <SubmitButton>Add target</SubmitButton>
            </ActionForm>
          </details>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h2 className="mr-2 font-semibold">Work plan</h2>
            <span className="rag" data-rag="GREEN">{counts.GREEN} green</span>
            <span className="rag" data-rag="AMBER">{counts.AMBER} amber</span>
            <span className="rag" data-rag="RED">{counts.RED} red</span>
            {counts.NONE > 0 && <span className="rag" data-rag="NONE">{counts.NONE} not reviewed</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`?month=${monthParam(month)}${mine ? "" : "&mine=1"}`} className={`filter-chip ${mine ? "filter-chip-active" : ""}`}>
              Only my tasks
            </Link>
            {manager && (
              <ActionForm action={carryOver}>
                <input type="hidden" name="month" value={monthParam(month)} />
                <SubmitButton className="btn-secondary" pendingLabel="Copying…">
                  Carry over last month&apos;s open tasks
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        </div>
        {tasks.length === 0 ? (
          <Empty>{mine ? "You have no tasks in this month's plan." : "No tasks in this month's plan yet."}</Empty>
        ) : (
          <div className="space-y-3">
            {tasks.map((t, i) => {
              const target = num(t.target);
              const actual = num(t.actual);
              const pct = percent(actual, target);
              const suggestion = suggestRag({ status: t.status, target, actual, deadline: t.deadline, monthStart: month }, today);
              const isOwner = t.owner?.id === user.id;
              const late = t.deadline && t.deadline < today && t.status !== "DONE";
              return (
                <details key={t.id} id={`task-${t.id}`} className="card group p-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <span className="w-6 text-sm text-slate-500">{i + 1}</span>
                    <div className="min-w-0 flex-[1_1_16rem]">
                      <div className="text-xs text-slate-500">{t.area}</div>
                      <div className="font-medium">{t.activity}</div>
                    </div>
                    <div className="w-32 text-sm">
                      <div className="text-xs text-slate-500">Owner</div>
                      {t.owner?.name ?? "Not assigned"}
                    </div>
                    <div className="w-28 text-sm">
                      <div className="text-xs text-slate-500">Deadline</div>
                      <span className={late ? "font-medium text-red-700" : ""}>{formatDate(t.deadline)}</span>
                    </div>
                    <div className="w-36 text-sm">
                      <div className="text-xs text-slate-500">Actual / target</div>
                      {target !== null ? (
                        <>
                          {(actual ?? 0).toLocaleString("en-IN")} / {target.toLocaleString("en-IN")} {t.unit ?? ""}
                          <div className="progress-track mt-1">
                            <div className="progress-fill" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </div>
                    <Badge color={STATUS_COLOR[t.status]}>{humanize(t.status)}</Badge>
                    <span className="rag" data-rag={t.rag ?? "NONE"} title={t.ragAt ? `Reviewed ${formatDateTime(t.ragAt)}` : undefined}>
                      {ragLabel(t.rag)}
                    </span>
                    <Icon name="chevron" className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="grid gap-5 border-t border-[var(--line)] p-4 lg:grid-cols-3">
                    {(isOwner || manager) && (
                      <ActionForm action={updatePlanTask.bind(null, t.id)} className="space-y-3">
                        <h3 className="text-sm font-semibold">Friday update</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label={`Actual${t.unit ? ` (${t.unit})` : ""}`}>
                            <input name="actual" defaultValue={actual ?? ""} className="input" inputMode="decimal" />
                          </Field>
                          <Field label="Status">
                            <select name="status" defaultValue={t.status} className="input">
                              <Options values={["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"]} labels={humanize} />
                            </select>
                          </Field>
                        </div>
                        <Field label="What happened this week">
                          <textarea name="note" rows={2} className="input" />
                        </Field>
                        <SubmitButton>Save update</SubmitButton>
                        <p className="text-xs text-slate-500">Last update: {t.lastUpdateAt ? formatDateTime(t.lastUpdateAt) : "none yet"}</p>
                      </ActionForm>
                    )}
                    {manager && (
                      <ActionForm action={reviewPlanTask.bind(null, t.id)} className="space-y-3">
                        <h3 className="text-sm font-semibold">Saturday review</h3>
                        <fieldset className="flex flex-wrap gap-2">
                          <legend className="label">This week&apos;s colour</legend>
                          {(["GREEN", "AMBER", "RED"] as const).map((r) => (
                            <label key={r} className="filter-chip has-[:checked]:border-brand-700 has-[:checked]:bg-brand-700 has-[:checked]:text-white">
                              <input type="radio" name="rag" value={r} defaultChecked={(t.rag ?? suggestion) === r} className="sr-only" />
                              {humanize(r)}
                            </label>
                          ))}
                        </fieldset>
                        {suggestion && <p className="text-xs text-slate-500">Suggested from progress so far: {humanize(suggestion)}. {RAG_RULES[suggestion]}.</p>}
                        <Field label="Actions agreed">
                          <textarea name="note" rows={2} className="input" />
                        </Field>
                        <Field label="Recovery plan (when Red)">
                          <textarea name="recovery" rows={2} defaultValue={t.recovery ?? ""} className="input" />
                        </Field>
                        <SubmitButton>Save review</SubmitButton>
                      </ActionForm>
                    )}
                    <div className="space-y-3 text-sm">
                      <h3 className="font-semibold">History</h3>
                      {t.recovery && t.rag === "RED" && (
                        <p className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
                          <strong>Recovery plan:</strong> {t.recovery}
                        </p>
                      )}
                      {t.notes && <p className="text-slate-600">{t.notes}</p>}
                      {t.updates.length === 0 ? (
                        <p className="text-slate-500">No updates yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {t.updates.map((u) => (
                            <li key={u.id} className="border-l-2 border-[var(--line)] pl-3">
                              <div className="text-xs text-slate-500">
                                {u.user.name} · {formatDateTime(u.createdAt)}
                              </div>
                              {u.review ? (
                                <span className="rag mt-1" data-rag={u.rag ?? "NONE"}>
                                  {ragLabel(u.rag)}
                                </span>
                              ) : (
                                <div>
                                  {u.status && humanize(u.status)}
                                  {u.actual !== null && ` · actual ${Number(u.actual).toLocaleString("en-IN")}`}
                                </div>
                              )}
                              {u.note && <p className="mt-0.5 text-slate-600">{u.note}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {manager && (
                      <details className="lg:col-span-3">
                        <summary className="link inline-block cursor-pointer text-sm">Change or remove this task</summary>
                        <ActionForm action={editPlanTask.bind(null, t.id)} className="mt-3 grid gap-3 sm:grid-cols-3">
                          <TaskFields users={users} defaults={{ ...t, target, deadline: toDateInput(t.deadline) }} />
                          <div className="flex items-end gap-2 sm:col-span-3">
                            <SubmitButton>Save task</SubmitButton>
                          </div>
                        </ActionForm>
                        <form action={deletePlanTask.bind(null, t.id)} className="mt-2">
                          <ConfirmButton message={`Remove "${t.activity}" from the plan? Its updates go too.`} className="btn-danger btn-sm">
                            Remove task
                          </ConfirmButton>
                        </form>
                      </details>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {manager && (
          <section className="card lg:col-span-2">
            <h2 className="font-semibold">Add a task</h2>
            <p className="mt-1 text-sm text-slate-500">Every task has an owner, a deadline and a target. The owner is told in their Inbox.</p>
            <ActionForm action={addPlanTask} className="mt-4 grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="month" value={monthParam(month)} />
              <TaskFields users={users} defaults={{ ownerId: user.id }} />
              <div className="sm:col-span-3">
                <SubmitButton>Add to the plan</SubmitButton>
              </div>
            </ActionForm>
          </section>
        )}
        <section className={`card text-sm ${manager ? "" : "lg:col-span-3"}`}>
          <h2 className="font-semibold">How each month runs</h2>
          <ul className="mt-3 space-y-3">
            {MONTHLY_RHYTHM.map((r) => (
              <li key={r.when}>
                <div className="font-medium">{r.when}</div>
                <div className="text-slate-600">{r.what}</div>
                <div className="text-xs text-slate-500">{r.who}</div>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold">Weekly review colours</h3>
          <ul className="mt-2 space-y-1.5">
            {(Object.keys(RAG_RULES) as Rag[]).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="rag shrink-0" data-rag={r}>
                  {humanize(r)}
                </span>
                <span className="text-slate-600">{RAG_RULES[r]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function TaskFields({
  users,
  defaults,
}: {
  users: { id: string; name: string }[];
  defaults: { area?: string; activity?: string; ownerId?: string | null; deadline?: string; target?: number | null; unit?: string | null; notes?: string | null };
}) {
  return (
    <>
      <Field label="Area">
        <input name="area" list="plan-areas" required defaultValue={defaults.area ?? "Sales & Marketing"} className="input" />
        <datalist id="plan-areas">
          {PLAN_AREAS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Field>
      <Field label="Activity" className="sm:col-span-2">
        <input name="activity" required defaultValue={defaults.activity ?? ""} className="input" placeholder="Visit colleges to book one-day workshops" />
      </Field>
      <Field label="Owner">
        <select name="ownerId" defaultValue={defaults.ownerId ?? ""} className="input">
          <option value="">Not assigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Deadline">
        <input type="date" name="deadline" defaultValue={defaults.deadline ?? ""} className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target">
          <input name="target" defaultValue={defaults.target ?? ""} className="input" inputMode="decimal" placeholder="600" />
        </Field>
        <Field label="Unit">
          <input name="unit" defaultValue={defaults.unit ?? ""} className="input" placeholder="students" />
        </Field>
      </div>
      <Field label="Notes" className="sm:col-span-3">
        <input name="notes" defaultValue={defaults.notes ?? ""} className="input" />
      </Field>
    </>
  );
}
