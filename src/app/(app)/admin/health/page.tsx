import { requireUser } from "@/lib/auth";
import { telemetrySnapshot } from "@/lib/telemetry";

export const metadata = { title: "Service metrics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  await requireUser(["ADMIN"]);
  const metrics = telemetrySnapshot();
  return <div className="max-w-5xl space-y-6"><h1 className="text-3xl font-semibold">Service metrics</h1>
    <p className="text-sm text-slate-600">Local operational counts, retained for up to 24 hours in hourly buckets. This process started {new Date(metrics.startedAt).toISOString()}. Refresh to update. No visitor IDs, raw paths, query strings or error messages are retained here.</p>
    <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Counts reset when this process restarts. Multiple workers or serverless instances have separate memory, and proxy and app workers may not share counters. Status and duration describe only the response observed by the recording hook; a forwarded request is not proof of a successful page render. These are not unique visitors, uptime monitoring or complete request traces.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Recorded request groups</caption><thead><tr><th className="p-3">Route group</th><th className="p-3">Status group</th><th className="p-3">Requests</th><th className="p-3">Average observed ms</th></tr></thead><tbody>
      {metrics.rows.map((row) => <tr key={`${row.route}:${row.status}`} className="border-t border-slate-200"><td className="p-3">{row.route}</td><td className="p-3">{row.status}</td><td className="p-3">{row.count}</td><td className="p-3">{row.durationCount ? Math.round(row.durationTotal / row.durationCount) : "—"}</td></tr>)}
    </tbody></table>{metrics.rows.length === 0 && <p className="p-3 text-sm text-slate-500">No requests recorded in this process yet.</p>}</div>
    <section><h2 className="text-xl font-semibold">Recent error references</h2><p className="mt-2 text-sm text-slate-600">Up to 100 safe references. Matching structured events are written to server logs; raw error contents are intentionally omitted.</p>
      <ul className="mt-3 space-y-2 text-sm">{metrics.errors.map((event) => <li key={event.id} className="break-all rounded border border-slate-200 p-3">{new Date(event.at).toISOString()} · {event.route} · {event.id}</li>)}</ul>
      {metrics.errors.length === 0 && <p className="mt-3 text-sm text-slate-500">No errors recorded in this process.</p>}
    </section>
  </div>;
}
