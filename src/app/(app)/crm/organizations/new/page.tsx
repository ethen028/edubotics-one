import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { OrganizationForm } from "../../forms";
import { createOrganization } from "../../actions";
import { activeUsers } from "../../data";

export const metadata = { title: "Add institution" };

export default async function NewOrganizationPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Add institution" />
      <OrganizationForm action={createOrganization} users={await activeUsers()} />
    </>
  );
}
