import test from "node:test";
import assert from "node:assert/strict";
import {
  LETTER_KINDS,
  addMonths,
  appointmentLetter,
  canIssueKind,
  canSeeLetter,
  experienceCertificate,
  fyMonthsOf,
  hoursText,
  joinWords,
  letterNumber,
  revisionLetter,
  showCauseNotice,
  statementTable,
  type Person,
} from "../src/lib/letter-rules";

const person: Person = {
  name: "Rahul Varghese",
  firstName: "Rahul",
  code: "EBG-004",
  designation: "Sales Executive",
  department: "Sales",
  manager: "Arjun Nair",
  joined: new Date("2026-04-15T00:00:00Z"),
  exited: null,
  employmentType: "FULL_TIME",
  address: "Edappally, Kochi, Kerala",
};
const sig = { name: "Fathima Rahman", title: "HR Manager" };
const text = (b: { blocks: ({ p: string } | object)[] }) => b.blocks.map((x) => ("p" in x ? x.p : "")).join(" ");

test("HR letters are numbered in one series per financial year", () => {
  assert.equal(letterNumber("EBG", "26-27", 1), "EBG/HR/26-27/0001");
  assert.equal(letterNumber("EBG", "27-28", 123), "EBG/HR/27-28/0123");
});

test("HR never issues or opens a letter that shows pay; the person sees only their current copy", () => {
  for (const [kind, meta] of Object.entries(LETTER_KINDS) as [keyof typeof LETTER_KINDS, (typeof LETTER_KINDS)[keyof typeof LETTER_KINDS]][]) {
    assert.equal(canIssueKind("ADMIN", kind), true);
    assert.equal(canIssueKind("HR", kind), !meta.salary, kind);
    assert.equal(canIssueKind("MANAGER", kind), false);
    assert.equal(canIssueKind("EMPLOYEE", kind), false);
  }
  for (const kind of ["OFFER", "APPOINTMENT", "REVISION", "SALARY_CERTIFICATE", "ANNUAL_STATEMENT"] as const) assert.equal(LETTER_KINDS[kind].salary, true, kind);
  const hr = { role: "HR" as const, employee: { id: "hr" } };
  assert.equal(canSeeLetter(hr, { kind: "SALARY_CERTIFICATE", employeeId: "x", status: "ISSUED" }), false);
  assert.equal(canSeeLetter(hr, { kind: "SALARY_CERTIFICATE", employeeId: "hr", status: "ISSUED" }), true);
  assert.equal(canSeeLetter(hr, { kind: "SALARY_CERTIFICATE", employeeId: "hr", status: "CANCELLED" }), false);
  assert.equal(canSeeLetter({ role: "MANAGER", employee: { id: "m" } }, { kind: "EXPERIENCE", employeeId: "x", status: "ISSUED" }), false);
  assert.equal(canSeeLetter({ role: "EMPLOYEE", employee: { id: "x" } }, { kind: "WARNING", employeeId: "x", status: "ISSUED" }), true);
});

test("dates and words used in letters", () => {
  assert.equal(joinWords(["Saturday", "Sunday"]), "Saturday and Sunday");
  assert.equal(joinWords(["a", "b", "c"]), "a, b and c");
  assert.equal(hoursText(540), "9 hours");
  assert.equal(hoursText(510), "8 hours 30 minutes");
  assert.equal(addMonths(new Date("2026-08-31T00:00:00Z"), 6).toISOString().slice(0, 10), "2027-02-28");
  assert.deepEqual(fyMonthsOf("26-27").slice(0, 1).concat(fyMonthsOf("26-27").slice(-1)), ["2026-04", "2027-03"]);
});

