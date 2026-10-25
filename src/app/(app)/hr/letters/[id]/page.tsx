import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { letterEmail } from "@/lib/email-templates";
import { LETTER_KINDS, canIssueKind, type LetterBody } from "@/lib/letter-rules";
import { emailLetter } from "../../../emails/actions";
import { cancelLetter, issueOfferLetterAction } from "../actions";
import { LetterPreview, LetterStatusBadge } from "../ui";

export const metadata = { title: "Letter" };

export default async function LetterPage({ params }: PageProps<"/hr/letters/[id]">) {
  const user = await requireUser(["ADMIN", "HR"]);
  const { id } = await params;
  const letter = await db.hrLetter.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, firstName: true, personalEmail: true, workEmail: true, status: true } },
      offer: { select: { id: true, candidateId: true, candidate: { select: { name: true, email: true } } } },
      issuedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
      replacedBy: { select: { id: true, number: true } },
      replaces: { select: { id: true, number: true } },
      emails: { select: emailLogSelect, orderBy: { createdAt: "desc" } },
    },
  });
  if (!letter || !canIssueKind(user.role, letter.kind)) notFound();
  const settings = await getSettings();
  const meta = LETTER_KINDS[letter.kind];
  const body = letter.body as unknown as LetterBody;
  const own = !!letter.employeeId && letter.employeeId === user.employee?.id;
  const current = letter.status === "ISSUED";
  const e = letter.employee;
  const firstName = e?.firstName ?? letter.recipient.trim().split(/\s+/)[0];
  // Someone who has left may no longer read their work email.
  const to = letter.offer?.candidate.email ?? (e ? (e.status === "EXITED" ? (e.personalEmail ?? e.workEmail) : e.workEmail) : "");
  const fileName = `${meta.label} ${letter.recipient}${letter.number ? ` ${letter.number}` : ""}.pdf`;
  const back = letter.offer ? `/recruitment/candidates/${letter.offer.candidateId}` : e ? `/hr/employees/${e.id}` : "/hr/letters";

  return (
    <>
      <PageHeader
        title={`${meta.label}, ${letter.recipient}`}
        copy={letter.number}
        subtitle={
          <>
            {letter.number ?? "No number"} · issued {formatDate(letter.issuedOn)} by {letter.issuedBy.name} <LetterStatusBadge status={letter.status} />
          </>
        }
        actions={
          <>
            <a href={`/hr/letters/${letter.id}/pdf`} target="_blank" className="btn-primary">
              Download PDF
            </a>
            {current && !own && letter.kind !== "OFFER" && e && (
              <Link href={`/hr/letters/new?employee=${e.id}&kind=${letter.kind}&replaces=${letter.id}`} className="btn-secondary">
                Issue a fresh copy
              </Link>
            )}
            {current && letter.offer && (
              <form action={issueOfferLetterAction.bind(null, letter.offer.id)}>
                <button className="btn-secondary">Issue a fresh copy</button>
              </form>
            )}
            <Link href={back} className="btn-secondary">
              Back
            </Link>
          </>
        }
      />

      {letter.status === "REPLACED" && letter.replacedBy && (
        <p className="card mb-4 max-w-3xl border-slate-200 text-sm">
          A fresh copy replaced this one:{" "}
          <Link href={`/hr/letters/${letter.replacedBy.id}`} className="link">
            {letter.replacedBy.number ?? "open it"}
          </Link>
          .
        </p>
      )}
      {letter.status === "CANCELLED" && (
        <p className="card mb-4 max-w-3xl border-red-200 bg-red-50 text-sm text-red-800">
          Cancelled {formatDate(letter.cancelledAt)} by {letter.cancelledBy?.name ?? "an admin"}: {letter.cancelReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card">
          <LetterPreview body={body} />
          {letter.replaces && (
            <p className="mt-4 text-xs text-slate-500">
              Issued in place of{" "}
              <Link href={`/hr/letters/${letter.replaces.id}`} className="link">
                {letter.replaces.number ?? "an earlier copy"}
              </Link>
              .
            </p>
          )}
        </section>
        <div className="space-y-4">
          {current && !own && (
            <EmailComposer
              title="Email it"
              action={emailLetter.bind(null, letter.id)}
              draft={{ to, ...letterEmail({ kind: letter.kind, label: meta.label, number: letter.number, firstName }, user.name, settings) }}
              attachments={[fileName]}
              setup={mailSetup(settings)}
              admin={isAdmin(user)}
              hint={e?.status === "EXITED" ? "They have left, so this goes to their personal email if it is on their profile." : undefined}
              open
            />
          )}
          <EmailHistory emails={letter.emails} />
          {current && !own && (
            <details className="card text-sm">
              <summary className="cursor-pointer font-semibold">Cancel this letter</summary>
              <p className="mt-2 text-xs text-slate-500">For a letter given by mistake. Its number stays used and the PDF is marked cancelled. To correct a detail, issue a fresh copy instead.</p>
              <ActionForm action={cancelLetter.bind(null, letter.id)} className="mt-3 space-y-2">
                <input name="reason" required maxLength={300} placeholder="Why it is being cancelled" className="input" />
                <ConfirmButton message="Cancel this letter? Its number stays used." className="btn-secondary btn-sm">
                  Cancel letter
                </ConfirmButton>
              </ActionForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
