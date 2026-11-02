import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { CandidateForm } from "../../forms";
import { createCandidate } from "../../actions";

export const metadata = { title: "Add candidate" };

export default async function NewCandidatePage({ searchParams }: PageProps<"/recruitment/candidates/new">) {
  await requireUser(["ADMIN", "HR", "MANAGER"]);
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
