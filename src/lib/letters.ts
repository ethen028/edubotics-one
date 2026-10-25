import "server-only";
import { Prisma, type LetterKind } from "@prisma/client";
import { db } from "./db";
import { getSettings, type Settings } from "./settings";
import { WEEKDAYS } from "./settings";
import { formatDate, formatINR, toDateInput } from "./format";
import { financialYear } from "./invoices";
import { parseDateOnly } from "./leave";
import { todayIST } from "./time";
import {
  LETTER_KINDS,
  addDays,
  addMonths,
  annualStatement,
  appointmentLetter,
  confirmationLetter,
  employmentCertificate,
  experienceCertificate,
  fyMonthsOf,
  idCard,
  internshipCertificate,
  letterNumber,
  noObjectionCertificate,
  offerLetter,
  relievingLetter,
  revisionLetter,
  salaryCertificate,
  showCauseNotice,
  trainingCertificate,
  warningLetter,
  type FormField,
  type LetterBody,
  type Person,
  type Salary,
  type Signatory,
} from "./letter-rules";

// Issuing HR letters: the form for each kind with the person's details filled in, the wording, the
// number and the saved record. The wording itself is in letter-rules.ts.

const employeeInclude = { department: true, manager: true } as const;
type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const salaryOf = (s: { basic: Prisma.Decimal; hra: Prisma.Decimal; specialAllowance: Prisma.Decimal }): Salary => ({
  basic: num(s.basic),
  hra: num(s.hra),
  specialAllowance: num(s.specialAllowance),
});

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();

export function personOf(e: EmployeeRow): Person {
  return {
    name: fullName(e),
    firstName: e.firstName,
    code: e.code,
    designation: e.designation,
    department: e.department?.name ?? null,
    manager: e.manager ? fullName(e.manager) : null,
    joined: e.dateOfJoining,
    exited: e.dateOfExit,
    employmentType: e.employmentType,
    address: [e.address, e.city, e.state].filter(Boolean).join(", ") || null,
  };
}

export const signatoryOf = (s: Settings): Signatory => ({ name: s.letterSignatoryName, title: s.letterSignatoryName ? s.letterSignatoryTitle : null });

/** The salary in force today, or from the joining date for someone who hasn't joined yet. */
async function currentSalary(e: EmployeeRow, today: Date) {
  const on = e.dateOfJoining > today ? e.dateOfJoining : today;
  return db.salaryStructure.findFirst({ where: { employeeId: e.id, effectiveFrom: { lte: on } }, orderBy: { effectiveFrom: "desc" } });
}

/** Financial years in which the person has a finalised or paid payslip, newest first. */
async function payslipYears(employeeId: string) {
  const runs = await db.payslip.findMany({ where: { employeeId, run: { status: { not: "DRAFT" } } }, select: { run: { select: { month: true } } } });
  return [...new Set(runs.map((r) => financialYear(new Date(`${r.run.month}-01T00:00:00Z`))))].sort().reverse();
}

const leftExit = (employeeId: string) =>
  db.employeeExit.findFirst({ where: { employeeId, stage: "LEFT", lastWorkingDay: { not: null } }, orderBy: { leftAt: "desc" } });

export type LetterForm = { fields: FormField[]; blocker: string | null };

/**
 * The fields for one kind of letter, filled in from the person's record and Settings (or from an earlier
 * copy when reissuing). `blocker` says why it can't be issued yet.
 */
