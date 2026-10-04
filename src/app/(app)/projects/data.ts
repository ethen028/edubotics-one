import "server-only";
import { db } from "@/lib/db";

export async function projectFormOptions(includeDealId?: string | null) {
  const [users, departments, organizations, deals] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.deal.findMany({
      where: { OR: [{ stage: "WON" }, ...(includeDealId ? [{ id: includeDealId }] : [])] },
      select: { id: true, title: true },
      orderBy: { closedAt: { sort: "desc", nulls: "last" } },
    }),
  ]);
  return { users, departments, organizations, deals };
}
