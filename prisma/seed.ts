/**
 * Starter data: departments, leave types, fixed-date national holidays, training modules and the first admin login.
 * Safe to run more than once. Run with `npm run db:seed`.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TRAINING_MODULES } from "../src/lib/hr-constants";

const db = new PrismaClient();

const departments = ["Management", "Training & Delivery", "Sales & Partnerships", "Operations", "R&D / Technical"];

// Defaults in line with common Kerala Shops & Establishments practice. Edit under HR → Leave types.
const leaveTypes = [
  { code: "CL", name: "Casual leave", annualQuota: 12, paid: true },
  { code: "SL", name: "Sick leave", annualQuota: 12, paid: true },
  { code: "EL", name: "Earned leave", annualQuota: 12, paid: true },
  { code: "LOP", name: "Loss of pay", annualQuota: 0, paid: false },
];

// Only fixed-date holidays. Onam, Vishu, Eid, Deepavali, etc. move every year: add them under HR → Holidays.
const fixedHolidays = [
  ["01-26", "Republic Day"],
  ["05-01", "May Day"],
  ["08-15", "Independence Day"],
  ["10-02", "Gandhi Jayanthi"],
  ["12-25", "Christmas"],
] as const;

async function main() {
  for (const name of departments) {
    await db.department.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const t of leaveTypes) {
    await db.leaveType.upsert({ where: { code: t.code }, update: {}, create: t });
  }
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    for (const [md, name] of fixedHolidays) {
      const date = new Date(`${y}-${md}T00:00:00.000Z`);
      await db.holiday.upsert({ where: { date }, update: {}, create: { date, name } });
    }
  }

  for (const m of TRAINING_MODULES) {
    await db.trainingModule.upsert({ where: { title: m.title }, update: {}, create: m });
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    console.log("Skipped admin login: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ chars) to create one.");
  } else if (await db.user.findUnique({ where: { email } })) {
    console.log(`Admin ${email} already exists.`);
  } else {
    await db.user.create({
      data: {
        email,
        name: process.env.SEED_ADMIN_NAME ?? "Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`Created admin login ${email}.`);
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
