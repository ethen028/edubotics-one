import type { PlanMetricKind, PlanTaskStatus, Rag } from "@prisma/client";

/**
 * The company's operating calendar for June 2026 – May 2027, as given in
 * "Edubotics_Global_Operational_Calendar_Jun2026_May2027.xlsx" (sheet "Annual Plan"). Loaded into the
 * Annual plan once, from Admin or by the starting-data script; after that it is edited in the app.
 */
export type CalendarMonth = {
  month: string; // yyyy-mm
  planningMeeting: string; // yyyy-mm-dd (1st working day, 10 am)
  focus: string;
  activities: string[];
  targets: string | null;
  leads: string;
  review: string | null;
  metrics: { kind: PlanMetricKind; label: string; target: number }[];
};

export const OPERATING_CALENDAR: CalendarMonth[] = [
  {
    month: "2026-06",
    planningMeeting: "2026-06-01",
    focus: "Start of operating year: internships",
    activities: [
      "Confirm internship partner colleges",
      "Onboard and train internship students (Python, AIoT)",
      "Get trainers, lab and kits ready",
    ],
    targets: "50 internship students\n25 leads · 20 meetings",
    leads: "Ashima, Yaseen",
    review: null,
    metrics: [
      { kind: "INTERNSHIP_STUDENTS", label: "Internship students", target: 50 },
      { kind: "LEADS", label: "New leads", target: 25 },
      { kind: "MEETINGS", label: "Meetings", target: 20 },
    ],
  },
  {
    month: "2026-07",
    planningMeeting: "2026-07-01",
    focus: "Internship delivery",
    activities: [
      "Run internship batches and mini-projects",
      "Check attendance and progress weekly",
      "Close the batch: assessment, feedback, certificates",
    ],
    targets: "80% attendance\n90% completion",
    leads: "Ashima",
    review: null,
    metrics: [
      { kind: "CUSTOM", label: "Internship attendance (%)", target: 80 },
      { kind: "CUSTOM", label: "Internship completion (%)", target: 90 },
    ],
  },
  {
    month: "2026-08",
    planningMeeting: "2026-08-01",
    focus: "Software development",
    activities: ["Plan the Opsora / HRMS sprint", "Build the core modules", "Test (QA) and make product demo content"],
    targets: "5 development milestones",
    leads: "Ashima, Yaseen",
    review: null,
    metrics: [{ kind: "CUSTOM", label: "Development milestones", target: 5 }],
  },
  {
    month: "2026-09",
    planningMeeting: "2026-09-01",
    focus: "Software portfolio and review",
    activities: ["Workora, Opsora, Dashboard, Project Management and Daily Worksheet apps", "Monthly KPI and risk review"],
    targets: null,
    leads: "Yaseen",
    review: "Result: 5 of 5 activities done · 3 of 5 milestones\nRevenue ₹12,000 workshops + ₹5,000 internships",
    metrics: [],
  },
  {
    month: "2026-10",
    planningMeeting: "2026-10-01",
    focus: "College projects and workshops · SOP v2 starts",
    activities: [
      "Start SOP v2; every employee signs it",
      "Final-year project campaign (reels) and consultations",
      "Visit colleges to book one-day workshops",
      "Freeze project scope and order components",
      "Prepare school lead list, proposal kit and demo kits",
    ],
    targets: "600 workshop students\n30 college projects\n25 leads · 20 meetings · 2 conversions\nCash at least ₹86,500",
    leads: "Mehdi, Dilshad, Yaseen",
    review: null,
    metrics: [
      { kind: "WORKSHOP_STUDENTS", label: "Workshop students", target: 600 },
      { kind: "COLLEGE_PROJECTS", label: "College projects", target: 30 },
      { kind: "LEADS", label: "New leads", target: 25 },
      { kind: "MEETINGS", label: "Meetings", target: 20 },
      { kind: "CONVERSIONS", label: "Conversions", target: 2 },
      { kind: "RECEIVED", label: "Cash received (₹)", target: 86500 },
    ],
  },
  {
    month: "2026-11",
    planningMeeting: "2026-11-02",
    focus: "Project sales and school campaign",
    activities: [
      "Close project quotations and collect advances",
      "School lead campaign and demos",
      "Demo our software products to clients",
      "First 5% commission statement",
    ],
    targets: "50 leads · 30 meetings · 5 conversions\n600 workshop students",
    leads: "Mehdi, Jeffin",
    review: null,
    metrics: [
      { kind: "LEADS", label: "New leads", target: 50 },
      { kind: "MEETINGS", label: "Meetings", target: 30 },
      { kind: "CONVERSIONS", label: "Conversions", target: 5 },
      { kind: "WORKSHOP_STUDENTS", label: "Workshop students", target: 600 },
    ],
  },
  {
    month: "2026-12",
    planningMeeting: "2026-12-01",
    focus: "Close all projects · start school visits",
    activities: ["Close all college projects by 31 Dec", "Project reviews and handover", "School visits, demos and proposals"],
    targets: "₹10 lakh project revenue\n10 school proposals\n600 workshop students",
    leads: "Mehdi, Dilshad",
    review: null,
    metrics: [
      { kind: "INVOICED", label: "Project revenue invoiced (₹)", target: 1000000 },
      { kind: "SCHOOL_PROPOSALS", label: "School proposals", target: 10 },
      { kind: "WORKSHOP_STUDENTS", label: "Workshop students", target: 600 },
    ],
  },
  {
    month: "2027-01",
    planningMeeting: "2027-01-01",
    focus: "School closing month",
    activities: ["Meet priority schools, negotiate and sign", "Plan onboarding for signed schools"],
    targets: "Most of the ₹20 lakh school target\n5 conversions",
    leads: "Mehdi",
    review: null,
    metrics: [{ kind: "CONVERSIONS", label: "School conversions", target: 5 }],
  },
  {
    month: "2027-02",
    planningMeeting: "2027-02-01",
    focus: "Finish school deals · prepare next year",
    activities: [
      "Close the remaining schools",
      "Admission and pre-booking campaign",
      "Plan trainer recruitment",
      "Update the curriculum",
    ],
    targets: "Rest of the school target\n5 conversions",
    leads: "Mehdi, Ashima, Yaseen",
    review: null,
    metrics: [{ kind: "CONVERSIONS", label: "School conversions", target: 5 }],
  },
  {
    month: "2027-03",
    planningMeeting: "2027-03-01",
    focus: "Supply and year end",
    activities: [
      "Deliver textbooks and kits to schools",
      "Collect payments",
      "Close the financial year (31 March)",
      "Approve next year's plan and budget; staff appraisals",
    ],
    targets: "All signed schools supplied\nPayments collected",
    leads: "Dilshad, Yaseen",
    review: null,
    metrics: [],
  },
  {
    month: "2027-04",
    planningMeeting: "2027-04-01",
    focus: "New financial year · teacher training",
    activities: ["Teacher training for new schools", "Review the SOP; staff sign again", "Publish the competition calendar"],
    targets: "5 schools trained",
    leads: "Ashima",
    review: null,
    metrics: [{ kind: "CUSTOM", label: "Schools trained", target: 5 }],
  },
  {
    month: "2027-05",
    planningMeeting: "2027-05-01",
    focus: "Get ready for June",
    activities: [
      "Continue teacher training",
      "Curriculum and kits ready",
      "Plan June internships and trainers",
      "Annual review; approve next year's calendar",
    ],
    targets: "5 schools trained\nNext calendar approved",
    leads: "Yaseen, Ashima",
    review: null,
    metrics: [{ kind: "CUSTOM", label: "Schools trained", target: 5 }],
  },
];

