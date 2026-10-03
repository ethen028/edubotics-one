import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { LeadForm } from "../../forms";
import { createLead } from "../../actions";
import { activeUsers } from "../../data";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Add lead" />
      <div className="max-w-3xl">
        <LeadForm action={createLead} users={await activeUsers()} />
      </div>
    </>
  );
}
