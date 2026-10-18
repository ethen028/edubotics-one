import Link from "next/link";
import { careersSettings } from "@/lib/careers";

export async function generateMetadata() {
  const { companyName } = await careersSettings();
  return { title: { absolute: `How we use your application · ${companyName}` } };
}

// The privacy notice for people who apply through the public jobs page.
export default async function CareersPrivacyPage() {
  const { companyName, contactEmail } = await careersSettings();
  return (
    <article className="card max-w-2xl space-y-4 text-sm text-slate-600">
      <h1 className="text-xl font-semibold text-slate-900">How we use your application</h1>
      <p>
        When you apply for a job at {companyName}, we keep your name, email, phone number, the job you applied for, your
        resume and anything you write in the form.
      </p>
      <h2 className="font-semibold text-slate-900">Why we keep it</h2>
      <p>We use it only to consider you for this job and for similar jobs that open later, and to contact you about them.</p>
      <h2 className="font-semibold text-slate-900">Who sees it</h2>
      <p>
        Only the {companyName} staff who handle hiring and the people who interview you. We do not sell your details or share
        them with anyone outside the company.
      </p>
      <h2 className="font-semibold text-slate-900">How long we keep it</h2>
      <p>Until we no longer need it for hiring. We delete applications we have not used for a long time.</p>
      <h2 className="font-semibold text-slate-900">Seeing, correcting or deleting your details</h2>
      <p>
        {contactEmail ? (
          <>
            Write to{" "}
            <a href={`mailto:${contactEmail}`} className="link">
              {contactEmail}
            </a>{" "}
            and we will show you what we hold, correct it, or delete it.
          </>
        ) : (
          <>Contact {companyName} and we will show you what we hold, correct it, or delete it.</>
        )}{" "}
        You can also withdraw your application at any time the same way.
      </p>
      <Link href="/careers" className="btn-secondary">
        See open jobs
      </Link>
    </article>
  );
}
