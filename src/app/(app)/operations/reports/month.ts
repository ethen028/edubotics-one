import "server-only";
import { db } from "@/lib/db";
import { parseMonth } from "@/lib/attendance";

/** Every session in a month, with its school and trainer. */
export async function monthSessions(value: string | undefined) {
  const month = parseMonth(value, new Date());
  const from = new Date(Date.UTC(month.year, month.month, 1));
  const to = new Date(Date.UTC(month.year, month.month + 1, 1));
  const sessions = await db.programmeSession.findMany({
    where: { date: { gte: from, lt: to } },
    include: {
      programme: { select: { id: true, name: true, organization: { select: { name: true } } } },
      trainer: { select: { id: true, name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const key = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  return { ...month, key, sessions };
}
