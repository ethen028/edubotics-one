import type { EmploymentType, LetterKind, Role } from "@prisma/client";
import { formatDate, formatINR } from "./format";

// HR letters and certificates: which ones there are, who may issue them, their numbers and their wording.
// Pure functions, so the wording can be tested without a database (tests/letters.test.ts).
// The wording is a plain-English starting point that the owner has not had checked by a lawyer yet;
// kinds marked `reviewWording` say so on the form.

export type LetterMeta = {
  label: string; // in lists and menus
  blurb: string; // one line on the issue form
  salary: boolean; // shows pay: admins only, like payroll
  numbered: boolean; // ID cards carry the employee code instead
  reviewWording: boolean; // legal or disciplinary wording the owner should have checked before first use
  needs?: "intern" | "training" | "left" | "salary" | "payslips"; // what the person must have before it can be issued
};

export const LETTER_KINDS: Record<LetterKind, LetterMeta> = {
  OFFER: { label: "Offer letter", blurb: "Made from an offer in Recruitment.", salary: true, numbered: true, reviewWording: true },
  APPOINTMENT: {
    label: "Appointment letter",
    blurb: "Terms of employment on joining: role, salary, probation, notice, hours and leave.",
    salary: true,
    numbered: true,
    reviewWording: true,
    needs: "salary",
  },
  CONFIRMATION: { label: "Confirmation letter", blurb: "Confirms the job once probation is over.", salary: false, numbered: true, reviewWording: false },
  REVISION: {
    label: "Salary revision letter",
    blurb: "A raise or promotion, from the latest salary record.",
    salary: true,
    numbered: true,
    reviewWording: false,
    needs: "salary",
  },
  EXPERIENCE: { label: "Experience certificate", blurb: "How long they have worked here and as what.", salary: false, numbered: true, reviewWording: false },
  EMPLOYMENT: {
    label: "Employment certificate",
    blurb: "Confirms they work here, for a bank, landlord or visa. Can include their address as proof. No salary.",
    salary: false,
    numbered: true,
    reviewWording: false,
  },
  SALARY_CERTIFICATE: {
    label: "Salary certificate",
    blurb: "Confirms their job and current salary, for a loan, bank or visa.",
    salary: true,
    numbered: true,
    reviewWording: false,
    needs: "salary",
  },
  NOC: { label: "No objection certificate", blurb: "The company has no objection to something they are applying for.", salary: false, numbered: true, reviewWording: true },
  WARNING: { label: "Warning letter", blurb: "A formal written warning about something that happened.", salary: false, numbered: true, reviewWording: true },
  SHOW_CAUSE: { label: "Show cause notice", blurb: "Asks them to explain something in writing by a date.", salary: false, numbered: true, reviewWording: true },
  INTERNSHIP: { label: "Internship certificate", blurb: "For a staff intern who has finished. Outside interns get workshop certificates.", salary: false, numbered: true, reviewWording: false, needs: "intern" },
  TRAINING: { label: "Training certificate", blurb: "For a training module they have completed.", salary: false, numbered: true, reviewWording: false, needs: "training" },
  RELIEVING: { label: "Relieving letter", blurb: "Relieving and experience letter once they have left.", salary: false, numbered: true, reviewWording: false, needs: "left" },
  ID_CARD: { label: "ID card", blurb: "A card to print, cut out and laminate.", salary: false, numbered: false, reviewWording: false },
  ANNUAL_STATEMENT: {
    label: "Annual salary statement",
    blurb: "Pay and deductions month by month for a financial year, from payslips. Not a Form 16.",
    salary: true,
    numbered: true,
    reviewWording: false,
    needs: "payslips",
  },
};

/** The kinds on the Issue a letter form, in the order HR meets them in someone's time here. Offers are made in Recruitment. */
export const ISSUE_ORDER: LetterKind[] = [
  "APPOINTMENT",
  "ID_CARD",
  "CONFIRMATION",
  "REVISION",
  "TRAINING",
  "EMPLOYMENT",
  "SALARY_CERTIFICATE",
  "EXPERIENCE",
  "NOC",
  "WARNING",
  "SHOW_CAUSE",
  "INTERNSHIP",
  "ANNUAL_STATEMENT",
  "RELIEVING",
];

