import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { exitFor, handoverCounts, leavingChecks } from "@/lib/exits";
import {
  dayRate,
  EXIT_KIND_LABEL,
  EXIT_REASONS,
  EXIT_STAGE,
  EXIT_TASK_CATEGORIES,
  noticeServed,
  serviceYears,
  settlementAmounts,
  suggestedGratuity,
} from "@/lib/exit-math";
import { salaryFor } from "@/lib/payroll-data";
import { monthLabel } from "@/lib/payroll";
import { getSettings } from "@/lib/settings";
import { getLeaveBalances } from "@/lib/leave-balance";
import { requestNo } from "@/lib/inventory";
import { mailSetup } from "@/lib/mail";
import { exitLetterEmail } from "@/lib/email-templates";
import { todayIST } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { formatDate, formatINR, toDateInput } from "@/lib/format";
import { RatingPicker } from "../../reviews/ui";
import { emailExitLetter } from "../../../emails/actions";
import {
  acceptResignation,
  addExitTask,
  changeLastDay,
  deleteExitTask,
  handOver,
  markLeft,
  reopenSettlement,
  saveInterview,
  saveSettlement,
  setRehire,
  settleAsset,
  toggleExitTask,
  withdrawExit,
} from "../actions";

export const metadata = { title: "Exit" };

const RECOMMEND = { yes: "Yes", no: "No" } as const;

