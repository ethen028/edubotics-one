/*
 * Starter data every company begins with: departments, leave types, holidays and training modules.
 * Used by the seed (prisma/seed.ts, on every start of the office copy) and when a superadmin adds a company.
 * Safe to run more than once. No "server-only" import: the seed runs outside Next.js.
 */
import type { Db } from "./db";
import { TRAINING_MODULES } from "./hr-constants";
import { KERALA_HOLIDAYS } from "../../prisma/kerala-holidays";

const departments = ["Management", "Training & Delivery", "Sales & Partnerships", "Operations", "R&D / Technical"];

// Edubotics policy (Ethen, Oct 2026): 15 casual + 3 sick = 18 paid days a year, plus unpaid LOP.
// Edit under Admin → Leave types. A quota of 0 means unlimited, so earned leave isn't seeded.
const leaveTypes = [
  { code: "CL", name: "Casual leave", annualQuota: 15, paid: true },
  { code: "SL", name: "Sick leave", annualQuota: 3, paid: true },
  { code: "LOP", name: "Loss of pay", annualQuota: 0, paid: false },
];

// Fixed-date holidays for years after the Kerala list. Onam, Vishu, Eid, Deepavali, etc. move every year: add them under HR → Holidays.
const fixedHolidays = [
  ["01-26", "Republic Day"],
  ["05-01", "May Day"],
  ["08-15", "Independence Day"],
  ["10-02", "Gandhi Jayanthi"],
  ["12-25", "Christmas"],
] as const;

type StarterDb = Pick<Db, "department" | "leaveType" | "holiday" | "trainingModule">;

/** Adds what is missing of the starter data to one company. `db` must already be inside that company. */
export async function addStarterData(db: StarterDb, companyId: string) {
  for (const name of departments) {
    await db.department.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { name } });
  }
  for (const t of leaveTypes) {
    await db.leaveType.upsert({ where: { companyId_code: { companyId, code: t.code } }, update: {}, create: t });
  }
  for (const [day, name, tentative = false] of KERALA_HOLIDAYS) {
    const date = new Date(`${day}T00:00:00.000Z`);
    await db.holiday.upsert({ where: { companyId_date: { companyId, date } }, update: {}, create: { date, name, tentative } });
  }
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    for (const [md, name] of fixedHolidays) {
      const date = new Date(`${y}-${md}T00:00:00.000Z`);
      await db.holiday.upsert({ where: { companyId_date: { companyId, date } }, update: {}, create: { date, name } });
    }
  }
  for (const m of TRAINING_MODULES) {
    await db.trainingModule.upsert({ where: { companyId_title: { companyId, title: m.title } }, update: {}, create: m });
  }
}
