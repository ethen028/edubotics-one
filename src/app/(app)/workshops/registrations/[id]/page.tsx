import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { certificateEmail } from "@/lib/email-templates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { formatDate, formatINR, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, methodLabel } from "@/lib/invoices";
import { canManageWorkshop, dateSpan, standing, workshopDays } from "@/lib/workshops";
import {
  cancelCertificate,
  deleteRegistration,
  issueCertificate,
  recordPayment,
  removePayment,
  setRegistrationStatus,
  updateRegistration,
} from "../../actions";
import { emailCertificate } from "../../../emails/actions";

export const metadata = { title: "Participant" };

export default async function RegistrationPage({ params }: PageProps<"/workshops/registrations/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const r = await db.workshopRegistration.findUnique({
    where: { id },
    include: {
      workshop: { include: { organization: { select: { name: true } } } },
      payments: { include: { recordedBy: { select: { name: true } } }, orderBy: { paidOn: "asc" } },
      attendance: true,
      certificate: { include: { emails: { select: emailLogSelect, orderBy: { createdAt: "desc" } } } },
      addedBy: { select: { name: true } },
    },
  });
  if (!r) notFound();
  const w = r.workshop;
  if (!canManageWorkshop(user, w)) redirect(`/workshops/${w.id}`);
  const settings = await getSettings();
  const today = todayIST();
  const st = standing(w, r, today);
  const days = workshopDays(w);
  const perPerson = w.feeType === "PER_PERSON";
  const money = isManagerOrAdmin(user);
  const live = r.status === "REGISTERED";
  const cert = r.certificate;

  return (
    <>
      <PageHeader
        title={r.name}
        subtitle={
          <>
            {!live && <Badge>Registration cancelled</Badge>}{" "}
            <Link href={`/workshops/${w.id}`} className="link">
              {w.title}
            </Link>{" "}
            · {dateSpan(w)}
          </>
        }
        actions={
          <Link href={`/workshops/${w.id}`} className="btn-secondary">
            Back to workshop
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="card">
            <h2 className="mb-3 font-semibold">Details</h2>
            <ActionForm action={updateRegistration.bind(null, r.id)} className="space-y-3">
              <Field label="Name, as on the certificate">
                <input name="name" required maxLength={120} defaultValue={r.name} className="input" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <input name="email" type="email" defaultValue={r.email ?? ""} className="input" />
                </Field>
                <Field label="Phone">
                  <input name="phone" defaultValue={r.phone ?? ""} className="input" />
                </Field>
                <Field label={w.audience === "PROFESSIONAL" ? "Company" : "College or school"}>
                  <input name="institution" defaultValue={r.institution ?? ""} className="input" />
                </Field>
                <Field label={w.audience === "PROFESSIONAL" ? "Designation" : "Course and year"}>
                  <input name="detail" defaultValue={r.detail ?? ""} className="input" />
                </Field>
                {perPerson && money && (
                  <Field label="Fee for this person (₹)">
                    <input name="fee" type="number" min="0" step="1" defaultValue={Number(r.fee)} className="input" />
                    <span className="mt-1 block text-xs text-slate-500">Lower it for a discount, 0 to waive it. The workshop fee is {formatINR(w.fee)}.</span>
                  </Field>
                )}
              </div>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </section>

          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Attendance</h2>
              <span className="text-sm text-slate-600">
                {st.attended} of {days.length} day{days.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {days.map((d, i) => {
                const a = r.attendance.find((x) => x.date.getTime() === d.getTime());
                return (
                  <li key={i}>
                    <Link
                      href={`/workshops/${w.id}/attendance?day=${toDateInput(d)}`}
                      className={`inline-block rounded-full px-3 py-1 ring-1 ${
                        !a ? "text-slate-400 ring-slate-200" : a.present ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
                      }`}
                    >
                      Day {i + 1}: {!a ? "not marked" : a.present ? "present" : "absent"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {perPerson && money && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Fee</h2>
                <span className="text-sm">
                  {Number(r.fee) === 0 ? "Waived" : st.due > 0 ? <span className="text-amber-700">{formatINR(st.due)} due</span> : <Badge color="green">Paid in full</Badge>}
                </span>
              </div>
              {r.payments.length > 0 && (
                <ul className="mb-4 divide-y divide-slate-100 text-sm">
                  {r.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {formatINR(p.amount)} on {formatDate(p.paidOn)} · {methodLabel[p.method]}
                        {p.reference && ` · ${p.reference}`}
                        <span className="text-xs text-slate-500"> · recorded by {p.recordedBy.name}</span>
                      </span>
                      {isAdmin(user) && (
                        <form action={removePayment.bind(null, p.id)}>
                          <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {st.due > 0 && live && (
                <ActionForm action={recordPayment.bind(null, r.id)} className="grid gap-3 sm:grid-cols-4">
                  <Field label="Amount (₹)">
                    <input type="number" name="amount" min="1" step="0.01" max={st.due} required defaultValue={st.due} className="input" />
                  </Field>
                  <Field label="Received on">
                    <input type="date" name="paidOn" required defaultValue={toDateInput(today)} className="input" />
                  </Field>
                  <Field label="How">
                    <select name="method" defaultValue="UPI" className="input">
                      <Options values={PAYMENT_METHODS} labels={(m) => methodLabel[m as keyof typeof methodLabel]} />
                    </select>
                  </Field>
                  <Field label="Reference">
                    <input name="reference" className="input" placeholder="UPI ref or receipt no." />
                  </Field>
                  <div className="sm:col-span-4">
                    <SubmitButton>Record payment</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-2 text-sm">
            <h2 className="font-semibold">Certificate</h2>
            {cert ? (
              <>
                <p>
                  <strong>{cert.number}</strong>, issued {formatDate(cert.issuedOn)}{" "}
                  {cert.status === "CANCELLED" && <Badge color="red">Cancelled</Badge>}
                </p>
                {cert.status === "CANCELLED" && <p className="text-xs text-slate-500">“{cert.cancelReason}”</p>}
                <div className="flex gap-2">
                  <a href={`/workshops/certificates/${cert.id}/pdf`} target="_blank" className="btn-secondary">
                    Open PDF
                  </a>
                  <a href={`/workshops/certificates/${cert.id}/pdf?download`} className="btn-secondary">
                    Download
                  </a>
                </div>
              </>
            ) : st.blocker ? (
              <p className="text-slate-500">Not yet: {st.blocker.toLowerCase()}.</p>
            ) : (
              <form action={issueCertificate.bind(null, r.id)}>
                <p className="mb-2">{r.name} has earned a certificate.</p>
                <button className="btn-primary">Issue certificate</button>
              </form>
            )}
          </section>

          {cert?.status === "ISSUED" && (
            <EmailComposer
              title="Email the certificate"
              action={emailCertificate.bind(null, cert.id)}
              draft={{
                to: r.email ?? "",
                ...certificateEmail({ name: r.name, workshop: w.title, dates: dateSpan(w), number: cert.number }, user.name, settings),
              }}
              attachments={[`Certificate ${r.name} ${cert.number.replace(/\//g, "-")}.pdf`]}
              setup={mailSetup(settings)}
              admin={isAdmin(user)}
              submitLabel="Send certificate"
            />
          )}
          {cert && <EmailHistory emails={cert.emails} />}

          {cert?.status === "ISSUED" && isAdmin(user) && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Cancel this certificate</summary>
              <ActionForm action={cancelCertificate.bind(null, cert.id)} className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  For a certificate given by mistake. Its number stays used and shows as cancelled when checked. To fix a misspelt name, just edit the name: the
                  certificate keeps its number.
                </p>
                <Field label="Why">
                  <input name="reason" required className="input" placeholder="e.g. Issued to the wrong person" />
                </Field>
                <SubmitButton className="btn-danger">Cancel certificate</SubmitButton>
              </ActionForm>
            </details>
          )}

          <section className="space-y-2 text-xs">
            {live ? (
              cert?.status !== "ISSUED" && (
                <form action={setRegistrationStatus.bind(null, r.id, true)}>
                  <button className="text-slate-500 hover:text-red-600">Cancel this registration</button>
                </form>
              )
            ) : (
              <form action={setRegistrationStatus.bind(null, r.id, false)}>
                <button className="text-brand-600 hover:underline">Register again</button>
              </form>
            )}
            {!cert && r.payments.length === 0 && r.attendance.length === 0 && (
              <form action={deleteRegistration.bind(null, r.id)}>
                <button className="text-slate-400 hover:text-red-600">Delete (added by mistake)</button>
              </form>
            )}
            <p className="text-slate-400">
              Added by {r.addedBy.name} on {formatDate(r.createdAt)}.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
