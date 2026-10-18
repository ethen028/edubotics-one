"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body className="bg-slate-50 text-slate-900">
    <title>Service unavailable · Edubotics One</title>
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
      <p className="text-sm font-semibold text-brand-700">Edubotics One</p>
      <h1 className="mt-3 text-3xl font-semibold">The workspace is unavailable</h1>
      <p className="mt-3 text-sm text-slate-600">Try again in a moment. If this continues, ask your admin to check the service.</p>
      <button type="button" onClick={retry} className="btn-primary mt-6 self-start">Try again</button>
    </main>
  </body></html>;
}