export default async function ExitPage({ params }: PageProps<"/hr/exits/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const found = await exitFor(user, id);
  if (!found) notFound();
  const { exit, admin, isSelf, canRun } = found;
  const e = exit.employee;
  const name = `${e.firstName} ${e.lastName}`.trim();
  const today = todayIST();
  const lastDay = exit.lastWorkingDay ?? exit.proposedLastDay;
  const month = toDateInput(lastDay).slice(0, 7);
  const open = exit.stage === "REQUESTED" || exit.stage === "ON_NOTICE";
  const manage = canRun && !isSelf;
  const seeSettlement = admin || isSelf;
  const seeInterview = (admin || isSelf) && exit.stage !== "WITHDRAWN";

  const [settings, structure, checks, handover, balances, run, emails, people] = await Promise.all([
    getSettings(),
    seeSettlement ? salaryFor(e.id, month) : null,
    leavingChecks(e.id, e.userId),
    manage && exit.stage !== "WITHDRAWN" ? handoverCounts(e.id, e.userId) : [],
    admin ? getLeaveBalances(e.id, lastDay.getUTCFullYear()) : [],
    admin
      ? db.payrollRun.findUnique({
          where: { month },
          select: { status: true, payslips: { where: { employeeId: e.id }, select: { id: true, finalSettlement: true } } },
        })
      : null,
    admin ? db.emailLog.findMany({ where: { exitId: exit.id }, select: emailLogSelect, orderBy: { createdAt: "desc" } }) : [],
    manage
      ? db.user.findMany({
          where: {
            active: true,
            id: { not: e.userId ?? "__none__" },
            ...(admin ? {} : { OR: [{ id: user.id }, { employee: { managerId: user.employee?.id ?? "__none__" } }] }),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

  const notice = noticeServed(exit.noticeGivenOn, lastDay, exit.noticeDays);
  const service = serviceYears(e.dateOfJoining, lastDay);
  const rate = structure ? dayRate(structure, settings.lopDivisor) : 0;
  const amounts = settlementAmounts(exit, rate);
  const gratuityHint = structure ? suggestedGratuity(structure.basic, e.dateOfJoining, lastDay) : 0;
  const settlementTouched = exit.settlementAgreedAt || [exit.encashDays, exit.noticePayDays, exit.recoveryDays, exit.gratuity, exit.recoveries].some((v) => Number(v) > 0);
  const tasksDone = exit.tasks.filter((t) => t.doneAt).length;
  const toHandOver = handover.filter((h) => h.count > 0);
  const slip = run?.payslips[0];
  const stage = EXIT_STAGE[exit.stage];
  const casual = balances.find((b) => b.code === "CL");
  const setup = mailSetup(settings);
  const letterTo = e.personalEmail ?? e.workEmail;

  return (
    <>
      <PageHeader
        title={isSelf ? "My resignation" : `${name}: ${EXIT_KIND_LABEL[exit.kind].toLowerCase()}`}
        subtitle={
          <>
            <Badge color={stage.color}>{stage.label}</Badge> {e.designation}
            {e.department && ` · ${e.department.name}`} · {e.code}
          </>
        }
        actions={
          <>
            <Link href={`/hr/employees/${e.id}`} className="btn-secondary">
              {isSelf ? "My profile" : "Profile"}
            </Link>
            {canRun && !isSelf && (
              <Link href="/hr/exits" className="btn-secondary">
                All exits
              </Link>
            )}
          </>
        }
      />

      {/* What happens next, for whoever is looking. */}
      {exit.stage === "REQUESTED" && (
        <div className="card mb-6 border-amber-200 bg-amber-50 text-sm">
          {manage ? (
            <form action={acceptResignation.bind(null, exit.id)} className="flex flex-wrap items-end gap-3">
              <div className="w-full">
                <span className="font-semibold">{name} resigned on {formatDate(exit.noticeGivenOn)}.</span> Agree the last working day and accept. They
                go on notice and the leaving checklist starts.
              </div>
              <Field label="Last working day">
                <input type="date" name="lastWorkingDay" required defaultValue={toDateInput(exit.proposedLastDay)} min={toDateInput(exit.noticeGivenOn)} className="input w-auto" />
              </Field>
              <button className="btn-primary">Accept resignation</button>
            </form>
          ) : (
            <p>
              {isSelf ? "Your resignation is" : "This resignation is"} waiting for {isSelf ? "your manager" : "the manager"} or an admin to accept it and agree
              the last working day.
            </p>
          )}
          {(isSelf || (admin && !isSelf)) && (
            <form action={withdrawExit.bind(null, exit.id)} className="mt-3">
              <button className="btn-secondary btn-sm">{isSelf ? "Take back my resignation" : "Withdraw this resignation"}</button>
            </form>
          )}
        </div>
      )}
      {exit.stage === "ON_NOTICE" && isSelf && (
        <div className="card mb-6 border-brand-100 bg-brand-50 text-sm">
          Your last working day is <span className="font-semibold">{formatDate(exit.lastWorkingDay)}</span>.{" "}
          {checks.assets.length > 0 && `Please hand back ${checks.assets.length === 1 ? "your asset" : `your ${checks.assets.length} assets`} before then. `}
          {!exit.interviewAt && "We would also value your answers to the short exit interview below."}
        </div>
      )}
      {exit.stage === "ON_NOTICE" && admin && !isSelf && exit.lastWorkingDay && (
        <div className="card mb-6 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-semibold">
                {exit.lastWorkingDay > today ? `Leaving on ${formatDate(exit.lastWorkingDay)}` : `Last working day was ${formatDate(exit.lastWorkingDay)}`}
              </div>
              <p className="text-slate-500">
                Marking as left closes their employee record and switches off their login.
                {(checks.assets.length > 0 || toHandOver.length > 0) && " Some things below are still open."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {exit.lastWorkingDay <= today && (
                <ActionForm action={markLeft.bind(null, exit.id)}>
                  <SubmitButton>Mark as left</SubmitButton>
                </ActionForm>
              )}
              <form action={withdrawExit.bind(null, exit.id)}>
                <button className="btn-secondary">Call off this exit</button>
              </form>
            </div>
          </div>
        </div>
      )}
      {exit.stage === "WITHDRAWN" && (
        <div className="card mb-6 text-sm text-slate-600">Withdrawn on {formatDate(exit.withdrawnAt)}. Nothing here applies any more.</div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Notice</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-slate-500">{exit.kind === "RESIGNATION" ? "Resigned on" : "Notice given"}</dt>
            <dd>{formatDate(exit.noticeGivenOn)}</dd>
            <dt className="text-slate-500">Notice period</dt>
            <dd>{exit.noticeDays} days</dd>
            {exit.kind === "RESIGNATION" && (
              <>
                <dt className="text-slate-500">Asked for</dt>
                <dd>{formatDate(exit.proposedLastDay)}</dd>
              </>
            )}
            <dt className="text-slate-500">Last working day</dt>
            <dd className="font-medium">{exit.lastWorkingDay ? formatDate(exit.lastWorkingDay) : "Not agreed yet"}</dd>
            <dt className="text-slate-500">Notice served</dt>
            <dd>
              {notice.served} of {exit.noticeDays} days
              {notice.short > 0 && <span className="text-amber-700"> · {notice.short} short</span>}
            </dd>
            <dt className="text-slate-500">Joined</dt>
            <dd>
              {formatDate(e.dateOfJoining)} · {service.years}y {service.months}m
            </dd>
            <dt className="text-slate-500">Manager</dt>
            <dd>{e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "—"}</dd>
            <dt className="text-slate-500">Recorded by</dt>
            <dd>{exit.startedBy.name}</dd>
            {exit.acceptedBy && (
              <>
                <dt className="text-slate-500">Accepted by</dt>
                <dd>
                  {exit.acceptedBy.name}, {formatDate(exit.acceptedAt)}
                </dd>
              </>
            )}
            {exit.leftAt && (
              <>
                <dt className="text-slate-500">Marked as left</dt>
                <dd>{formatDate(exit.leftAt)}</dd>
              </>
            )}
          </dl>
          {exit.reason && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-700">{exit.reason}</p>}
          {admin && !isSelf && exit.stage === "ON_NOTICE" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-brand-700">Change last working day</summary>
              <ActionForm action={changeLastDay.bind(null, exit.id)} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="date" name="lastWorkingDay" required defaultValue={toDateInput(exit.lastWorkingDay)} className="input w-auto" />
                <SubmitButton className="btn-secondary btn-sm">Change</SubmitButton>
              </ActionForm>
            </details>
          )}
          {admin && !isSelf && exit.stage === "LEFT" && (
            <form action={setRehire.bind(null, exit.id)} className="mt-3 flex items-center gap-2">
              <span className="text-slate-500">Would rehire</span>
              <select name="rehireEligible" defaultValue={exit.rehireEligible == null ? "" : exit.rehireEligible ? "yes" : "no"} className="input w-auto py-1">
                <option value="">Not decided</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <button className="btn-secondary btn-sm">Save</button>
            </form>
          )}
        </section>

        {exit.stage !== "REQUESTED" && exit.stage !== "WITHDRAWN" && (
          <section className="card text-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Leaving checklist</h2>
              <span className="text-xs text-slate-500">
                {tasksDone} of {exit.tasks.length} done
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {exit.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  {manage ? (
                    <form action={toggleExitTask.bind(null, t.id)}>
                      <button
                        className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${t.doneAt ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}
                        title={t.doneAt ? "Mark as not done" : "Mark as done"}
                      >
                        {t.doneAt ? "✓" : ""}
                      </button>
                    </form>
                  ) : (
                    <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${t.doneAt ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>
                      {t.doneAt ? "✓" : ""}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={t.doneAt ? "text-slate-400 line-through" : ""}>{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {t.category}
                      {t.doneAt && ` · done ${formatDate(t.doneAt)}${t.doneBy ? ` by ${t.doneBy.name}` : ""}`}
                    </div>
                  </div>
                  {manage && (
                    <form action={deleteExitTask.bind(null, t.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600" title="Remove">
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {manage && (
              <ActionForm action={addExitTask.bind(null, exit.id)} className="mt-3 flex flex-wrap gap-2">
                <input name="title" required placeholder="Add a task" className="input min-w-0 flex-1" />
                <select name="category" className="input w-auto">
                  {EXIT_TASK_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <SubmitButton className="btn-secondary">Add</SubmitButton>
              </ActionForm>
            )}
          </section>
        )}
      </div>

      {exit.stage !== "WITHDRAWN" && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Assets, kits and claims</h2>
            {checks.assets.length === 0 ? (
              <p className="text-emerald-700">No company assets with {isSelf ? "you" : "them"}.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {checks.assets.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      {a.name} <span className="text-xs text-slate-500">· {a.code}</span>
                      <div className="text-xs text-slate-500">
                        {a.category}
                        {a.serialNo && ` · S/N ${a.serialNo}`}
                      </div>
                    </div>
                    {admin && !isSelf && open && (
                      <form action={settleAsset.bind(null, exit.id, a.id)} className="flex gap-1">
                        <button name="outcome" value="RETURNED" className="btn-primary btn-sm">
                          Returned
                        </button>
                        <button name="outcome" value="MISSING" className="btn-secondary btn-sm" title="Write it off; add its cost to recoveries to charge for it">
                          Not returned
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {checks.kits.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">
                Kits and parts still out:{" "}
                {checks.kits.map((k, i) => (
                  <span key={k.id}>
                    {i > 0 && ", "}
                    <Link href={`/inventory/requests/${k.id}`} className="link">
                      {requestNo(k.number)}
                    </Link>
                    {k.returnBy && ` (back by ${formatDate(k.returnBy)})`}
                  </span>
                ))}
                . Record the return on each request.
              </div>
            )}
            {checks.claims.length > 0 && (
              <p className="mt-3 text-slate-600">
                {checks.claims.filter((c) => c.status === "SUBMITTED").length > 0 &&
                  `${checks.claims.filter((c) => c.status === "SUBMITTED").length} expense claim(s) waiting for approval. `}
                {checks.claims.filter((c) => c.status === "APPROVED").length > 0 &&
                  `${checks.claims.filter((c) => c.status === "APPROVED").length} approved claim(s) to be paid with the last salary.`}
              </p>
            )}
          </section>

          {manage && (
            <section className="card text-sm">
              <h2 className="mb-1 font-semibold">Hand over their work</h2>
              {toHandOver.length === 0 ? (
                <p className="text-emerald-700">Nothing is left in {name}&apos;s name.</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-slate-500">Still in {name}&apos;s name. Hand over moves all of it to one person; you can move single items later from each page.</p>
                  <ul className="mb-3 grid gap-x-4 sm:grid-cols-2">
                    {toHandOver.map((h) => (
                      <li key={h.key} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                        <Link href={h.href} className="link">
                          {h.label}
                        </Link>
                        <span className="font-medium">{h.count}</span>
                      </li>
                    ))}
                  </ul>
                  <ActionForm action={handOver.bind(null, exit.id)} className="flex flex-wrap items-center gap-2">
                    <select name="toUserId" required defaultValue="" className="input w-auto min-w-0 flex-1">
                      <option value="" disabled>
                        Hand over to…
                      </option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <SubmitButton pendingLabel="Handing over…">Hand over</SubmitButton>
                  </ActionForm>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {seeInterview && (
        <section className="card mb-6 max-w-3xl text-sm">
          <h2 className="font-semibold">Exit interview</h2>
          <p className="mb-3 text-xs text-slate-500">
            {isSelf ? "Only admins see your answers, not your manager." : "Seen only by the person and admins."}
            {exit.interviewAt && ` Last saved ${formatDate(exit.interviewAt)}.`}
          </p>
          <ActionForm action={saveInterview.bind(null, exit.id)} className="space-y-4">
            <Field label="Main reason for leaving">
              <select key={exit.interviewReason ?? ""} name="interviewReason" required defaultValue={exit.interviewReason ?? ""} className="input">
                <option value="" disabled>
                  Choose…
                </option>
                {EXIT_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">How was working here? (1 poor, 5 excellent)</span>
              <RatingPicker name="interviewRating" value={exit.interviewRating} compact />
            </div>
            <div>
              <span className="label">Would you recommend {settings.companyName} to a friend as a place to work?</span>
              <div className="flex gap-4">
                {Object.entries(RECOMMEND).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="interviewRecommend"
                      value={k}
                      defaultChecked={exit.interviewRecommend != null && (exit.interviewRecommend ? "yes" : "no") === k}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
            <Field label="What did you like most?">
              <textarea name="interviewLiked" rows={3} maxLength={3000} defaultValue={exit.interviewLiked ?? ""} className="input" />
            </Field>
            <Field label="What should we do better?">
              <textarea name="interviewImprove" rows={3} maxLength={3000} defaultValue={exit.interviewImprove ?? ""} className="input" />
            </Field>
            {exit.stage !== "LEFT" || admin ? <SubmitButton>Save answers</SubmitButton> : null}
          </ActionForm>
        </section>
      )}

      {admin && !isSelf && exit.stage !== "REQUESTED" && exit.stage !== "WITHDRAWN" && (
        <section className="card mb-6 max-w-3xl text-sm" id="settlement">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Final settlement</h2>
            {exit.settlementAgreedAt ? <Badge color="green">Agreed {formatDate(exit.settlementAgreedAt)}</Badge> : <Badge>Draft</Badge>}
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Paid with the last salary, on the payslip for {monthLabel(month)}. Days are paid at monthly gross ÷ {settings.lopDivisor}
            {structure ? ` = ${formatINR(rate)} a day` : ""}. Salary for the days worked, loss of pay and approved expense claims are worked out by
            payroll as usual.
          </p>
          {!structure ? (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
              No salary is set for {monthLabel(month)}. Add one on the{" "}
              <Link href={`/hr/employees/${e.id}#salary`} className="link">
                profile
              </Link>{" "}
              first.
            </p>
          ) : exit.settlementAgreedAt ? (
            <>
              <SettlementTable amounts={amounts} exit={exit} />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {slip ? (
                  <Link href={`/payroll/payslip/${slip.id}`} className="link">
                    Last payslip ({monthLabel(month)})
                  </Link>
                ) : (
                  <span className="text-slate-500">Goes on when the {monthLabel(month)} payroll is started.</span>
                )}
                {run && run.status !== "DRAFT" && slip && !slip.finalSettlement && (
                  <span className="text-amber-700">
                    The {monthLabel(month)} payroll was finalised before this was agreed. Reopen it and recalculate.
                  </span>
                )}
                {run?.status === "DRAFT" && slip && !slip.finalSettlement && (
                  <span className="text-amber-700">
                    <Link href={`/payroll/${month}`} className="link">
                      Recalculate the {monthLabel(month)} payroll
                    </Link>{" "}
                    to add it.
                  </span>
                )}
                {run?.status !== "PAID" && (
                  <form action={reopenSettlement.bind(null, exit.id)}>
                    <button className="btn-secondary btn-sm">Change settlement</button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <ActionForm action={saveSettlement.bind(null, exit.id)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Leave paid out (days)">
                  <input name="encashDays" type="number" min={0} step="0.5" defaultValue={Number(exit.encashDays)} className="input" />
                  <span className="mt-1 block text-xs text-slate-500">
                    {casual ? `${casual.remaining ?? 0} casual leave days left this year. ` : ""}Leave isn&apos;t paid out unless you enter days.
                  </span>
                </Field>
                <Field label="Notice not served, recovered (days)">
                  <input name="recoveryDays" type="number" min={0} step="0.5" defaultValue={Number(exit.recoveryDays)} className="input" />
                  <span className="mt-1 block text-xs text-slate-500">
                    {notice.short > 0 ? `${notice.short} days short. Leave at 0 to let it go.` : "Full notice served."}
                  </span>
                </Field>
                <Field label="Paid in lieu of notice (days)">
                  <input name="noticePayDays" type="number" min={0} step="0.5" defaultValue={Number(exit.noticePayDays)} className="input" />
                  <span className="mt-1 block text-xs text-slate-500">When the company asks them to leave before the notice ends.</span>
                </Field>
                <Field label="Gratuity (₹)">
                  <input
                    name="gratuity"
                    type="number"
                    min={0}
                    defaultValue={settlementTouched ? Number(exit.gratuity) : gratuityHint}
                    className="input"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    {gratuityHint
                      ? `${service.years}+ years: basic × 15 ÷ 26 × ${service.rounded} years = ${formatINR(gratuityHint)}.`
                      : "Due after 5 years of service, so none here."}
                  </span>
                </Field>
                <Field label="Other recoveries (₹)">
                  <input name="recoveries" type="number" min={0} defaultValue={Number(exit.recoveries)} className="input" />
                </Field>
                <Field label="Recovery is for">
                  <input name="recoveriesNote" maxLength={300} defaultValue={exit.recoveriesNote ?? ""} placeholder="e.g. Laptop not returned" className="input" />
                </Field>
              </div>
              <Field label="Note (shown here only)">
                <input name="settlementNote" maxLength={1000} defaultValue={exit.settlementNote ?? ""} className="input" />
              </Field>
              {settlementTouched && <SettlementTable amounts={amounts} exit={exit} />}
              <div className="flex flex-wrap gap-2">
                <button name="intent" value="save" className="btn-secondary">
                  Save draft
                </button>
                <button name="intent" value="agree" className="btn-primary">
                  Save and agree
                </button>
              </div>
            </ActionForm>
          )}
        </section>
      )}

      {isSelf && exit.settlementAgreedAt && (
        <section className="card mb-6 max-w-3xl text-sm">
          <h2 className="mb-2 font-semibold">Final settlement</h2>
          <p className="mb-2 text-xs text-slate-500">Paid with your last salary, on the payslip for {monthLabel(month)}.</p>
          <SettlementTable amounts={amounts} exit={exit} />
        </section>
      )}

      {admin && !isSelf && exit.lastWorkingDay && (exit.stage === "ON_NOTICE" || exit.stage === "LEFT") && (
        <div className="mb-6 grid max-w-3xl gap-4">
          <section className="card text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Relieving and experience letter</h2>
                <p className="text-xs text-slate-500">
                  {exit.stage === "LEFT"
                    ? `Signed by ${settings.certSignatoryName || "the signatory set in Settings → Workshop certificates"}.`
                    : "Marked draft until they are marked as left."}
                </p>
              </div>
              <a href={`/hr/exits/${exit.id}/letter`} target="_blank" className="btn-secondary">
                Download PDF
              </a>
            </div>
          </section>
          {exit.stage === "LEFT" && (
            <EmailComposer
              title="Email the letter"
              action={emailExitLetter.bind(null, exit.id)}
              draft={{ to: letterTo, ...exitLetterEmail({ firstName: e.firstName }, user.name, settings) }}
              attachments={[`Relieving letter ${name}.pdf`]}
              setup={setup}
              admin
              hint={e.personalEmail ? "Goes to their personal email, since their work email may be closed." : "No personal email on their profile, so this goes to their work email."}
            />
          )}
          <EmailHistory emails={emails} />
        </div>
      )}
    </>
  );
}

function SettlementTable({
  amounts,
  exit,
}: {
  amounts: ReturnType<typeof settlementAmounts>;
  exit: { encashDays: unknown; noticePayDays: unknown; recoveryDays: unknown; recoveriesNote: string | null };
}) {
  const rows: [string, number, "+" | "−"][] = [
    [`Leave paid out (${Number(exit.encashDays)} days)`, amounts.leaveEncashment, "+"],
    [`Paid in lieu of notice (${Number(exit.noticePayDays)} days)`, amounts.noticePay, "+"],
    ["Gratuity", amounts.gratuity, "+"],
    [`Notice not served (${Number(exit.recoveryDays)} days)`, amounts.noticeRecovery, "−"],
    [`Recoveries${exit.recoveriesNote ? `: ${exit.recoveriesNote}` : ""}`, amounts.exitRecovery, "−"],
  ];
  const shown = rows.filter(([, v]) => v > 0);
  return (
    <table className="table max-w-md">
      <tbody>
        {shown.length === 0 && (
          <tr>
            <td className="text-slate-500">Nothing on top of the last salary.</td>
          </tr>
        )}
        {shown.map(([k, v, sign]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className={`text-right ${sign === "−" ? "text-red-700" : ""}`}>
              {sign === "−" ? "− " : ""}
              {formatINR(v)}
            </td>
          </tr>
        ))}
        {shown.length > 0 && (
          <tr className="font-semibold">
            <td>Settlement on top of the last salary</td>
            <td className="text-right">{amounts.net < 0 ? `− ${formatINR(-amounts.net)}` : formatINR(amounts.net)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
