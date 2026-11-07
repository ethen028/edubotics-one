import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * A new Prisma client on Postgres. Prisma 7 talks to the database through the `pg` driver (no query engine
 * binary), so every client is made here with the same driver settings. The app keeps one per server process
 * (src/lib/db.ts); scripts and the seed make their own.
 */
export function newPrismaClient() {
  // Read when the first query runs, not here, so importing the database (tests, the build) needs no address.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}