/** Admins issue every kind; HR every kind that shows no pay (HR doesn't see salaries). */
export const canIssueKind = (role: Role, kind: LetterKind) => role === "ADMIN" || (role === "HR" && !LETTER_KINDS[kind].salary);

/** Who may open an issued letter: admins, HR for letters without pay, and the person it was issued to. */
export function canSeeLetter(
  user: { role: Role; employee?: { id: string } | null },
  letter: { kind: LetterKind; employeeId: string | null; status: string },
) {
  if (canIssueKind(user.role, letter.kind)) return true;
  return !!letter.employeeId && letter.employeeId === user.employee?.id && letter.status === "ISSUED";
}

/** EBG/HR/26-27/0001: one series for every HR letter, restarting each April like invoices. */
export function letterNumber(prefix: string, fy: string, seq: number) {
  return `${prefix}/HR/${fy}/${String(seq).padStart(4, "0")}`;
}

// ─── The finished letter ───────────────────────────────────────────────────

export type Table = { head?: string[]; rows: string[][]; foot?: string[]; numeric?: number[] }; // numeric: columns aligned right
export type Block = { p: string } | { table: Table } | { heading: string };

export type IdCard = {
  name: string;
  code: string;
  designation: string;
  department: string | null;
  bloodGroup: string | null;
  emergency: string | null;
  phone: string | null;
  joined: string;
};

export type LetterBody = {
  title: string;
  to: string[]; // addressee lines under the date
  salutation: string | null;
  subject: string | null;
  blocks: Block[];
  signatory: { name: string | null; title: string | null };
  ack: string | null; // a line for the person to sign that they received or accept it
  note: string | null; // small print above the footer
  card?: IdCard;
};

// ─── Facts the wording is made from ────────────────────────────────────────

export type Person = {
  name: string;
  firstName: string;
  code: string;
  designation: string;
  department: string | null;
  manager: string | null;
  joined: Date;
  exited: Date | null;
  employmentType: EmploymentType;
  address: string | null; // one line
};

export type Salary = { basic: number; hra: number; specialAllowance: number };
export type Signatory = { name: string | null; title: string | null };

const BASIS: Record<EmploymentType, string> = {
  FULL_TIME: "on a full-time basis",
  PART_TIME: "on a part-time basis",
  CONTRACT: "on a contract basis",
  INTERN: "as an intern",
};

