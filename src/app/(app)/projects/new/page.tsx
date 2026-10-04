import type { ProjectKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../forms";
import { createProject } from "../actions";
import { projectFormOptions } from "../data";

export const metadata = { title: "New project" };

/** Guess the project type from the CRM programme so a won deal needs no retyping. */
function kindForProgram(program: string | null): ProjectKind {
  const p = (program ?? "").toLowerCase();
  if (p.includes("teacher")) return "TEACHER_TRAINING";
  if (p.includes("college") || p.includes("workshop")) return "COLLEGE_WORKSHOP";
  if (p.includes("stem") || p.includes("lab") || p.includes("camp")) return "SCHOOL_PROGRAMME";
  return "CLIENT_PROJECT";
}

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const { deal: dealId } = (await searchParams) as Record<string, string | undefined>;
  const [options, deal] = await Promise.all([
    projectFormOptions(dealId),
    dealId ? db.deal.findUnique({ where: { id: dealId } }) : null,
  ]);

  return (
    <>
      <PageHeader
        title="New project"
        subtitle={deal ? `Delivering “${deal.title}”. Details from the deal are filled in.` : "Step 1 of 8: define the project"}
      />
      <div className="max-w-3xl">
        <ProjectForm
          action={createProject}
          {...options}
          defaults={{
            ownerId: user.id,
            departmentId: user.employee?.departmentId ?? null,
            ...(deal && {
              name: deal.title,
              kind: kindForProgram(deal.program),
              organizationId: deal.organizationId,
              dealId: deal.id,
              description: [deal.program, deal.students && `${deal.students} students`, deal.notes].filter(Boolean).join("\n"),
            }),
          }}
        />
      </div>
    </>
  );
}
