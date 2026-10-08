import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { canRecruit } from "@/lib/recruitment";
import { CandidateForm } from "../../forms";
import { createCandidate } from "../../actions";

export const metadata = { title: "Add candidate" };

export default async function NewCandidatePage({ searchParams }: PageProps<"/recruitment/candidates/new">) {
  const user = await requireUser();
  if (!canRecruit(user)) redirect("/?denied=1");
  const { job } = (await searchParams) as Record<string, string | undefined>;
  const jobs = await db.jobOpening.findMany({ where: { status: "OPEN" }, select: { id: true, title: true }, orderBy: { title: "asc" } });
  return (
    <>
      <PageHeader
        title="Add candidate"
        actions={
          <Link href={job ? `/recruitment/jobs/${job}` : "/recruitment"} className="btn-secondary">
            Back
          </Link>
        }
      />
      {jobs.length === 0 ? (
        <Empty>
          Open a job first.{" "}
          <Link href="/recruitment/jobs/new" className="link">
            New job opening
          </Link>
        </Empty>
      ) : (
        <CandidateForm action={createCandidate} jobs={jobs} jobId={job} withResume />
      )}
    </>
  );
}