export async function letterForm(kind: LetterKind, employeeId: string, prefill: Record<string, string> = {}): Promise<LetterForm> {
  const [e, settings] = await Promise.all([db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude }), getSettings()]);
  const today = todayIST();
  const f = (field: FormField): FormField => ({ ...field, value: prefill[field.name] ?? field.value });
  const toField = f({ name: "to", label: "Addressed to (optional)", type: "textarea", value: "", hint: "For example “The Manager, State Bank of India, Edappally”. Leave empty for “To whom it may concern”." });
  const purposeField = (required: boolean, hint: string) => f({ name: "purpose", label: required ? "No objection to" : "Purpose (optional)", type: "text", required, value: "", hint });
  const conduct = f({ name: "conduct", label: "Add a line saying their work and conduct were good", type: "checkbox", value: "on" });
  const fields = (list: FormField[], blocker: string | null = null): LetterForm => ({ fields: list, blocker });

  switch (kind) {
    case "OFFER":
      return fields([], "Offer letters are made from the offer on the candidate's page in Recruitment.");
    case "APPOINTMENT": {
      const salary = await currentSalary(e, today);
      return fields(
        [
          f({ name: "probationMonths", label: "Probation (months, 0 for none)", type: "number", value: String(settings.probationMonths) }),
          f({ name: "probationNoticeDays", label: "Notice during probation (days)", type: "number", value: String(settings.probationNoticeDays) }),
          f({ name: "noticeDays", label: "Notice once confirmed (days)", type: "number", value: String(settings.noticePeriodDays) }),
          f({
            name: "placeOfWork",
            label: "Place of work",
            type: "textarea",
            required: true,
            value: `Our office at ${settings.companyAddress.replace(/\s*\n\s*/g, ", ")}, and the schools, colleges and events where the company runs its programmes, as your work needs.`,
          }),
          f({ name: "extraTerms", label: "Other terms (optional)", type: "textarea", value: "" }),
        ],
        salary ? null : "Add their salary on their profile first. The letter prints it.",
      );
    }
    case "CONFIRMATION": {
      const due = addMonths(e.dateOfJoining, settings.probationMonths);
      return fields([
        f({ name: "effective", label: "Confirmed from", type: "date", required: true, value: toDateInput(due > today ? due : today), hint: `Probation of ${settings.probationMonths} months from joining ends ${formatDate(addDays(due, -1))}.` }),
        f({ name: "noticeDays", label: "Notice once confirmed (days)", type: "number", value: String(settings.noticePeriodDays) }),
      ]);
    }
    case "REVISION": {
      const salaries = await db.salaryStructure.findMany({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } });
      return fields(
        [
          f({
            name: "salaryId",
            label: "Revised salary",
            type: "select",
            required: true,
            value: salaries[0]?.id ?? "",
            options: salaries.map((s) => ({ value: s.id, label: `From ${formatDate(s.effectiveFrom)}: ${formatINR(Number(s.basic) + Number(s.hra) + Number(s.specialAllowance))} a month` })),
            hint: "Add the new salary on their profile first; the letter compares it with the one before.",
          }),
          f({ name: "newDesignation", label: "New designation, if promoted (optional)", type: "text", value: "", hint: "Change it on their record as well." }),
        ],
        salaries.length ? null : "Add their salary on their profile first.",
      );
    }
    case "EXPERIENCE":
      return fields([conduct]);
    case "EMPLOYMENT":
      return fields(
        [
          toField,
          purposeField(false, "Finishes “issued at their request for …”, e.g. “opening a bank account”."),
          f({ name: "includeAddress", label: "Include their address, as address proof", type: "checkbox", value: "" }),
        ],
        e.status === "EXITED" ? "They have left. Issue an experience certificate instead." : null,
      );
    case "SALARY_CERTIFICATE": {
      const salary = await currentSalary(e, today);
      return fields(
        [toField, purposeField(false, "Finishes “issued at their request for …”, e.g. “a home loan application”.")],
        e.status === "EXITED" ? "They have left, so there is no current salary to certify." : salary ? null : "Add their salary on their profile first.",
      );
    }
    case "NOC":
      return fields([toField, purposeField(true, "Finishes “The company has no objection to Rahul …”, e.g. “applying for a passport” or “joining a part-time MBA course”.")]);
    case "WARNING":
      return fields([
        f({ name: "subject", label: "Subject", type: "text", required: true, value: "", hint: "e.g. “Late arrival at school sessions”" }),
        f({ name: "details", label: "What happened", type: "textarea", required: true, value: "", hint: "The facts, with dates. This is printed as written." }),
        f({ name: "expected", label: "What we expect from now on (optional)", type: "textarea", value: "" }),
      ]);
    case "SHOW_CAUSE":
      return fields([
        f({ name: "subject", label: "Subject", type: "text", required: true, value: "" }),
        f({ name: "details", label: "What is alleged", type: "textarea", required: true, value: "", hint: "The facts, with dates. This is printed as written." }),
        f({ name: "replyDays", label: "Days to reply", type: "number", required: true, value: "7" }),
      ]);
    case "INTERNSHIP":
      return fields(
        [
          f({ name: "from", label: "Internship from", type: "date", required: true, value: toDateInput(e.dateOfJoining) }),
          f({ name: "to", label: "Internship to", type: "date", required: true, value: toDateInput(e.dateOfExit ?? today) }),
          f({ name: "project", label: "What they worked on (optional)", type: "text", value: "", hint: "Finishes “During the internship, Anu worked on …”" }),
          { ...conduct, label: "Add a line saying they were sincere and hardworking" },
        ],
        e.employmentType === "INTERN" ? null : "Only for staff recorded as interns. Outside interns get certificates from Workshops and internships.",
      );
    case "TRAINING": {
      const done = await db.trainingAssignment.findMany({ where: { employeeId, status: "COMPLETED" }, include: { module: true }, orderBy: { completedAt: "desc" } });
      return fields(
        [
          f({
            name: "assignmentId",
            label: "Training",
            type: "select",
            required: true,
            value: done[0]?.id ?? "",
            options: done.map((a) => ({ value: a.id, label: `${a.module.title}${a.completedAt ? `, completed ${formatDate(a.completedAt)}` : ""}` })),
          }),
        ],
        done.length ? null : "No training is marked completed on their profile yet.",
      );
    }
    case "RELIEVING": {
      const exit = await leftExit(employeeId);
      return fields([], exit ? null : "They haven't been marked as left yet. That's done on their exit.");
    }
    case "ID_CARD":
      return fields([]);
    case "ANNUAL_STATEMENT": {
      const years = await payslipYears(employeeId);
      return fields(
        [
          f({
            name: "fy",
            label: "Financial year",
            type: "select",
            required: true,
            value: years[0] ?? "",
            options: years.map((y) => ({ value: y, label: `20${y.replace("-", "–")}` })),
          }),
        ],
        years.length ? null : "They have no finalised payslips yet.",
      );
    }
  }
}

