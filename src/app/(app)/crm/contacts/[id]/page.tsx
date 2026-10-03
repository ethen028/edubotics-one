import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../../forms";
import { deleteContact, updateContact } from "../../actions";
import { activeUsers, orgOptions } from "../../data";
import { ActivityPanel, activityInclude } from "../../activity-panel";

export default async function ContactPage({ params }: PageProps<"/crm/contacts/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      organization: true,
      activities: { include: activityInclude, orderBy: { createdAt: "desc" } },
    },
  });
  if (!contact) notFound();
  const [users, orgs] = await Promise.all([activeUsers(), orgOptions()]);

  return (
    <>
      <PageHeader
        title={contact.name}
        subtitle={
          <>
            {contact.designation}
            {contact.organization && (
              <>
                {contact.designation && " · "}
                <Link href={`/crm/organizations/${contact.organization.id}`} className="link">
                  {contact.organization.name}
                </Link>
              </>
            )}
          </>
        }
        actions={
          isAdmin(user) && (
            <form action={deleteContact.bind(null, contact.id)}>
              <button className="btn-danger">Delete</button>
            </form>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <ContactForm action={updateContact.bind(null, contact.id)} contact={contact} organizations={orgs} users={users} />
        </div>
        <div className="xl:col-span-2">
          <ActivityPanel
            activities={contact.activities}
            link={{ contactId: contact.id, organizationId: contact.organizationId ?? undefined }}
            users={users}
          />
        </div>
      </div>
    </>
  );
}