/** "a", "a and b", "a, b and c". */
export function joinWords(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** 540 → "9 hours", 510 → "8 hours 30 minutes". */
export function hoursText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minutes` : ""].filter(Boolean).join(" ");
}

/** Monday 1 Feb + 6 months, kept inside short months (31 Aug + 6 months = 28 Feb). */
export function addMonths(d: Date, n: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const role = (p: Person) => `${p.designation}${p.department ? `, ${p.department}` : ""}`;
const monthly = (s: Salary) => s.basic + s.hra + s.specialAllowance;

/** Basic, HRA, special allowance, then the month and year totals. */
export function salaryTable(s: Salary, word = "Gross"): Table {
  return {
    head: ["Component", "Per month"],
    rows: [
      ["Basic", formatINR(s.basic)],
      ["House rent allowance", formatINR(s.hra)],
      ["Special allowance", formatINR(s.specialAllowance)],
      [`${word} per month`, formatINR(monthly(s))],
    ],
    foot: [`${word} per year`, formatINR(monthly(s) * 12)],
    numeric: [1],
  };
}

const toWhom = { to: [] as string[], salutation: "To whom it may concern," };
const dear = (p: { firstName: string }) => `Dear ${p.firstName},`;
const addressee = (p: Person) => [p.name, `${p.designation}, employee code ${p.code}`];
/** Lines typed in a "To" box, or "To whom it may concern" when it was left empty. */
function typedTo(to: string | null | undefined) {
  const lines = (to ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? { to: lines, salutation: "Dear Sir or Madam," } : toWhom;
}
const base = (signatory: Signatory) => ({ subject: null, ack: null, note: null, signatory });

// ─── Each kind's wording ───────────────────────────────────────────────────

export type OfferFacts = {
  candidate: string;
  city: string | null;
  email: string | null;
  designation: string;
  department: string | null;
  manager: string | null;
  employmentType: EmploymentType;
  joining: Date;
  respondBy: Date | null;
  probationMonths: number;
  notes: string | null;
  salary: Salary;
};

export function offerLetter(f: OfferFacts, company: string, signatory: Signatory): LetterBody {
  const first = f.candidate.trim().split(/\s+/)[0];
  const intern = f.employmentType === "INTERN";
  const blocks: Block[] = [
    {
      p: `We are happy to offer you the position of ${f.designation}${f.department ? ` in our ${f.department} team` : ""} at ${company}, ${BASIS[f.employmentType]}. Your date of joining will be ${formatDate(f.joining)}${f.manager ? `, and you will report to ${f.manager}` : ""}.`,
    },
    { p: intern ? "Your monthly stipend will be:" : "Your monthly salary will be:" },
    { table: salaryTable(f.salary, intern ? "Stipend" : "Gross") },
  ];
  if (f.probationMonths > 0 && !intern) blocks.push({ p: `You will be on probation for the first ${f.probationMonths} months, after which your role will be confirmed in writing.` });
  if (f.notes) blocks.push({ p: f.notes });
  blocks.push({ p: "On your first day, please bring your Aadhaar or another ID proof, your PAN card, your bank details and your educational certificates." });
  if (f.respondBy) blocks.push({ p: `Please confirm your acceptance by ${formatDate(f.respondBy)}.` });
  blocks.push({ p: "We look forward to having you with us." });
  return {
    ...base(signatory),
    title: intern ? "Internship offer" : "Offer of employment",
    to: [f.candidate, f.city, f.email].filter((v): v is string => !!v),
    salutation: `Dear ${first},`,
    blocks,
    ack: `I accept this offer on the terms above.`,
  };
}

export type AppointmentTerms = {
  probationMonths: number;
  probationNoticeDays: number;
  noticeDays: number;
  workMinutesPerDay: number;
  weeklyOffs: string[]; // day names
  leave: { name: string; days: number }[];
  placeOfWork: string;
  extraTerms: string | null;
};

export function appointmentLetter(p: Person, s: Salary, t: AppointmentTerms, company: string, signatory: Signatory): LetterBody {
  const intern = p.employmentType === "INTERN";
  const pay = intern ? "stipend" : "salary";
  const blocks: Block[] = [
    {
      p: `Further to your acceptance of our offer, we are pleased to appoint you as ${p.designation}${p.department ? ` in the ${p.department} team` : ""} at ${company}, ${BASIS[p.employmentType]}, with effect from ${formatDate(p.joined)}.${p.manager ? ` You will report to ${p.manager}.` : ""} The terms of your appointment are set out below.`,
    },
    { heading: "Place of work" },
    { p: t.placeOfWork },
    { heading: intern ? "Stipend" : "Salary" },
    { p: `Your monthly ${pay} is as below. It is paid each month into your bank account, after any deductions required by law.` },
    { table: salaryTable(s, intern ? "Stipend" : "Gross") },
  ];
  if (t.probationMonths > 0) {
    blocks.push(
      { heading: "Probation" },
      {
        p: `You will be on probation for ${t.probationMonths} months from your date of joining, until ${formatDate(addDays(addMonths(p.joined, t.probationMonths), -1))}. Your employment will be confirmed in writing once you complete it satisfactorily. The company may extend the probation, and will tell you in writing if it does.`,
      },
    );
  }
  blocks.push(
    { heading: "Notice period" },
    {
      p:
        t.probationMonths > 0
          ? `During probation, either you or the company may end your employment by giving ${t.probationNoticeDays} days' notice in writing. Once you are confirmed, the notice period is ${t.noticeDays} days from either side.`
          : `Either you or the company may end your employment by giving ${t.noticeDays} days' notice in writing.`,
    },
    { heading: "Working hours" },
    {
      p: `Your working day is ${hoursText(t.workMinutesPerDay)}${t.weeklyOffs.length ? `, and ${joinWords(t.weeklyOffs)} ${t.weeklyOffs.length === 1 ? "is a weekly off" : "are weekly offs"}` : ""}. Holidays follow the company's holiday list for the year.`,
    },
  );
  if (t.leave.length) {
    blocks.push(
      { heading: "Leave" },
      { p: `You get ${joinWords(t.leave.map((l) => `${l.days} ${l.days === 1 ? "day" : "days"} of ${l.name.toLowerCase()}`))} in each calendar year, as set out in the company's leave policy.` },
    );
  }
  blocks.push(
    { heading: "Confidentiality" },
    { p: "You will keep confidential any information about the company, its clients, schools and students that you come to know through your work, both during your employment and after it ends." },
    { heading: "Company policies" },
    { p: "You will follow the company's rules and policies as they stand and as they are updated from time to time." },
  );
  if (t.extraTerms) blocks.push({ heading: "Other terms" }, { p: t.extraTerms });
  blocks.push({ p: "Please sign the copy of this letter to confirm that you accept these terms. We wish you a long and rewarding career with us." });
  return {
    ...base(signatory),
    title: "Appointment letter",
    to: addressee(p),
    salutation: dear(p),
    subject: `Appointment as ${p.designation}`,
    blocks,
    ack: "I have read and accept the terms of this appointment.",
  };
}

