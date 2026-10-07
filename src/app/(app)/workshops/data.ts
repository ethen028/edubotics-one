import "server-only";
import { db } from "@/lib/db";

export async function workshopFormOptions() {
  const [users, orgs] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.organization.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
  ]);
  // Colleges and companies first: they host most workshops.
  const rank = (t: string) => (["COLLEGE", "UNIVERSITY", "CORPORATE"].includes(t) ? 0 : 1);
  orgs.sort((a, b) => rank(a.type) - rank(b.type));
  return { users, orgs };
}

/** A workshop with everything its pages need to work out each participant's standing. */
export function loadWorkshop(id: string) {
  return db.workshop.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, email: true } },
      coordinator: { select: { id: true, name: true } },
      trainers: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      registrations: {
        include: {
          payments: { select: { amount: true } },
          attendance: { select: { date: true, present: true } },
          certificate: { include: { emails: { where: { status: "SENT" }, select: { id: true }, take: 1 } } },
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
      },
      invoices: { select: { id: true, number: true, status: true, total: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export type LoadedWorkshop = NonNullable<Awaited<ReturnType<typeof loadWorkshop>>>;
