import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createProgramme } from "../../actions";
import { programmeFormOptions } from "../../data";
import { ProgrammeForm } from "../../ui";

export const metadata = { title: "New school programme" };

/** Indian academic years run June to March: "2026-27". */
function academicYear(d: Date) {
  const y = d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export default async function NewProgrammePage({ searchParams }: PageProps<"/operations/programmes/new">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const [options, project, org] = await Promise.all([
    programmeFormOptions(sp.project),
    sp.project ? db.project.findUnique({ where: { id: sp.project }, include: { deal: true } }) : null,
    sp.school ? db.organization.findUnique({ where: { id: sp.school } }) : null,
  ]);

  return (
    <>
      <PageHeader
        title="New school programme"
        subtitle={
          project
            ? `For the project “${project.name}”. Details from the project are filled in.`
            : "Set up the school first, then add its weekly timetable and trainers."
        }
      />
      <div className="max-w-3xl">
        <ProgrammeForm
          action={createProgramme}
          {...options}
          defaults={{
            coordinatorId: project?.ownerId ?? user.id,
            academicYear: academicYear(new Date()),
            organizationId: project?.organizationId ?? org?.id,
            ...(project && {
              name: project.deal?.program ?? project.name,
              projectId: project.id,
              students: project.deal?.students ?? null,
              startDate: project.startDate,
              endDate: project.dueDate,
              contactId: project.deal?.contactId ?? null,
            }),
          }}
        />
      </div>
    </>
  );
}