type Built = { body: LetterBody; sourceId: string | null } | { error: string };

/** Turns the typed form into the finished letter. */
async function build(kind: LetterKind, e: EmployeeRow, values: Record<string, string>, settings: Settings, today: Date): Promise<Built> {
  const p = personOf(e);
  const sig = signatoryOf(settings);
  const company = settings.companyName;
  const v = (k: string) => (values[k] ?? "").trim() || null;
  const on = (k: string) => values[k] === "on";
  const whole = (k: string, min: number, max: number, label: string) => {
    const n = Number(values[k]);
    return Number.isInteger(n) && n >= min && n <= max ? n : { error: `${label} must be a whole number from ${min} to ${max}.` };
  };
  const date = (k: string, label: string) => {
    try {
      return parseDateOnly(values[k] ?? "");
    } catch {
      return { error: `Enter ${label}.` };
    }
  };
  const need = (k: string, label: string) => v(k) ?? { error: `Fill in “${label}”.` };
  const bad = (...xs: unknown[]) => xs.find((x): x is { error: string } => typeof x === "object" && x !== null && "error" in x);

  switch (kind) {
    case "OFFER":
      return { error: "Offer letters are made in Recruitment." };
    case "APPOINTMENT": {
      const salary = await currentSalary(e, today);
      if (!salary) return { error: "Add their salary on their profile first." };
      const probationMonths = whole("probationMonths", 0, 24, "Probation");
      const probationNoticeDays = whole("probationNoticeDays", 0, 180, "Notice during probation");
      const noticeDays = whole("noticeDays", 0, 180, "Notice once confirmed");
      const placeOfWork = need("placeOfWork", "Place of work");
      const err = bad(probationMonths, probationNoticeDays, noticeDays, placeOfWork);
      if (err) return err;
      const leave = await db.leaveType.findMany({ where: { active: true, paid: true, annualQuota: { gt: 0 } }, orderBy: { code: "asc" } });
      return {
        sourceId: salary.id,
        body: appointmentLetter(
          p,
          salaryOf(salary),
          {
            probationMonths: probationMonths as number,
            probationNoticeDays: probationNoticeDays as number,
            noticeDays: noticeDays as number,
            workMinutesPerDay: settings.workMinutesPerDay,
            weeklyOffs: [...settings.weeklyOffDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]),
            leave: leave.map((l) => ({ name: l.name, days: l.annualQuota })),
            placeOfWork: placeOfWork as string,
            extraTerms: v("extraTerms"),
          },
          company,
          sig,
        ),
      };
    }
    case "CONFIRMATION": {
      const effective = date("effective", "the date they are confirmed from");
      const noticeDays = whole("noticeDays", 0, 180, "Notice");
      const err = bad(effective, noticeDays);
      if (err) return err;
      return { sourceId: null, body: confirmationLetter(p, { effective: effective as Date, noticeDays: noticeDays as number }, sig) };
    }
    case "REVISION": {
      const revised = await db.salaryStructure.findFirst({ where: { id: values.salaryId ?? "", employeeId: e.id } });
      if (!revised) return { error: "Pick the revised salary." };
      const previous = await db.salaryStructure.findFirst({ where: { employeeId: e.id, effectiveFrom: { lt: revised.effectiveFrom } }, orderBy: { effectiveFrom: "desc" } });
      return {
        sourceId: revised.id,
        body: revisionLetter(p, { effective: revised.effectiveFrom, previous: previous && salaryOf(previous), revised: salaryOf(revised), newDesignation: v("newDesignation") }, sig),
      };
    }
    case "EXPERIENCE":
      return { sourceId: null, body: experienceCertificate(p, { conduct: on("conduct") }, company, sig) };
    case "EMPLOYMENT":
      if (on("includeAddress") && !p.address) return { error: "There's no address on their record. Add it under Edit record, or untick the address." };
      return { sourceId: null, body: employmentCertificate(p, { to: v("to"), purpose: v("purpose"), includeAddress: on("includeAddress") }, company, sig) };
    case "SALARY_CERTIFICATE": {
      const salary = await currentSalary(e, today);
      if (!salary) return { error: "Add their salary on their profile first." };
      return { sourceId: salary.id, body: salaryCertificate(p, { to: v("to"), purpose: v("purpose"), salary: salaryOf(salary) }, company, sig) };
    }
    case "NOC": {
      const purpose = need("purpose", "No objection to");
      if (typeof purpose !== "string") return purpose;
      return { sourceId: null, body: noObjectionCertificate(p, { to: v("to"), purpose }, company, sig) };
    }
    case "WARNING": {
      const subject = need("subject", "Subject");
      const details = need("details", "What happened");
      const err = bad(subject, details);
      if (err) return err;
      return { sourceId: null, body: warningLetter(p, { subject: subject as string, details: details as string, expected: v("expected") }, sig) };
    }
    case "SHOW_CAUSE": {
      const subject = need("subject", "Subject");
      const details = need("details", "What is alleged");
      const replyDays = whole("replyDays", 1, 30, "Days to reply");
      const err = bad(subject, details, replyDays);
      if (err) return err;
      return { sourceId: null, body: showCauseNotice(p, { subject: subject as string, details: details as string, replyDays: replyDays as number, issuedOn: today }, sig) };
    }
    case "INTERNSHIP": {
      if (e.employmentType !== "INTERN") return { error: "Only for staff recorded as interns." };
      const from = date("from", "the start date");
      const to = date("to", "the end date");
      const err = bad(from, to);
      if (err) return err;
      if ((to as Date) < (from as Date)) return { error: "The internship can't end before it starts." };
      return { sourceId: null, body: internshipCertificate(p, { from: from as Date, to: to as Date, project: v("project"), conduct: on("conduct") }, company, sig) };
    }
    case "TRAINING": {
      const a = await db.trainingAssignment.findFirst({ where: { id: values.assignmentId ?? "", employeeId: e.id, status: "COMPLETED" }, include: { module: true } });
      if (!a) return { error: "Pick a completed training." };
      return { sourceId: a.id, body: trainingCertificate(p, { module: a.module.title, description: a.module.description, completed: a.completedAt ?? today }, company, sig) };
    }
    case "RELIEVING": {
      const exit = await leftExit(e.id);
      if (!exit?.lastWorkingDay) return { error: "They haven't been marked as left yet." };
      return { sourceId: exit.id, body: relievingLetter({ ...p, exited: exit.lastWorkingDay }, { resigned: exit.kind === "RESIGNATION" }, company, sig) };
    }
    case "ID_CARD":
      return {
        sourceId: null,
        body: idCard(p, { bloodGroup: e.bloodGroup, phone: e.phone, emergency: e.emergencyName || e.emergencyPhone ? [e.emergencyName, e.emergencyPhone].filter(Boolean).join(", ") : null }, sig),
      };
    case "ANNUAL_STATEMENT": {
      const fy = values.fy ?? "";
      if (!/^\d{2}-\d{2}$/.test(fy)) return { error: "Pick a financial year." };
      const slips = await db.payslip.findMany({ where: { employeeId: e.id, run: { month: { in: fyMonthsOf(fy) }, status: { not: "DRAFT" } } }, include: { run: { select: { month: true } } } });
      if (slips.length === 0) return { error: "They have no finalised payslips in that year." };
      return {
        sourceId: fy,
        body: annualStatement(
          p,
          {
            fy,
            pan: e.pan,
            slips: slips.map((s) => ({
              month: s.run.month,
              gross: num(s.gross),
              lopDeduction: num(s.lopDeduction),
              pf: num(s.pf),
              esi: num(s.esi),
              professionalTax: num(s.professionalTax),
              tds: num(s.tds),
              totalDeductions: num(s.totalDeductions),
              net: num(s.net),
              reimbursements: num(s.reimbursements),
            })),
          },
          company,
          sig,
        ),
      };
    }
  }
}

