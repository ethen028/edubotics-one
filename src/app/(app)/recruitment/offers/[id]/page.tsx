import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { canOffer } from "@/lib/recruitment";
import { PageHeader } from "@/components/ui";
import { issueOfferLetterAction } from "../../../hr/letters/actions";
import { LetterStatusBadge } from "../../../hr/letters/ui";

export const metadata = { title: "Offer letter" };

/** The offer letter is issued as a numbered HR letter on the letterhead, then downloaded or emailed from there. */
export default async function OfferLetterPage({ params }: PageProps<"/recruitment/offers/[id]">) {
  const user = await requireUser();
  if (!canOffer(user)) redirect("/?denied=1");
  const { id } = await params;
  const offer = await db.offer.findUnique({
    where: { id },
    include: { candidate: true, department: true, manager: true, letters: { orderBy: { createdAt: "desc" }, include: { issuedBy: { select: { name: true } } } } },
  });
  if (!offer) notFound();
  const monthly = Number(offer.basic) + Number(offer.hra) + Number(offer.specialAllowance);
  const current = offer.letters.find((l) => l.status === "ISSUED");

  return (
    <>
      <PageHeader
        title={`Offer letter, ${offer.candidate.name}`}
        subtitle={`${offer.designation} · ${humanize(offer.status)}`}
        actions={
          <>
            {current && (
              <Link href={`/hr/letters/${current.id}`} className="btn-primary">
                Open the letter
              </Link>
            )}
            <form action={issueOfferLetterAction.bind(null, offer.id)}>
              <button className={current ? "btn-secondary" : "btn-primary"}>{current ? "Issue a fresh copy" : "Issue the offer letter"}</button>
            </form>
            <Link href={`/recruitment/candidates/${offer.candidateId}`} className="btn-secondary">
              Back
            </Link>
          </>
        }
      />
      <section className="card mb-6 max-w-3xl text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-slate-500">Role</dt>
          <dd>
            {offer.designation}
            {offer.department && `, ${offer.department.name}`} ({humanize(offer.employmentType).toLowerCase()})
          </dd>
          <dt className="text-slate-500">Joining</dt>
          <dd>{formatDate(offer.joiningDate)}</dd>
          <dt className="text-slate-500">Reports to</dt>
          <dd>{offer.manager ? `${offer.manager.firstName} ${offer.manager.lastName}` : "—"}</dd>
          <dt className="text-slate-500">{offer.employmentType === "INTERN" ? "Stipend" : "Gross"}</dt>
          <dd>
            {formatINR(monthly)} a month, {formatINR(monthly * 12)} a year
          </dd>
          <dt className="text-slate-500">Probation</dt>
          <dd>{offer.probationMonths ? `${offer.probationMonths} months` : "None"}</dd>
          {offer.respondBy && (
            <>
              <dt className="text-slate-500">Reply by</dt>
              <dd>{formatDate(offer.respondBy)}</dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          The letter is printed on the letterhead with these terms, numbered in the HR letter series, and kept under HR → Letters. If you change the offer, issue a fresh copy.
          {offer.status === "DRAFT" && " After sending it, mark the offer as sent on the candidate's page."}
        </p>
      </section>
      {offer.letters.length > 0 && (
        <section className="card max-w-3xl p-0">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Copies issued</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {offer.letters.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <Link href={`/hr/letters/${l.id}`} className="link">
                  {l.number}
                </Link>
                <span className="text-xs text-slate-500">
                  {formatDate(l.issuedOn)} by {l.issuedBy.name}
                </span>
                <LetterStatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
