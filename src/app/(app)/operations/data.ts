import "server-only";
import { db } from "@/lib/db";

export async function programmeFormOptions(includeProjectId?: string | null) {
  const [users, schools, contacts, projects] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Schools first; colleges and others can run programmes too.
    db.organization.findMany({ select: { id: true, name: true, type: true }, orderBy: [{ name: "asc" }] }),
    db.contact.findMany({
      select: { id: true, name: true, organization: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.project.findMany({
      where: { OR: [{ stage: { not: "COMPLETE" } }, ...(includeProjectId ? [{ id: includeProjectId }] : [])] },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  schools.sort((a, b) => Number(b.type === "SCHOOL") - Number(a.type === "SCHOOL"));
  return {
    users,
    schools,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, organizationName: c.organization?.name ?? null })),
    projects,
  };
}

/** Everyone who can be given a class: active logins. */
export function trainerOptions() {
  return db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
