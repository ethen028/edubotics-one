import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatMinutes } from "@/lib/attendance";
import { todayIST } from "@/lib/time";
import { monthSessions } from "./month";

export const metadata = { title: "Delivery reports" };

type Tally = { name: string; href?: string; held: number; cancelled: number; missed: number; due: number; upcoming: number; minutes: number; present: number[] };
const blank = (name: string, href?: string): Tally => ({ name, href, held: 0, cancelled: 0, missed: 0, due: 0, upcoming: 0, minutes: 0, present: [] });
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : "—");

export default async function DeliveryReportsPage({ searchParams }: PageProps<"/operations/reports">) {
  await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { label, prev, next, key, sessions } = await monthSessions(sp.month);
  const today = todayIST();

  const byTrainer = new Map<string, Tally>();
  const bySchool = new Map<string, Tally>();
  const total = blank("All");
  for (const s of sessions) {
    const t = s.trainer ? (byTrainer.get(s.trainer.id) ?? blank(s.trainer.name)) : (byTrainer.get("") ?? blank("No trainer"));
    const sc = bySchool.get(s.programme.id) ?? blank(s.programme.organization.name, `/operations/programmes/${s.programme.id}`);
    for (const x of [t, sc, total]) {
      if (s.status === "COMPLETED") {
        x.held++;
        x.minutes += s.durationMins;
        if (s.studentsPresent != null) x.present.push(s.studentsPresent);
      } else if (s.status === "CANCELLED") x.cancelled++;
      else if (s.status === "MISSED") x.missed++;
      else if (s.date < today) x.due++;
      else x.upcoming++;
    }
    byTrainer.set(s.trainer?.id ?? "", t);
    bySchool.set(s.programme.id, sc);
  }
  const sortByName = (m: Map<string, Tally>) => [...m.values()].sort((a, b) => a.name.localeCompare(b.name));

  const table = (title: string, rows: Tally[], kind: "trainer" | "school") => (
    <section className="card min-w-0">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{kind === "trainer" ? "Trainer" : "School"}</th>
              <th>Held</th>
              <th>{kind === "trainer" ? "Teaching time" : "Avg. present"}</th>
              <th>Cancelled</th>
              <th>Missed</th>
              <th>Logs due</th>
              <th>Still to come</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">
                  {r.href ? (
                    <Link href={r.href} className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </td>
                <td>{r.held}</td>
                <td>{kind === "trainer" ? formatMinutes(r.minutes) : avg(r.present)}</td>
                <td>{r.cancelled}</td>
                <td className={r.missed ? "text-red-600" : ""}>{r.missed}</td>
                <td className={r.due ? "font-medium text-red-600" : ""}>{r.due}</td>
                <td>{r.upcoming}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      <PageHeader
        title="Delivery reports"
        subtitle={label}
        actions={
          <>
            <Link href={`?month=${prev}`} className="btn-secondary">
              ← Previous
            </Link>
            <Link href={`?month=${next}`} className="btn-secondary">
              Next →
            </Link>
            <a href={`/operations/reports/export?month=${key}`} className="btn-primary">
              Download CSV
            </a>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sessions held" value={total.held} />
        <Stat label="Teaching time" value={formatMinutes(total.minutes)} />
        <Stat label="Cancelled or missed" value={total.cancelled + total.missed} />
        <Stat label="Logs due" value={total.due} />
      </div>

      {sessions.length === 0 ? (
        <Empty>No school sessions in {label}.</Empty>
      ) : (
        <div className="space-y-6">
          {table("By trainer", sortByName(byTrainer), "trainer")}
          {table("By school", sortByName(bySchool), "school")}
        </div>
      )}
    </>
  );
}
