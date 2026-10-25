/**
 * Starter data: departments, leave types, fixed-date national holidays, training modules, the June 2026 – May 2027
 * operating calendar and the first admin login.
 * Safe to run more than once. Run with `npm run db:seed`.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { companyScope, mainCompanyId } from "../src/lib/company-scope";
import { addStarterData } from "../src/lib/company-starter";
import { loadOperatingCalendar } from "../src/lib/plan-load";

// tsx does not load .env the way Next.js and the Prisma CLI do.
if (existsSync(".env")) loadEnvFile(".env");
const rawDb = new PrismaClient();
let companyId = "";
// Every query below runs inside `companyId`, the same company filter the app uses (src/lib/company-scope.ts).
const db = rawDb.$extends(companyScope(async () => companyId));

async function main() {
  // Every company gets the starter data; the annual plan and the first admin go to the first company.
  for (const c of await rawDb.company.findMany({ orderBy: { createdAt: "asc" } })) {
    companyId = c.id;
    await addStarterData(db, c.id);
  }
  companyId = await mainCompanyId(rawDb);

  // Only on a database with no plan yet, so months someone removed on purpose don't come back on the next restart.
  if ((await db.planMonth.count()) === 0) console.log(`Loaded ${await loadOperatingCalendar(db)} months of the operating calendar.`);

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    console.log("Skipped admin login: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ chars) to create one.");
  } else if (await rawDb.user.findUnique({ where: { email } })) {
    console.log(`Admin ${email} already exists.`);
  } else {
    await db.user.create({
      data: {
        email,
        name: process.env.SEED_ADMIN_NAME ?? "Admin",
        role: "ADMIN",
        isOwner: (await db.user.count({ where: { isOwner: true } })) === 0, // the first admin is the company owner
        isSuperadmin: (await rawDb.user.count({ where: { isSuperadmin: true } })) === 0, // and the group's superadmin
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true, // the starting password is in docker-compose.yml for anyone to read
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
  .finally(() => rawDb.$disconnect());
