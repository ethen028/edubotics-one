export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-8">
      <span className="sr-only">Loading your workspace…</span>
      <div aria-hidden="true" className="space-y-3 animate-pulse">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="h-4 w-64 max-w-full rounded bg-slate-100" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3 animate-pulse">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white" />)}
      </div>
      <div aria-hidden="true" className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
