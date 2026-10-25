import Link from "next/link";
import type { LetterKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ISSUE_ORDER, LETTER_KINDS, canIssueKind } from "@/lib/letter-rules";
import { LetterStatusBadge } from "./ui";

export const metadata = { title: "Letters" };

export default async function LettersPage({ searchParams }: PageProps<"/hr/letters">) {
  const user = await requireUser(["ADMIN", "HR"]);
  const q = (await searchParams) as Record<string, string | undefined>;
  const kinds = (Object.keys(LETTER_KINDS) as LetterKind[]).filter((k) => canIssueKind(user.role, k));
  const kind = kinds.find((k) => k === q.kind);
  const where: Prisma.HrLetterWhereInput = { kind: kind ?? { in: kinds }, ...(q.employee ? { employeeId: q.employee } : {}) };
  const [letters, people] = await Promise.all([
    db.hrLetter.findMany({
      where,
      include: { issuedBy: { select: { name: true } } },
      orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.employee.findMany({ orderBy: [{ status: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, code: true, status: true } }),
  ]);
  const issuable = ISSUE_ORDER.filter((k) => canIssueKind(user.role, k));

  return (
    <>
      <PageHeader
        title="Letters"
        subtitle="Every letter and certificate issued to staff, numbered and kept here. Pick a person to issue a new one."
      />

      <section className="card mb-6 max-w-3xl">
        <h2 className="mb-3 font-semibold">Issue a letter</h2>
        <form action="/hr/letters/new" className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1">
            <span className="label">Person</span>
            <select name="employee" required className="input" defaultValue={q.employee ?? ""}>
              <option value="" disabled>
                Choose someone
              </option>
              {people
                .filter((p) => p.id !== user.employee?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.code}){p.status === "EXITED" ? ", left" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-48 flex-1">
            <span className="label">Letter</span>
            <select name="kind" className="input" defaultValue="">
              <option value="">See what can be issued</option>
              {issuable.map((k) => (
                <option key={k} value={k}>
                  {LETTER_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary">Continue</button>
        </form>
        {user.role === "HR" && <p className="mt-3 text-xs text-slate-500">Letters that show pay (appointment, salary revision, salary certificate, annual statement and offers) are issued by an admin.</p>}
        <p className="mt-2 text-xs text-slate-500">
          Offer letters are made from the offer in{" "}
          <Link href="/recruitment" className="link">
            Recruitment
          </Link>
          , and relieving letters are issued when someone is marked as left.
        </p>
      </section>

      <form className="mb-3 flex flex-wrap gap-2 text-sm">
        <select name="kind" defaultValue={kind ?? ""} className="input w-auto py-1">
          <option value="">All letters</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {LETTER_KINDS[k].label}
            </option>
          ))}
        </select>
        <select name="employee" defaultValue={q.employee ?? ""} className="input w-auto py-1">
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
            </option>
          ))}
        </select>
        <button className="btn-secondary btn-sm">Show</button>
      </form>

      {letters.length === 0 ? (
        <Empty>No letters issued yet{kind || q.employee ? " for this choice" : ""}.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Letter</th>
                <th>For</th>
                <th>Issued</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/hr/letters/${l.id}`} className="link">
                      {l.number ?? "ID card"}
                    </Link>
                  </td>
                  <td>{LETTER_KINDS[l.kind].label}</td>
                  <td>{l.recipient}</td>
                  <td className="whitespace-nowrap">{formatDate(l.issuedOn)}</td>
                  <td>{l.issuedBy.name}</td>
                  <td>
                    <LetterStatusBadge status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