export function confirmationLetter(p: Person, f: { effective: Date; noticeDays: number }, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "Confirmation of employment",
    to: addressee(p),
    salutation: dear(p),
    subject: "Confirmation after probation",
    blocks: [
      { p: `We are pleased to tell you that you have completed your probation. Your employment as ${role(p)} is confirmed with effect from ${formatDate(f.effective)}.` },
      { p: `From this date, the notice period to end your employment is ${f.noticeDays} days from either side. All other terms of your appointment stay the same.` },
      { p: "Thank you for your work so far. We look forward to your continued contribution." },
    ],
  };
}

export function revisionLetter(
  p: Person,
  f: { effective: Date; previous: Salary | null; revised: Salary; newDesignation: string | null },
  signatory: Signatory,
): LetterBody {
  const rows: [string, keyof Salary][] = [
    ["Basic", "basic"],
    ["House rent allowance", "hra"],
    ["Special allowance", "specialAllowance"],
  ];
  const table: Table = f.previous
    ? {
        head: ["Component", "Before", "Revised"],
        rows: [...rows.map(([label, k]) => [label, formatINR(f.previous![k]), formatINR(f.revised[k])]), ["Gross per month", formatINR(monthly(f.previous)), formatINR(monthly(f.revised))]],
        foot: ["Gross per year", formatINR(monthly(f.previous) * 12), formatINR(monthly(f.revised) * 12)],
        numeric: [1, 2],
      }
    : salaryTable(f.revised);
  const promoted = f.newDesignation && f.newDesignation !== p.designation ? f.newDesignation : null;
  return {
    ...base(signatory),
    title: promoted ? "Promotion and salary revision" : "Salary revision letter",
    to: addressee(p),
    salutation: dear(p),
    subject: promoted ? `Promotion to ${promoted}` : "Revision of salary",
    blocks: [
      {
        p: promoted
          ? `We are pleased to tell you that you have been promoted to ${promoted}, and that your monthly salary has been revised, with effect from ${formatDate(f.effective)}.`
          : `We are pleased to tell you that your monthly salary has been revised with effect from ${formatDate(f.effective)}.`,
      },
      { table },
      { p: "All other terms of your employment stay the same. Thank you for your contribution, and we wish you continued success." },
    ],
  };
}

export function experienceCertificate(p: Person, f: { conduct: boolean }, company: string, signatory: Signatory): LetterBody {
  const blocks: Block[] = [
    {
      p: p.exited
        ? `This is to certify that ${p.name} (employee code ${p.code}) worked with ${company} as ${role(p)} from ${formatDate(p.joined)} to ${formatDate(p.exited)}.`
        : `This is to certify that ${p.name} (employee code ${p.code}) has been working with ${company} as ${role(p)} since ${formatDate(p.joined)}.`,
    },
  ];
  if (f.conduct) blocks.push({ p: `During this time we found ${p.firstName}'s work and conduct to be good.` });
  blocks.push({ p: `This certificate is issued at ${p.firstName}'s request.` });
  return { ...base(signatory), title: "Experience certificate", ...toWhom, blocks };
}

export function employmentCertificate(p: Person, f: { to: string | null; purpose: string | null; includeAddress: boolean }, company: string, signatory: Signatory): LetterBody {
  const blocks: Block[] = [
    { p: `This is to certify that ${p.name} (employee code ${p.code}) is employed with ${company} as ${role(p)} since ${formatDate(p.joined)}, ${BASIS[p.employmentType]}.` },
  ];
  if (f.includeAddress && p.address) blocks.push({ p: `As per our records, ${p.firstName}'s address is ${p.address}.` });
  blocks.push({ p: f.purpose ? `This certificate is issued at ${p.firstName}'s request for ${f.purpose}.` : `This certificate is issued at ${p.firstName}'s request.` });
  return { ...base(signatory), title: "Employment certificate", ...typedTo(f.to), blocks };
}

