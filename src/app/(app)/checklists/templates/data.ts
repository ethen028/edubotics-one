import "server-only";
import { db } from "@/lib/db";

/** Everyone with an active login, for picking who does a checklist. */
export async function assignableUsers() {
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, employee: { select: { designation: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name, role: u.role, designation: u.employee?.designation ?? null }));
}
