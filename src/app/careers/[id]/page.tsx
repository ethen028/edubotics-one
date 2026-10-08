import Link from "next/link";
import { notFound } from "next/navigation";
import { careersSettings, publicJob } from "@/lib/careers";
import { formatDate, humanize } from "@/lib/format";
import { ApplyForm } from "./apply-form";

export async function generateMetadata({ params }: PageProps<"/careers/[id]">) {
  const { id } = await params;
  const [settings, job] = await Promise.all([careersSettings(), publicJob(id)]);
  if (!settings.enabled || !job) return { title: { absolute: `Careers · ${settings.companyName}` } };
  return { title: { absolute: `${job.title} · ${settings.companyName}` }, description: job.description?.slice(0, 160) };
}

export default async function CareersJobPage({ params, searchParams }: PageProps<"/careers/[id]">) {
  const { id } = await params;
  const { error } = (await searchParams) as Record<string, string | undefined>;
  const settings = await careersSettings();
  const job = settings.enabled ? await publicJob(id) : null;
  if (!job) notFound();

  return (
    <>
      <Link href="/careers" className="link text-sm">
        ← All jobs
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">{job.title}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {[job.department?.name, humanize(job.employmentType), job.location].filter(Boolean).join(" · ")}
        {job.applyBy && ` · apply by ${formatDate(job.applyBy)}`}
      </p>

      {job.description && <div className="card mt-5 text-sm leading-relaxed whitespace-pre-line text-slate-700">{job.description}</div>}

      <section id="apply" className="mt-8 scroll-mt-6">
        <h2 className="mb-3 text-lg font-semibold">Apply for this job</h2>
        <ApplyForm jobId={job.id} initialError={error?.slice(0, 200)} companyName={settings.companyName} />
      </section>
    </>
  );
}
