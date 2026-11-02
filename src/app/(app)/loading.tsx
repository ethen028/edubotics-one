// Shown at once when someone opens a page, until the page's data arrives: grey blocks in the
// shape of a page header, a row of number cards and a table.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading the page">
      <div className="mb-6 space-y-2">
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
      <div className="card space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-5" />
        ))}
      </div>
    </div>
  );
}