/** "How each month runs" (SOP v2, section 4), shown on the plan pages. */
export const MONTHLY_RHYTHM = [
  { when: "1st working day, 10 am", what: "Planning meeting. Everyone reports last month in numbers; this month's work plan is agreed.", who: "All staff. GM / COO chairs." },
  { when: "1st working day, by 6 pm", what: "Work plan entered here. Every task has an owner, deadline and target.", who: "Each lead" },
  { when: "Every Friday, by 6 pm", what: "Update progress on your tasks.", who: "Everyone" },
  { when: "Every Saturday, 10 am", what: "Weekly review. Each task is marked Green, Amber or Red, and actions are agreed.", who: "GM / COO and leads. Report ready by 9:30 am." },
  { when: "Last 2 working days", what: "Results for this month, plus a draft plan for next month.", who: "Leads" },
  { when: "By the 5th", what: "Commission statement approved (5% to the sales executive who closed the sale). Report to the CEO / Board.", who: "Sales → Sales head → GM" },
] as const;

export const RAG_RULES: Record<Rag, string> = {
  GREEN: "90% or more of the target, on time",
  AMBER: "70–89% of the target, or one deadline missed",
  RED: "Below 70%, or work overdue: written recovery plan within 48 hours",
};

export const PLAN_AREAS = ["Sales & Marketing", "Operations", "Training", "Projects", "Software", "Accounts", "HR & Admin"] as const;

const DAY = 86400000;

