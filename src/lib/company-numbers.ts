import { Prisma } from "@prisma/client";

/**
 * Purchase orders (PO-0001), stock requests (REQ-0001) and helpdesk requests (HD-001) count per company, like
 * invoices: each new row takes the company's highest number plus one. Two people saving at the same moment would
 * pick the same number; the unique key on (companyId, number) refuses the second, which then tries the next one.
 */
export async function withNextNumber<T>(highest: () => Promise<number | null>, create: (number: number) => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const number = ((await highest()) ?? 0) + 1;
    try {
      return await create(number);
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!clash || attempt >= attempts) throw e;
    }
  }
}
