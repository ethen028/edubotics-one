import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { ContactForm } from "../forms";
import { createContact } from "../actions";
import { activeUsers, orgOptions } from "../data";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: PageProps<"/crm/contacts">) {
  await requireUser();
  const { q = "" } = (await searchParams) as Record<string, string | undefined>;
  const where: Prisma.ContactWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
          { organization: { name: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};
  const [contacts, users, orgs] = await Promise.all([
    db.contact.findMany({ where, include: { organization: true }, orderBy: { name: "asc" }, take: 300 }),
    activeUsers(),
    orgOptions(),
  ]);

  return (
    <>
      <PageHeader title="Contacts" subtitle="Principals, coordinators, HODs and other people we work with." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <form className="mb-4 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name, phone, email, institution" className="input max-w-sm" />
            <button className="btn-secondary">Search</button>
          </form>
          {contacts.length === 0 ? (
            <Empty>No contacts found.</Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Institution</th>
                    <th>Phone</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/crm/contacts/${c.id}`} className="link">
                          {c.name}
                        </Link>
                        <div className="text-xs text-slate-500">{c.designation}</div>
                      </td>
                      <td>
                        {c.organization ? (
                          <Link href={`/crm/organizations/${c.organization.id}`} className="hover:underline">
                            {c.organization.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{c.phone ?? "—"}</td>
                      <td>{c.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <ContactForm action={createContact} organizations={orgs} users={users} compact />
        </div>
      </div>
    </>
  );
}
