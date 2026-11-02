import "server-only";
/*
 * Payment reminders to schools: the one a person sends from Billing → Payments due, and the daily
 * automatic round an admin can switch on in Admin → Settings → Email.
 *
 * The automatic round runs once a working day from 10 AM India time (see reminder-rules.ts). On the
 * office computer a timer started from src/instrumentation.ts checks every 15 minutes; on Vercel the
 * cron in vercel.json calls /api/cron/payment-reminders. Either way the day is claimed in the
 * database first, so two copies of the app can't both send it.
 */
import { db } from "./db";
import { getSettings, thisCompany, type Settings } from "./settings";
import { currentCompanyId, forEachCompany } from "./company";
import { mailSetup, sendEmail, type Attachment } from "./mail";
import { invoicePdf } from "./pdf";
import { settledAmount } from "./invoices";
import { invoiceMoney } from "./credit-notes";
import { reminderEmail } from "./email-templates";
import { todayIST } from "./time";
import { reportServerError } from "./telemetry";
import { indiaClock, planRound, planSchool, roundDue, type ReminderSettings, type SchoolFacts, type SchoolPlan } from "./reminder-rules";

const DAY = 24 * 3600 * 1000;

export function reminderSettings(s: Settings): ReminderSettings {
  return { afterDays: s.autoReminderAfterDays, everyDays: s.autoReminderEveryDays, maxPerInvoice: s.autoReminderMaxPerInvoice };
}

