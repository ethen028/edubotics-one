import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { DealForm } from "../../forms";
import { createDeal } from "../../actions";
import { activeUsers, orgOptions } from "../../data";

export const metadata = { title: "Add deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/crm/deals/new">) {
  await requireUser();
  const { org } = (await searchParams) as Record<string, string | undefined>;
  const [users, organizations, contacts] = await Promise.all([
    activeUsers(),
    orgOptions(),
    db.contact.findMany({ where: org ? { organizationId: org } : {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Add deal" />
      <div className="max-w-3xl">
        <DealForm action={createDeal} organizations={organizations} contacts={contacts} users={users} defaultOrganizationId={org} />
      </div>
    </>
  );
}