/** First day of the month a date falls in (UTC midnight, like DATE columns). */
export function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export function monthEnd(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** "2026-10" → 1 Oct 2026; anything else → null. */
export function parseMonth(value: string | undefined | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return new Date(`${value}-01T00:00:00Z`);
}

export const monthParam = (d: Date) => d.toISOString().slice(0, 7);
export const monthLabel = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

/** First day of the month that is not a Sunday or a holiday (the plan skips 15 Aug, 2 Oct, 25 Dec, 26 Jan). */
export function firstWorkingDay(month: Date, holidays: Date[]) {
  let d = monthStart(month);
  while (d.getUTCDay() === 0 || holidays.some((h) => sameDay(h, d))) d = new Date(d.getTime() + DAY);
  return d;
}

/** Saturdays of the month that aren't holidays: the weekly review days. */
export function reviewDays(month: Date, holidays: Date[]) {
  const out: Date[] = [];
  const end = monthEnd(month);
  for (let d = monthStart(month); d <= end; d = new Date(d.getTime() + DAY)) {
    if (d.getUTCDay() === 6 && !holidays.some((h) => sameDay(h, d))) out.push(d);
  }
  return out;
}

/** The last two working days (not Sunday, not a holiday): results and next month's draft plan. */
export function lastWorkingDays(month: Date, holidays: Date[]) {
  const out: Date[] = [];
  for (let d = monthEnd(month); out.length < 2 && d >= monthStart(month); d = new Date(d.getTime() - DAY)) {
    if (d.getUTCDay() !== 0 && !holidays.some((h) => sameDay(h, d))) out.unshift(d);
  }
  return out;
}

export type RhythmEvent = { date: Date; title: string; time?: string };

/** The fixed meetings and deadlines of a month, worked out from its dates and holidays. */
export function monthRhythm(month: Date, holidays: Date[], planningMeeting?: Date | null): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  const meeting = planningMeeting ? new Date(Date.UTC(planningMeeting.getUTCFullYear(), planningMeeting.getUTCMonth(), planningMeeting.getUTCDate())) : firstWorkingDay(month, holidays);
  events.push({ date: meeting, title: "Monthly planning meeting", time: "10:00" });
  const end = monthEnd(month);
  for (let d = monthStart(month); d <= end; d = new Date(d.getTime() + DAY)) {
    if (holidays.some((h) => sameDay(h, d))) continue;
    if (d.getUTCDay() === 5) events.push({ date: d, title: "Update your plan tasks", time: "by 18:00" });
  }
  for (const d of reviewDays(month, holidays)) events.push({ date: d, title: "Weekly review (Green / Amber / Red)", time: "10:00" });
  const fifth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 5));
  events.push({ date: fifth, title: "Commission statement due" });
  for (const d of lastWorkingDays(month, holidays)) events.push({ date: d, title: "Month results and next month's draft plan" });
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * The colour a task should have at this week's review, by the plan's rule: compare what is done with
 * what should be done by now (the target spread evenly from the 1st of the month to the deadline).
 * The reviewer can always pick another colour.
 */
export function suggestRag(
  task: { status: PlanTaskStatus; target: number | null; actual: number | null; deadline: Date | null; monthStart: Date },
  today: Date,
): Rag | null {
  if (task.status === "BLOCKED") return "RED";
  const overdue = !!task.deadline && today > task.deadline && task.status !== "DONE";
  if (task.target && task.target > 0) {
    const actual = task.actual ?? 0;
    if (actual >= task.target) return "GREEN";
    if (overdue) return actual / task.target >= 0.7 ? "AMBER" : "RED";
    let share = 1;
    if (task.deadline && task.deadline > task.monthStart) {
      share = Math.min(1, Math.max(0, (today.getTime() - task.monthStart.getTime()) / (task.deadline.getTime() - task.monthStart.getTime())));
    }
    if (share <= 0.05) return null; // too early in the month to judge
    const pace = actual / (task.target * share);
    return pace >= 0.9 ? "GREEN" : pace >= 0.7 ? "AMBER" : "RED";
  }
  if (task.status === "DONE") return "GREEN";
  if (overdue) return "RED";
  return null;
}

/** Monday of the week a date falls in. */
export function weekStart(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** A task needs its weekly update when it isn't finished and nobody has updated it since Monday. */
export function needsUpdate(task: { status: PlanTaskStatus; lastUpdateAt: Date | null }, today: Date) {
  if (task.status === "DONE") return false;
  return !task.lastUpdateAt || task.lastUpdateAt < weekStart(today);
}

export function percent(actual: number | null, target: number | null) {
  if (!target || target <= 0) return null;
  return Math.round(((actual ?? 0) / target) * 100);
}