/** Each school owing money, with what the reminder rules need to know about it. */
export async function schoolReminderFacts(organizationIds?: string[]): Promise<SchoolFacts[]> {
  const invoices = await db.invoice.findMany({
    where: { status: "ISSUED", ...(organizationIds ? { organizationId: { in: organizationIds } } : {}) },
    include: {
      payments: { select: { amount: true, tds: true } },
      creditNotes: { select: { status: true, total: true, refundAmount: true } },
      contact: { select: { email: true } },
      organization: { select: { id: true, email: true, autoRemindersPausedAt: true } },
      emails: { where: { status: "SENT", kind: "PAYMENT_REMINDER" }, select: { createdAt: true, automatic: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const today = todayIST();
  const schools = new Map<string, SchoolFacts & { contactEmail: string | null }>();
  for (const inv of invoices) {
    const balance = invoiceMoney(inv.total, settledAmount(inv.payments), inv.creditNotes).balance;
    if (balance <= 0) continue;
    const row = schools.get(inv.organizationId) ?? {
      id: inv.organizationId,
      paused: !!inv.organization.autoRemindersPausedAt,
      email: null,
      contactEmail: null,
      lastReminder: null,
      invoices: [],
    };
    // Same address as a reminder sent by hand: the overdue invoices' contact, else the school's own.
    if (inv.dueDate < today && inv.contact?.email) row.contactEmail ??= inv.contact.email;
    row.email = row.contactEmail ?? inv.organization.email;
    for (const e of inv.emails) if (!row.lastReminder || e.createdAt > row.lastReminder) row.lastReminder = e.createdAt;
    row.invoices.push({ id: inv.id, dueDate: inv.dueDate, balance, autoReminders: inv.emails.filter((e) => e.automatic).length });
    schools.set(inv.organizationId, row);
  }
  return [...schools.values()];
}

/** Where each school stands with automatic reminders, for the Payments due page. */
export async function schoolReminderPlans(): Promise<Map<string, SchoolPlan>> {
  const s = await getSettings();
  const today = todayIST();
  return new Map((await schoolReminderFacts()).map((f) => [f.id, planSchool(f, today, reminderSettings(s))]));
}

/**
 * One reminder to a school listing its overdue invoices (or the ones given), with copies attached.
 * Goes to the invoice contact's email, else the school's. userId is null for the automatic round.
 */
export async function sendSchoolReminder(
  organizationId: string,
  settings: Settings,
  sender: { userId: string; name: string } | null,
  onlyInvoiceIds?: string[],
): Promise<{ ok: string } | { error: string }> {
  const today = todayIST();
  const [org, invoices] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { email: true } }),
    db.invoice.findMany({
      where: { organizationId, status: "ISSUED", dueDate: { lt: today }, ...(onlyInvoiceIds ? { id: { in: onlyInvoiceIds } } : {}) },
      include: { payments: true, creditNotes: true, contact: { select: { name: true, email: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const overdue = invoices
    .map((i) => ({ ...i, number: i.number!, balance: invoiceMoney(i.total, settledAmount(i.payments), i.creditNotes).balance }))
    .filter((i) => i.balance > 0)
    .map((i) => ({ ...i, daysLate: Math.round((today.getTime() - i.dueDate.getTime()) / DAY) }));
  if (overdue.length === 0) return { error: "Nothing from this school is overdue now." };
  const contact = overdue.find((i) => i.contact?.email)?.contact ?? null;
  const to = contact?.email ?? org.email;
  if (!to) return { error: "There's no email address for this school or its invoice contact. Add one in CRM first." };
  // An automatic reminder is signed by the accounts team rather than by a person who didn't write it.
  const draft = reminderEmail(overdue, contact?.name ?? null, sender?.name ?? "Accounts team", settings);
  const attachments = (await Promise.all(overdue.map((i) => invoicePdf(i.id)))).filter((a): a is Attachment => !!a);
  const result = await sendEmail(
    { kind: "PAYMENT_REMINDER", to: [to], ...draft, attachments, automatic: !sender, links: { invoiceIds: overdue.map((i) => i.id) } },
    settings,
    sender?.userId ?? null,
  );
  return "error" in result ? result : { ok: `Reminder sent to ${to}.` };
}

/** A working day for the office: not a weekly off and not a (non-restricted) holiday. */
async function dayOffChecker(s: Settings) {
  const today = todayIST();
  const holidays = await db.holiday.findMany({ where: { optional: false, date: { gte: new Date(today.getTime() - DAY), lte: new Date(today.getTime() + DAY) } } });
  const off = new Set(holidays.map((h) => h.date.getTime()));
  return (day: Date) => s.weeklyOffDays.includes(day.getUTCDay()) || off.has(day.getTime());
}

export type RoundResult = { ran: false; why: string } | { ran: true; sent: number; failed: number; stopped: string | null };

const RETRY_AFTER_FAILURE = 60 * 60 * 1000;
const lastAccountFailure = new Map<string, number>(); // per company, as each has its own mail account

/** Sends today's automatic reminders if they are due and haven't gone out yet. Safe to call as often as you like. */
export async function runReminderRound(now = new Date()): Promise<RoundResult> {
  const s = await getSettings();
  if (!s.autoRemindersEnabled) return { ran: false, why: "Automatic reminders are off." };
  if (mailSetup(s) !== "READY") return { ran: false, why: "The mail account hasn't passed a test email." };
  if (!roundDue(now, s.autoReminderLastRunOn, await dayOffChecker(s))) return { ran: false, why: "Not due now." };
  const companyId = await currentCompanyId();
  if (Date.now() - (lastAccountFailure.get(companyId) ?? 0) < RETRY_AFTER_FAILURE) return { ran: false, why: "Waiting after a mail account failure." };

  const day = indiaClock(now).day;
  // Claim the day before sending anything, so a second copy of the app (or a second cron call) finds it taken.
  const claimed = await db.companySettings.updateMany({
    where: { OR: [{ autoReminderLastRunOn: null }, { autoReminderLastRunOn: { lt: day } }] },
    data: { autoReminderLastRunOn: day },
  });
  if (claimed.count === 0) return { ran: false, why: "Already sent today." };

  const plans = planRound(await schoolReminderFacts(), day, reminderSettings(s));
  let sent = 0;
  const failed: string[] = [];
  let stopped: string | null = null;
  for (const p of plans) {
    const result = await sendSchoolReminder(p.id, s, null, p.invoiceIds).catch((e) => {
      reportServerError(e);
      return { error: "The reminder could not be put together." };
    });
    if ("ok" in result) {
      sent++;
      continue;
    }
    failed.push(p.id);
    // A wrong password or unreachable server fails every one the same way: stop, and try the day again later.
    if (/password|reach/.test(result.error)) {
      stopped = result.error;
      break;
    }
  }
  if (stopped && sent === 0) {
    lastAccountFailure.set(companyId, Date.now());
    await db.companySettings.update({ where: await thisCompany(), data: { autoReminderLastRunOn: s.autoReminderLastRunOn } });
  }

  if (plans.length > 0) {
    const names = failed.length
      ? (await db.organization.findMany({ where: { id: { in: failed } }, select: { name: true } })).map((o) => o.name).join(", ")
      : "";
    const summary = [
      `Automatic payment reminders: ${sent} sent`,
      failed.length ? `, not sent to ${names}` : "",
      stopped ? `. Stopped: ${stopped}${sent === 0 ? " Will try again in an hour." : ""}` : "",
    ].join("");
    await db.activityLog.create({ data: { area: "MONEY", action: "reminders.automatic", summary: summary.slice(0, 500) } }).catch(() => {});
  }
  return { ran: true, sent, failed: failed.length, stopped };
}

/** The daily round for every company in the group, each with its own settings and mail account. */
export function runReminderRounds(now = new Date()) {
  return forEachCompany(() => runReminderRound(now));
}

/** Checks every 15 minutes whether today's reminders are due. Started once, from src/instrumentation.ts. */
export function startReminderScheduler() {
  const g = globalThis as unknown as { reminderScheduler?: NodeJS.Timeout };
  if (g.reminderScheduler) return;
  const safeTick = () => runReminderRounds().catch((e) => console.error("Payment reminder round failed", e));
  setTimeout(safeTick, 2 * 60 * 1000).unref();
  g.reminderScheduler = setInterval(safeTick, 15 * 60 * 1000);
  g.reminderScheduler.unref();
}
