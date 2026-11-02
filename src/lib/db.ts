import { PrismaClient } from "@prisma/client";
import { companyScope } from "./company-scope";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The database without the company filter. Only for sign-in (people are looked up before anyone knows which
 * company they are in), the superadmin's group pages and background jobs that loop over every company.
 */
export const rawDb = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;

/** The database as everyone uses it: every query stays inside the current company (src/lib/company.ts). */
export const db = rawDb.$extends(companyScope(async () => (await import("./company")).currentCompanyId()));

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
