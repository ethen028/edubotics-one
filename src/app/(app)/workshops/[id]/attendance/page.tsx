import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { dateKey } from "@/lib/attendance";
import { todayIST } from "@/lib/time";
import { canMarkAttendance, workshopDays } from "@/lib/workshops";
import { saveAttendance } from "../../actions";
import { loadWorkshop } from "../../data";
import { AttendanceList } from "../../ui";

export const metadata = { title: "Workshop attendance" };

const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** One day's register for a workshop, on a phone at the door or in the hall. */
export default async function WorkshopAttendancePage({ params, searchParams }: PageProps<"/workshops/[id]/attendance">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const w = await loadWorkshop(id);
  if (!w) notFound();
  if (!canMarkAttendance(user, w)) redirect(`/workshops/${id}`);
  const today = todayIST();
  const days = workshopDays(w);
  const open = days.filter((d) => d <= today);
  // Default to today when the workshop is on, else its last day so far.
  const day = days.find((d) => dateKey(d) === sp.day) ?? open[open.length - 1] ?? days[0];
  const locked = day > today || w.status === "CANCELLED";
  const people = w.registrations
    .filter((r) => r.status === "REGISTERED")
    .map((r) => {
      const mark = r.attendance.find((a) => a.date.getTime() === day.getTime());
      return { id: r.id, name: r.name, sub: [r.institution, r.detail].filter(Boolean).join(" · ") || null, present: mark ? mark.present : null };
    });
  const markedDays = new Set(w.registrations.flatMap((r) => r.attendance.map((a) => dateKey(a.date))));

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={
          <Link href={`/workshops/${w.id}`} className="link">
            {w.title}
          </Link>
        }
      />
      {days.length > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2">
          {days.map((d, i) => {
            const k = dateKey(d);
            const current = d.getTime() === day.getTime();
            return (
              <Link
                key={k}
                href={`/workshops/${w.id}/attendance?day=${k}`}
                className={`rounded-full px-3 py-1 text-sm ring-1 ${
                  current ? "bg-brand-600 text-white ring-brand-600" : d > today ? "text-slate-400 ring-slate-200" : "bg-white ring-slate-300"
                }`}
              >
                Day {i + 1} · {dayLabel(d)}
                {markedDays.has(k) && !current && " ✓"}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="max-w-xl">
        <p className="mb-3 text-sm text-slate-600">
          {dayLabel(day)}
          {locked && day > today && ": this day hasn't come yet."}
          {w.status === "CANCELLED" && ": the workshop is cancelled."}
        </p>
        {people.length === 0 ? (
          <Empty>Nobody is registered.</Empty>
        ) : (
          <AttendanceList key={dateKey(day)} action={saveAttendance.bind(null, w.id, dateKey(day))} people={people} locked={locked} />
        )}
      </div>
    </>
  );
}
