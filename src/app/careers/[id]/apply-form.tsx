"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Posts to /careers/[id]/apply. With scripts on it stays on the page and keeps what was typed when
 * something needs fixing; with scripts off the browser posts the form and gets redirected.
 */
export function ApplyForm({ jobId, initialError, companyName }: { jobId: string; initialError?: string; companyName: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [sending, setSending] = useState(false);
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);
  const action = `/careers/${jobId}/apply`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(undefined);
    try {
      const res = await fetch(action, { method: "POST", body: new FormData(e.currentTarget), headers: { Accept: "application/json" } });
      const result = (await res.json()) as { ok?: true; error?: string };
      if (result.ok) {
        router.push("/careers/thanks");
        return;
      }
      setError(result.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Your application could not be sent. Check your connection and try again.");
    }
    setSending(false);
  }

  return (
    <form action={action} method="post" encType="multipart/form-data" onSubmit={submit} className="card space-y-4">
      {error && <div ref={errorBox} role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">Full name *</span>
          <input name="name" required maxLength={120} autoComplete="name" className="input" />
        </label>
        <label>
          <span className="label">Phone *</span>
          <input name="phone" required type="tel" maxLength={20} autoComplete="tel" className="input" placeholder="+91" />
        </label>
        <label>
          <span className="label">Email *</span>
          <input name="email" required type="email" maxLength={160} autoComplete="email" className="input" />
        </label>
        <label>
          <span className="label">City or town</span>
          <input name="city" maxLength={80} autoComplete="address-level2" className="input" placeholder="Kochi" />
        </label>
        <label>
          <span className="label">Current job or course</span>
          <input name="currentRole" maxLength={160} className="input" placeholder="B.Tech ECE, final year" />
        </label>
        <label>
          <span className="label">Work experience (years)</span>
          <input name="experienceYears" type="number" min={0} max={50} step="0.5" className="input" placeholder="0 if you're a fresher" />
        </label>
        <label>
          <span className="label">When could you join?</span>
          <input name="noticePeriod" maxLength={60} className="input" placeholder="Immediately, after 30 days…" />
        </label>
        <label>
          <span className="label">Referred by someone at {companyName}?</span>
          <input name="referredBy" maxLength={120} className="input" placeholder="Their name" />
        </label>
      </div>
      <label className="block">
        <span className="label">Resume * (PDF, or a JPG or PNG photo, up to 5 MB)</span>
        <input name="resume" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="input" />
      </label>
      <label className="block">
        <span className="label">Anything you&apos;d like us to know</span>
        <textarea name="message" rows={4} maxLength={2000} className="input" placeholder="Why this job, projects you've built, languages you speak…" />
      </label>
      {/* Left empty by people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>I agree that {companyName} may keep my details and resume to consider me for this and future jobs.</span>
      </label>
      <button type="submit" disabled={sending} className="btn-primary w-full sm:w-auto">
        {sending ? "Sending…" : "Send application"}
      </button>
    </form>
  );
}
