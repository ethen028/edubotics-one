import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createWorkshop } from "../actions";
import { workshopFormOptions } from "../data";
import { WorkshopForm } from "../ui";

export const metadata = { title: "New workshop" };

export default async function NewWorkshopPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { users, orgs } = await workshopFormOptions();
  return (
    <>
      <PageHeader title="New workshop" subtitle="Add the participants once it's saved: one by one, or pasted from a spreadsheet or Google Form." />
      <div className="max-w-3xl">
        <WorkshopForm action={createWorkshop} users={users} orgs={orgs} defaultCoordinatorId={user.id} submitLabel="Save workshop" />
      </div>
    </>
  );
}
