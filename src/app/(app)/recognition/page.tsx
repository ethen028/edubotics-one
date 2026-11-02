import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { monthLabel, monthStart } from "@/lib/plan-rules";
import { todayIST } from "@/lib/time";
import { milestones, tally } from "@/lib/recognition-rules";
import { RecognitionItem, initials } from "./ui";

export const metadata = { title: "Recognition" };

const VIEWS = [
  { key: "all", label: "Everyone" },
  { key: "spotlight", label: "Spotlight" },
  { key: "mine", label: "Thanks to me" },
  { key: "given", label: "Thanks I gave" },
] as const;

const include = { from: { select: { name: true } }, to: { select: { name: true } } } as const;

/** The recognition wall: every thank-you in the company, a monthly summary and each person's milestones. */
export default async function RecognitionPage({ searchParams }: PageProps<"/recognition">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "all";
  const person = sp.person ? await db.user.findUnique({ where: { id: sp.person }, select: { id: true, name: true } }) : null;
  const subject = person ?? { id: user.id, name: user.name };

  const where: Prisma.RecognitionWhereInput = person
    ? { OR: [{ toId: person.id }, { fromId: person.id }] }
    : view === "spotlight"
      ? { featuredAt: { not: null } }
      : view === "mine"
        ? { toId: user.id }
        : view === "given"
          ? { fromId: user.id }
          : {};
  const first = monthStart(todayIST());

  const [rows, thisMonth, received, givenCount] = await Promise.all([
    db.recognition.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.recognition.findMany({ where: { createdAt: { gte: first } }, select: { toId: true, to: { select: { name: true } } } }),
    db.recognition.findMany({ where: { toId: subject.id }, select: { value: true } }),
    db.recognition.count({ where: { fromId: subject.id } }),
  ]);
  const board = tally(thisMonth);
  const { done, next } = milestones(received, givenCount);
  const byValue = [...received.reduce((m, r) => m.set(r.value, (m.get(r.value) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const self = subject.id === user.id;

  return (
    <>
      <PageHeader
        title={person ? person.name : "Recognition"}
        subtitle={person ? "Thanks received and given" : "Thank a colleague for good work. Everyone in the company can see these."}
        actions={
          <>
            {person && (
              <Link href="/recognition" className="btn-secondary">
                Everyone
              </Link>
            )}
            {person?.id !== user.id && (
              <Link href={person ? `/recognition/give?to=${person.id}` : "/recognition/give"} className="btn-primary">
                {person ? `Thank ${person.name.split(" ")[0]}` : "Thank a colleague"}
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {!person && (
            <div className="flex flex-wrap gap-2">
              {VIEWS.map((v) => (
                <Link key={v.key} href={v.key === "all" ? "/recognition" : `/recognition?view=${v.key}`} className={`filter-chip ${view === v.key ? "filter-chip-active" : ""}`}>
                  {v.label}
                </Link>
              ))}
            </div>
          )}
          {rows.length === 0 ? (
            <Empty>
              {view === "spotlight"
                ? "Nothing has been put in the spotlight yet. Managers can pick any recognition below to show it on everyone's Home."
                : view === "mine" || (person && self)
                  ? "No thanks yet. They will show up here."
                  : view === "given"
                    ? "You haven't thanked anyone yet."
                    : person
                      ? `Nothing for ${person.name} yet.`
                      : "No one has been thanked yet. Use “Thank a colleague” to send the first one."}
            </Empty>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <RecognitionItem key={r.id} r={r} viewer={user} />
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card">
            <h2 className="mb-3 font-semibold">{self ? "Your milestones" : `${subject.name.split(" ")[0]}'s milestones`}</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Thanks received</div>
                <div className="text-lg font-semibold">{received.length}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Thanks given</div>
                <div className="text-lg font-semibold">{givenCount}</div>
              </div>
            </div>
            {done.length === 0 ? (
              <p className="text-sm text-slate-500">No milestones yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {done.map((m) => (
                  <li key={m.key} title={m.detail} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {m.label}
                  </li>
                ))}
              </ul>
            )}
            {next && (
              <p className="mt-3 text-xs text-slate-500">
                Next: {next.label} ({next.have} of {next.need})
              </p>
            )}
            {byValue.length > 0 && (
              <>
                <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500 uppercase">Thanked for</h3>
                <ul className="space-y-1 text-sm">
                  {byValue.map(([v, n]) => (
                    <li key={v} className="flex justify-between gap-2">
                      <span>{v}</span>
                      <span className="text-slate-500">{n}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">{monthLabel(first)}</h2>
            {board.length === 0 ? (
              <p className="text-sm text-slate-500">No recognition yet this month.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {board.map((b) => (
                  <li key={b.userId} className="flex items-center gap-2.5">
                    <span className="member-initials" aria-hidden>
                      {initials(b.name)}
                    </span>
                    <Link href={`/recognition?person=${b.userId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {b.name}
                    </Link>
                    <span className="text-slate-500">{b.count === 1 ? "1 thank-you" : `${b.count} thank-yous`}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              {thisMonth.length} {thisMonth.length === 1 ? "recognition" : "recognitions"} this month. No points or prizes: it is a
              thank-you, not a contest.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