test("the appointment letter states probation, both notice periods, hours, offs and leave", () => {
  const body = appointmentLetter(
    person,
    { basic: 15000, hra: 6000, specialAllowance: 4000 },
    { probationMonths: 3, probationNoticeDays: 30, noticeDays: 30, workMinutesPerDay: 540, weeklyOffs: ["Saturday", "Sunday"], leave: [{ name: "Casual leave", days: 15 }, { name: "Sick leave", days: 3 }], placeOfWork: "Kochi office.", extraTerms: null },
    "Edubotics Global",
    sig,
  );
  const t = text(body);
  assert.match(t, /probation for 3 months from your date of joining, until 14 Jul 2026/);
  assert.match(t, /During probation, either you or the company may end your employment by giving 30 days' notice/);
  assert.match(t, /9 hours, and Saturday and Sunday are weekly offs/);
  assert.match(t, /15 days of casual leave and 3 days of sick leave/);
  const table = body.blocks.find((b) => "table" in b) as { table: { foot?: string[] } };
  assert.deepEqual(table.table.foot, ["Gross per year", "₹3,00,000"]);
  assert.ok(body.ack);
  const none = appointmentLetter(person, { basic: 1, hra: 0, specialAllowance: 0 }, { probationMonths: 0, probationNoticeDays: 30, noticeDays: 45, workMinutesPerDay: 480, weeklyOffs: [], leave: [], placeOfWork: "x", extraTerms: null }, "E", sig);
  assert.doesNotMatch(text(none), /probation/i);
  assert.match(text(none), /giving 45 days' notice/);
});

test("experience certificates read differently for current and former staff", () => {
  assert.match(text(experienceCertificate(person, { conduct: false }, "Edubotics Global", sig)), /has been working with Edubotics Global as Sales Executive, Sales since 15 Apr 2026/);
  const left = experienceCertificate({ ...person, exited: new Date("2027-01-31T00:00:00Z") }, { conduct: true }, "Edubotics Global", sig);
  assert.match(text(left), /worked with .* from 15 Apr 2026 to 31 Jan 2027/);
  assert.match(text(left), /work and conduct to be good/);
});

test("a salary revision compares the old and new salary, and names a promotion", () => {
  const body = revisionLetter(person, { effective: new Date("2027-04-01T00:00:00Z"), previous: { basic: 15000, hra: 6000, specialAllowance: 4000 }, revised: { basic: 18000, hra: 7200, specialAllowance: 4800 }, newDesignation: "Senior Sales Executive" }, sig);
  assert.equal(body.title, "Promotion and salary revision");
  const table = (body.blocks.find((b) => "table" in b) as { table: { rows: string[][]; foot?: string[] } }).table;
  assert.deepEqual(table.rows[3], ["Gross per month", "₹25,000", "₹30,000"]);
  assert.deepEqual(table.foot, ["Gross per year", "₹3,00,000", "₹3,60,000"]);
  assert.equal(revisionLetter(person, { effective: new Date(), previous: null, revised: { basic: 1, hra: 0, specialAllowance: 0 }, newDesignation: "Sales Executive" }, sig).title, "Salary revision letter");
});

test("a show cause notice gives the reply date", () => {
  const body = showCauseNotice(person, { subject: "Missed sessions", details: "x", replyDays: 7, issuedOn: new Date("2026-10-25T00:00:00Z") }, sig);
  assert.match(text(body), /within 7 days of receiving this notice and no later than 01 Nov 2026/);
});

test("the annual statement totals each column and leaves expense claims out of net salary", () => {
  const slip = { gross: 25000, lopDeduction: 0, pf: 0, esi: 0, professionalTax: 0, tds: 0, totalDeductions: 0, net: 25000, reimbursements: 0 };
  const t = statementTable([
    { ...slip, month: "2026-05", lopDeduction: 833.33, totalDeductions: 833.33, net: 24166.67 + 1200, reimbursements: 1200 },
    { ...slip, month: "2026-04" },
    { ...slip, month: "2026-08", professionalTax: 250, otherDeductions: 0, totalDeductions: 350, net: 24650 } as never,
  ]);
  assert.deepEqual(t.rows.map((r) => r[0]), ["Apr 2026", "May 2026", "Aug 2026"]);
  assert.equal(t.rows[1][8], "₹24,167");
  assert.equal(t.rows[2][7], "₹100"); // other deductions
  assert.deepEqual(t.foot, ["Total", "₹75,000", "₹833", "–", "–", "₹250", "–", "₹100", "₹73,817"]);
});