/** Saves a letter with the next number in this financial year's series. */
async function save(data: Omit<Prisma.HrLetterUncheckedCreateInput, "fy" | "seq" | "number">, numbered: boolean, prefix: string, replacesId: string | null) {
  const fy = financialYear(data.issuedOn as Date);
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        let numbering = {};
        if (numbered) {
          const last = await tx.hrLetter.aggregate({ where: { fy }, _max: { seq: true } });
          const seq = (last._max.seq ?? 0) + 1;
          numbering = { fy, seq, number: letterNumber(prefix, fy, seq) };
        }
        const letter = await tx.hrLetter.create({ data: { ...data, ...numbering } });
        if (replacesId) await tx.hrLetter.updateMany({ where: { id: replacesId, status: "ISSUED" }, data: { status: "REPLACED", replacedById: letter.id } });
        return letter;
      });
    } catch (e) {
      // Someone else issued a letter at the same moment and took the number: try again.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}

/** Issues one letter to an employee. The caller has already checked the user may issue this kind. */
export async function issueLetter(kind: LetterKind, employeeId: string, values: Record<string, string>, userId: string, replacesId: string | null = null) {
  const [e, settings] = await Promise.all([db.employee.findUnique({ where: { id: employeeId }, include: employeeInclude }), getSettings()]);
  if (!e) return { error: "That person isn't in HR." };
  const today = todayIST();
  const built = await build(kind, e, values, settings, today);
  if ("error" in built) return built;
  const letter = await save(
    {
      kind,
      employeeId,
      sourceId: built.sourceId,
      issuedOn: today,
      recipient: fullName(e),
      inputs: values,
      body: built.body as unknown as Prisma.InputJsonValue,
      issuedById: userId,
    },
    LETTER_KINDS[kind].numbered,
    settings.invoicePrefix,
    replacesId,
  );
  return { letter };
}

/** Issues the offer letter for an offer, numbered in the same series. A fresh copy replaces the last one. */
export async function issueOfferLetter(offerId: string, userId: string) {
  const [offer, settings] = await Promise.all([
    db.offer.findUnique({ where: { id: offerId }, include: { candidate: true, department: true, manager: true, letters: { where: { status: "ISSUED" } } } }),
    getSettings(),
  ]);
  if (!offer) return { error: "Offer not found." };
  const body = offerLetter(
    {
      candidate: offer.candidate.name,
      city: offer.candidate.city,
      email: offer.candidate.email,
      designation: offer.designation,
      department: offer.department?.name ?? null,
      manager: offer.manager ? fullName(offer.manager) : null,
      employmentType: offer.employmentType,
      joining: offer.joiningDate,
      respondBy: offer.respondBy,
      probationMonths: offer.probationMonths,
      notes: offer.notes,
      salary: salaryOf(offer),
    },
    settings.companyName,
    signatoryOf(settings),
  );
  const letter = await save(
    {
      kind: "OFFER",
      offerId,
      employeeId: offer.candidate.employeeId,
      issuedOn: todayIST(),
      recipient: offer.candidate.name,
      inputs: {},
      body: body as unknown as Prisma.InputJsonValue,
      issuedById: userId,
    },
    true,
    settings.invoicePrefix,
    offer.letters[0]?.id ?? null,
  );
  return { letter };
}

/** The relieving letter for an exit still on notice, worked out fresh and marked draft. */
export async function draftRelievingBody(exitId: string) {
  const [exit, settings] = await Promise.all([db.employeeExit.findUnique({ where: { id: exitId }, include: { employee: { include: employeeInclude } } }), getSettings()]);
  if (!exit?.lastWorkingDay) return null;
  return relievingLetter({ ...personOf(exit.employee), exited: exit.lastWorkingDay }, { resigned: exit.kind === "RESIGNATION" }, settings.companyName, signatoryOf(settings));
}

/** The latest passport photo uploaded for someone, if it is a PNG or JPG the PDF can print. */
export async function idPhoto(employeeId: string) {
  const doc = await db.employeeDocument.findFirst({
    where: { employeeId, type: "Passport photo", mimeType: { in: ["image/png", "image/jpeg"] }, status: { not: "REJECTED" } },
    orderBy: { createdAt: "desc" },
  });
  return doc ? { data: Buffer.from(doc.data), format: doc.mimeType === "image/png" ? ("png" as const) : ("jpg" as const) } : null;
}
