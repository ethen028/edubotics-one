"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { void fetch("/api/client-errors", { method: "POST", keepalive: true }).catch(() => {}); }, []);
  return (
    <main id="main-content" className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center p-6">
      <p className="mb-3 text-xs font-semibold tracking-widest text-brand-600 uppercase">Edubotics One</p>
      <h1 className="text-3xl font-semibold">We couldn’t load this page</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">Try again in a moment. If this keeps happening, ask your admin to check the service.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={retry} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Go home</Link>
      </div>
    </main>
  );
}
