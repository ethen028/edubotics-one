import Link from "next/link";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";

type Pending = { id: string; kind: string; title: string; ackDueDate: Date | null }[];

/** Amber card listing what the signed-in person still has to read and acknowledge. */
export function PendingAcks({ notices }: { notices: Pending }) {
  if (notices.length === 0) return null;
  const today = todayIST();
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">
        {notices.length === 1 ? "1 notice needs" : `${notices.length} notices need`} your acknowledgement
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/notices/${n.id}`} className="font-medium text-amber-950 hover:underline">
              {n.kind === "POLICY" ? "Policy: " : ""}
              {n.title}
            </Link>
            {n.ackDueDate && (
              <span className={`text-xs ${n.ackDueDate < today ? "font-semibold text-red-700" : "text-amber-800"}`}>
                {n.ackDueDate < today ? "Overdue, was due " : "By "}
                {formatDate(n.ackDueDate)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