export function salaryCertificate(p: Person, f: { to: string | null; purpose: string | null; salary: Salary }, company: string, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "Salary certificate",
    ...typedTo(f.to),
    blocks: [
      { p: `This is to certify that ${p.name} (employee code ${p.code}) is employed with ${company} as ${role(p)} since ${formatDate(p.joined)}, ${BASIS[p.employmentType]}.` },
      { p: `${p.firstName}'s current monthly salary is as below. Deductions required by law are taken from it.` },
      { table: salaryTable(f.salary) },
      { p: f.purpose ? `This certificate is issued at ${p.firstName}'s request for ${f.purpose}.` : `This certificate is issued at ${p.firstName}'s request.` },
    ],
  };
}

export function noObjectionCertificate(p: Person, f: { to: string | null; purpose: string }, company: string, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "No objection certificate",
    ...typedTo(f.to),
    blocks: [
      { p: `This is to certify that ${p.name} (employee code ${p.code}) is employed with ${company} as ${role(p)} since ${formatDate(p.joined)}.` },
      { p: `The company has no objection to ${p.firstName} ${f.purpose.replace(/\.$/, "")}.` },
      { p: `This certificate is issued at ${p.firstName}'s request and does not change the terms of ${p.firstName}'s employment with the company.` },
    ],
  };
}

export function warningLetter(p: Person, f: { subject: string; details: string; expected: string | null }, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "Warning letter",
    to: addressee(p),
    salutation: dear(p),
    subject: f.subject,
    blocks: [
      { p: "This letter is a formal written warning about the following:" },
      { p: f.details },
      { p: f.expected ?? "We expect you to make sure this does not happen again." },
      { p: "If it happens again, the company may take further action in line with its policies. If you would like to talk about this letter, please speak to HR." },
    ],
    ack: "I have received a copy of this letter.",
  };
}

export function showCauseNotice(p: Person, f: { subject: string; details: string; replyDays: number; issuedOn: Date }, signatory: Signatory): LetterBody {
  const by = addDays(f.issuedOn, f.replyDays);
  return {
    ...base(signatory),
    title: "Show cause notice",
    to: addressee(p),
    salutation: dear(p),
    subject: f.subject,
    blocks: [
      { p: "It has been brought to the company's attention that:" },
      { p: f.details },
      {
        p: `Please explain in writing, within ${f.replyDays} days of receiving this notice and no later than ${formatDate(by)}, why the company should not take disciplinary action against you in this matter.`,
      },
      { p: "If we do not receive your reply by then, the company will decide the matter on the facts available to it." },
    ],
    ack: "I have received a copy of this notice.",
  };
}

export function internshipCertificate(p: Person, f: { from: Date; to: Date; project: string | null; conduct: boolean }, company: string, signatory: Signatory): LetterBody {
  const blocks: Block[] = [
    { p: `This is to certify that ${p.name} completed an internship with ${company} as ${role(p)} from ${formatDate(f.from)} to ${formatDate(f.to)}.` },
  ];
  if (f.project) blocks.push({ p: `During the internship, ${p.firstName} worked on ${f.project.replace(/\.$/, "")}.` });
  if (f.conduct) blocks.push({ p: `We found ${p.firstName} sincere and hardworking, and wish ${p.firstName} every success.` });
  else blocks.push({ p: `We wish ${p.firstName} every success.` });
  return { ...base(signatory), title: "Internship certificate", ...toWhom, blocks };
}

export function trainingCertificate(p: Person, f: { module: string; description: string | null; completed: Date }, company: string, signatory: Signatory): LetterBody {
  const blocks: Block[] = [
    { p: `This is to certify that ${p.name} (${role(p)}) has completed the training “${f.module}” at ${company} on ${formatDate(f.completed)}.` },
  ];
  if (f.description) blocks.push({ p: `The training covered ${f.description.charAt(0).toLowerCase()}${f.description.slice(1).replace(/\.$/, "")}.` });
  return { ...base(signatory), title: "Training certificate", ...toWhom, blocks };
}

