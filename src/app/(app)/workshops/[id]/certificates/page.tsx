import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MailNotReady } from "@/components/email";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { canManageWorkshop, dateSpan, standing } from "@/lib/workshops";
import { issueCertificates } from "../../actions";
import { emailWorkshopCertificates } from "../../../emails/actions";
import { loadWorkshop } from "../../data";

export const metadata = { title: "Certificates" };

export default async function WorkshopCertificatesPage({ params }: PageProps<"/workshops/[id]/certificates">) {
  const user = await requireUser();
  const { id } = await params;
  const [w, settings] = await Promise.all([loadWorkshop(id), getSettings()]);
  if (!w) notFound();
  if (!canManageWorkshop(user, w)) redirect(`/workshops/${id}`);
  const today = todayIST();
  const rows = w.registrations.filter((r) => r.status === "REGISTERED").map((r) => ({ r, st: standing(w, r, today) }));
  const issued = rows.filter((x) => x.r.certificate?.status === "ISSUED");
  const ready = rows.filter((x) => !x.r.certificate && !x.st.blocker);
  const waiting = rows.filter((x) => !x.r.certificate && x.st.blocker);
  const toEmail = issued.filter((x) => x.r.certificate!.emails.length === 0);
  const setup = mailSetup(settings);
  const unsigned = !settings.certSignatoryName;

  return (
    <>
      <PageHeader
        title="Certificates"
        subtitle={
          <>
            <Link href={`/workshops/${w.id}`} className="link">
              {w.title}
            </Link>{" "}
            · {dateSpan(w)} · {w.certificateTitle}
          </>
        }
        actions={
          issued.length > 0 && (
            <a href={`/workshops/${w.id}/certificates/pdf`} target="_blank" className="btn-secondary">
              Print all ({issued.length})
            </a>
          )
        }
      />

      {unsigned && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          Nobody is set to sign certificates yet, so the right-hand signature line is blank.{" "}
          {user.role === "ADMIN" ? (
            <Link href="/admin/settings#certificates" className="link">
              Add the name and signature in Settings
            </Link>
          ) : (
            "Ask an admin to add the name and signature in Settings."
          )}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 font-semibold">Ready to issue ({ready.length})</h2>
            {ready.length === 0 ? (
              <Empty>Nobody is waiting for a certificate.</Empty>
            ) : (
              <div className="card space-y-3">
                <p className="text-sm">{ready.map((x) => x.r.name).join(", ")}</p>
                <ActionForm action={issueCertificates.bind(null, w.id)}>
                  <SubmitButton pendingLabel="Issuing…">Issue {ready.length} certificate{ready.length === 1 ? "" : "s"}</SubmitButton>
                </ActionForm>
                <p className="text-xs text-slate-500">Each gets the next number in this year&apos;s series. Check the names are spelt right first: open a name on the workshop page to correct it.</p>
              </div>
            )}
          </section>

          {issued.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Issued ({issued.length})</h2>
              <div className="card overflow-x-auto p-0">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Certificate</th>
                      <th>Issued</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issued.map(({ r }) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/workshops/registrations/${r.id}`} className="link font-medium">
                            {r.name}
                          </Link>
                          {r.institution && <div className="text-xs text-slate-500">{r.institution}</div>}
                        </td>
                        <td>
                          <a href={`/workshops/certificates/${r.certificate!.id}/pdf`} target="_blank" className="link whitespace-nowrap">
                            {r.certificate!.number}
                          </a>
                        </td>
                        <td className="whitespace-nowrap">{formatDate(r.certificate!.issuedOn)}</td>
                        <td className="text-xs">
                          {r.certificate!.emails.length ? (
                            <Badge color="green">Emailed</Badge>
                          ) : r.email ? (
                            <span className="text-slate-500">Not yet</span>
                          ) : (
                            <span className="text-amber-700">No email address</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section>
              <h2 className="mb-3 font-semibold">Not yet earned ({waiting.length})</h2>
              <div className="card p-0">
                <ul className="divide-y divide-slate-100 text-sm">
                  {waiting.map(({ r, st }) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                      <Link href={`/workshops/registrations/${r.id}`} className="link">
                        {r.name}
                      </Link>
                      <span className="text-slate-500">{st.blocker}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3 text-sm">
            <h2 className="font-semibold">Email certificates</h2>
            {setup !== "READY" ? (
              <MailNotReady setup={setup} admin={user.role === "ADMIN"} />
            ) : toEmail.length === 0 ? (
              <p className="text-slate-500">{issued.length ? "Everyone with a certificate has it by email." : "Issue certificates first."}</p>
            ) : (
              <>
                <p>
                  Sends each person their own certificate as a PDF, to the email they registered with.{" "}
                  {toEmail.filter((x) => !x.r.email).length > 0 && `${toEmail.filter((x) => !x.r.email).length} without an email address will be skipped.`}
                </p>
                <ActionForm action={emailWorkshopCertificates.bind(null, w.id)}>
                  <SubmitButton pendingLabel="Sending…">Email {toEmail.filter((x) => x.r.email).length} certificates</SubmitButton>
                </ActionForm>
                <p className="text-xs text-slate-500">To change the message for one person, open their name and send it from there.</p>
              </>
            )}
          </section>
          <section className="card space-y-1 text-xs text-slate-600">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">How certificates work</h2>
            <p>Someone earns a certificate once the last day is reached, they attended at least {w.minAttendancePct}% of the days{w.certNeedsPayment && w.feeType === "PER_PERSON" ? " and their fee is fully paid" : ""}.</p>
            <p>The first trainer signs on the left; {settings.certSignatoryName ?? "the person set in Settings"} signs on the right.</p>
            <p>Anyone can check a certificate number on the Workshops page.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
