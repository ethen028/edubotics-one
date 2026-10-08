import Link from "next/link";
import { careersSettings, publicJobs } from "@/lib/careers";
import { formatDate, humanize } from "@/lib/format";

export async function generateMetadata() {
  const { companyName } = await careersSettings();
  return { title: { absolute: `Careers · ${companyName}` }, description: `Open jobs at ${companyName}` };
}

export default async function CareersPage() {
  const settings = await careersSettings();
  const jobs = settings.enabled ? await publicJobs() : [];

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">Work with us</h1>
      <p className="mt-2 max-w-2xl whitespace-pre-line text-slate-600">
        {settings.intro ??
          `${settings.companyName} teaches robotics, coding and STEM to children in schools across Kerala. We are looking for people who enjoy building things and teaching.`}
      </p>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Open jobs</h2>
      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          There are no open jobs right now. Please check back soon.
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/careers/${j.id}`} className="card block transition hover:border-brand-500">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-semibold text-brand-700">{j.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {[j.department?.name, humanize(j.employmentType), j.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="btn-primary">View and apply</span>
                </div>
                {j.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{j.description}</p>}
                {j.applyBy && <p className="mt-2 text-xs text-slate-500">Apply by {formatDate(j.applyBy)}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
