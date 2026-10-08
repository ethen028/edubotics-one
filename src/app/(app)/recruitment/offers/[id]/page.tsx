import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { canOffer } from "@/lib/recruitment";
import { PrintButton } from "../../../payroll/payslip/[id]/print-button";

export const metadata = { title: "Offer letter" };

const BASIS = {
  FULL_TIME: "on a full-time basis",
  PART_TIME: "on a part-time basis",
  CONTRACT: "on a contract basis",
  INTERN: "as an intern",
} as const;

export default async function OfferLetterPage({ params }: PageProps<"/recruitment/offers/[id]">) {
  const user = await requireUser();
  if (!canOffer(user)) redirect("/?denied=1");
  const { id } = await params;
  const offer = await db.offer.findUnique({
    where: { id },
    include: { candidate: true, department: true, manager: true },
  });
  if (!offer) notFound();

  const monthly = Number(offer.basic) + Number(offer.hra) + Number(offer.specialAllowance);
  const rows: [string, number][] = [
    ["Basic", Number(offer.basic)],
    ["House rent allowance", Number(offer.hra)],
    ["Special allowance", Number(offer.specialAllowance)],
  ];
  const firstName = offer.candidate.name.trim().split(/\s+/)[0];

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href={`/recruitment/candidates/${offer.candidateId}`} className="btn-secondary">
          Back
        </Link>
        <PrintButton />
        {offer.status === "DRAFT" && (
          <span className="self-center text-sm text-slate-500">After sending it, mark the offer as sent on the candidate&apos;s page.</span>
        )}
      </div>
      <article className="card mx-auto max-w-3xl space-y-4 text-sm leading-relaxed print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="text-lg font-semibold">Edubotics Global</div>
            <div className="text-slate-500">Edappally, Kochi, Kerala · www.eduboticsglobal.com</div>
          </div>
          <div className="text-right text-slate-500">{formatDate(offer.sentAt ?? offer.createdAt)}</div>
        </header>

        <div>
          <div className="font-medium">{offer.candidate.name}</div>
          {offer.candidate.city && <div>{offer.candidate.city}</div>}
          {offer.candidate.email && <div>{offer.candidate.email}</div>}
        </div>

        <h1 className="text-base font-semibold">Offer of employment</h1>
        <p>Dear {firstName},</p>
        <p>
          We are happy to offer you the position of <b>{offer.designation}</b>
          {offer.department && <> in our {offer.department.name} team</>} at Edubotics Global, {BASIS[offer.employmentType]}. Your date of joining will be <b>{formatDate(offer.joiningDate)}</b>
          {offer.manager && (
            <>
              , and you will report to {offer.manager.firstName} {offer.manager.lastName}
            </>
          )}
          .
        </p>

        <div>
          <p className="mb-2">Your monthly salary will be:</p>
          <table className="w-full max-w-md text-sm">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-b border-slate-100">
                  <td className="py-1">{label}</td>
                  <td className="py-1 text-right">{formatINR(value)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1">Gross per month</td>
                <td className="py-1 text-right">{formatINR(monthly)}</td>
              </tr>
              <tr className="text-slate-500">
                <td className="py-1">Gross per year</td>
                <td className="py-1 text-right">{formatINR(monthly * 12)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {offer.probationMonths > 0 && (
          <p>You will be on probation for the first {offer.probationMonths} months, after which your role will be confirmed.</p>
        )}
        {offer.notes && <p className="whitespace-pre-line">{offer.notes}</p>}
        <p>
          On your first day, please bring your Aadhaar or another ID proof, your PAN card, your bank details and your educational
          certificates.
        </p>
        {offer.respondBy && <p>Please confirm your acceptance by {formatDate(offer.respondBy)}.</p>}
        <p>We look forward to having you with us.</p>

        <div className="grid grid-cols-2 gap-8 pt-10">
          <div>
            <div className="border-t border-slate-400 pt-1">For Edubotics Global</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-1">Accepted by {offer.candidate.name}</div>
          </div>
        </div>
      </article>
    </>
  );
}
