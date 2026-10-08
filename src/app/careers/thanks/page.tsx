import Link from "next/link";
import { careersSettings } from "@/lib/careers";

export const metadata = { title: { absolute: "Application received" } };

export default async function ThanksPage() {
  const { companyName, contactEmail } = await careersSettings();
  return (
    <div className="card mx-auto max-w-lg text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
      <h1 className="text-xl font-semibold">Thank you, we have your application</h1>
      <p className="mt-2 text-sm text-slate-600">
        The {companyName} team reads every application. If your profile fits, we will call or email you to set up a conversation.
        {contactEmail && (
          <>
            {" "}
            Questions in the meantime? Write to{" "}
            <a href={`mailto:${contactEmail}`} className="link">
              {contactEmail}
            </a>
            .
          </>
        )}
      </p>
      <Link href="/careers" className="btn-secondary mt-5">
        See other jobs
      </Link>
    </div>
  );
}