export function relievingLetter(p: Person & { exited: Date }, f: { resigned: boolean }, company: string, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "Relieving and experience letter",
    ...toWhom,
    blocks: [
      { p: `This is to certify that ${p.name} (employee code ${p.code}) worked with ${company} as ${role(p)} from ${formatDate(p.joined)} to ${formatDate(p.exited)}.` },
      {
        p: f.resigned
          ? `${p.firstName} resigned from the company and has been relieved of all duties with effect from the close of working hours on ${formatDate(p.exited)}.`
          : `${p.firstName} has been relieved of all duties with effect from the close of working hours on ${formatDate(p.exited)}.`,
      },
      { p: `We thank ${p.firstName} for the contribution made during this time and wish ${p.firstName} every success in the future.` },
    ],
  };
}

export function idCard(p: Person, f: { bloodGroup: string | null; emergency: string | null; phone: string | null }, signatory: Signatory): LetterBody {
  return {
    ...base(signatory),
    title: "Identity card",
    to: [],
    salutation: null,
    blocks: [],
    card: {
      name: p.name,
      code: p.code,
      designation: p.designation,
      department: p.department,
      bloodGroup: f.bloodGroup,
      emergency: f.emergency,
      phone: f.phone,
      joined: formatDate(p.joined),
    },
  };
}

// ─── Annual salary statement ───────────────────────────────────────────────

export type StatementSlip = {
  month: string; // "2026-04"
  gross: number;
  lopDeduction: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  totalDeductions: number;
  net: number;
  reimbursements: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** "26-27" → April 2026 to March 2027, as "2026-04" … "2027-03". */
export function fyMonthsOf(fy: string) {
  const start = 2000 + Number(fy.slice(0, 2));
  return Array.from({ length: 12 }, (_, i) => {
    const y = start + (i >= 9 ? 1 : 0);
    return `${y}-${String(((i + 3) % 12) + 1).padStart(2, "0")}`;
  });
}

/**
 * Month by month pay for a financial year. Net salary leaves out expense claims paid back with it,
 * which are not salary. "Other" holds every other deduction, including final-settlement recoveries.
 */
export function statementTable(slips: StatementSlip[]): Table {
  const cols = (s: StatementSlip) => {
    const other = s.totalDeductions - s.lopDeduction - s.pf - s.esi - s.professionalTax - s.tds;
    return [s.gross, s.lopDeduction, s.pf, s.esi, s.professionalTax, s.tds, other, s.net - s.reimbursements];
  };
  const sorted = [...slips].sort((a, b) => a.month.localeCompare(b.month));
  const totals = sorted.reduce((sum, s) => cols(s).map((v, i) => sum[i] + v), [0, 0, 0, 0, 0, 0, 0, 0]);
  const money = (v: number) => (Math.abs(v) < 0.005 ? "–" : formatINR(v));
  return {
    head: ["Month", "Gross", "Loss of pay", "PF", "ESI", "Prof. tax", "TDS", "Other", "Net salary"],
    rows: sorted.map((s) => [monthShort(s.month), ...cols(s).map(money)]),
    foot: ["Total", ...totals.map(money)],
    numeric: [1, 2, 3, 4, 5, 6, 7, 8],
  };
}

export function annualStatement(p: Person, f: { fy: string; pan: string | null; slips: StatementSlip[] }, company: string, signatory: Signatory): LetterBody {
  const months = fyMonthsOf(f.fy);
  return {
    ...base(signatory),
    title: "Annual salary statement",
    to: [p.name, `${p.designation}, employee code ${p.code}`, ...(f.pan ? [`PAN ${f.pan}`] : [])],
    salutation: null,
    subject: `Financial year 20${f.fy.replace("-", "–")} (${monthShort(months[0])} to ${monthShort(months[11])})`,
    blocks: [
      { p: `Salary paid by ${company} to ${p.name} in the financial year, from the payroll records:` },
      { table: statementTable(f.slips) },
    ],
    note: "This statement is drawn from the company's payroll. It is not a Form 16: Form 16 is the TDS certificate downloaded from the income tax TRACES portal when tax has been deducted at source.",
  };
}

// ─── The issue form ────────────────────────────────────────────────────────

export type FormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select" | "checkbox";
  required?: boolean;
  hint?: string;
  value: string; // starting value; "on" ticks a checkbox
  options?: { value: string; label: string }[];
};
