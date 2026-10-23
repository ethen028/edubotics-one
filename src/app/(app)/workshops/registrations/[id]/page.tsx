import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { certificateEmail, receiptEmail } from "@/lib/email-templates";
import { ActionForm, SubmitButton, ConfirmButton } from "@/components/action-form";
import { EmailComposer, EmailHistory, emailLogSelect } from "@/components/email";
import { Badge, Field, Options, PageHeader } from "@/components/ui";
import { formatDate, formatINR, toDateInput } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, methodLabel } from "@/lib/invoices";
import { canManageWorkshop, dateSpan, standing, workshopDays } from "@/lib/workshops";
import {
  cancelCertificate,
  cancelReceipt,
  deleteRegistration,
  issueCertificate,
  recordPayment,
  setRegistrationStatus,
  updateRegistration,
} from "../../actions";
import { emailCertificate, emailReceipt } from "../../../emails/actions";
import { CopyButton } from "@/components/copy-button";

export const metadata = { title: "Participant" };

export default async function RegistrationPage({ params, searchParams }: PageProps<"/workshops/registrations/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { receipt: receiptParam } = await searchParams;
  const r = await db.workshopRegistration.findUnique({
    where: { id },
    include: {
      workshop: { include: { organization: { select: { name: true } } } },
      payments: {
        include: { recordedBy: { select: { name: true } }, emails: { select: emailLogSelect, orderBy: { createdAt: "desc" } } },
        orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      },
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
  // The receipt the email box sends: the one picked from the list, else the latest.
  const activeReceipts = r.payments.filter((p) => !p.cancelledAt);
  const receipt = activeReceipts.find((p) => p.id === receiptParam) ?? activeReceipts.at(-1);
  const receiptEmails = r.payments.flatMap((p) => p.emails).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
                    <li key={p.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={p.cancelledAt ? "text-slate-400" : undefined}>
                          <span className="font-medium">{p.number}</span> <CopyButton value={p.number} label="Copy receipt number" /> · <span className={p.cancelledAt ? "line-through" : undefined}>{formatINR(p.amount)}</span> on{" "}
                          {formatDate(p.paidOn)} · {methodLabel[p.method]}
                          {p.reference && ` · ${p.reference}`}
                          <span className="text-xs text-slate-500"> · recorded by {p.recordedBy.name}</span>{" "}
                          {p.cancelledAt ? (
                            <Badge color="red">Cancelled</Badge>
                          ) : (
                            p.emails.some((e) => e.status === "SENT") && <Badge color="green">Emailed</Badge>
                          )}
                        </span>
                        <span className="flex items-center gap-3 text-xs">
                          <a href={`/workshops/receipts/${p.id}/pdf`} target="_blank" className="link">
                            Receipt
                          </a>
                          {!p.cancelledAt && (
                            <Link href={`?receipt=${p.id}#email-receipt`} scroll={false} className="link">
                              Email
                            </Link>
                          )}
                        </span>
                      </div>
                      {p.cancelledAt && <p className="mt-0.5 text-xs text-slate-500">“{p.cancelReason}”</p>}
                      {!p.cancelledAt && isAdmin(user) && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-slate-400 hover:text-red-600">Cancel receipt</summary>
                          <ActionForm action={cancelReceipt.bind(null, p.id)} className="mt-2 flex flex-wrap items-end gap-2">
                            <input name="reason" required className="input max-w-xs" placeholder="Why, e.g. entered twice" />
                            <SubmitButton className="btn-danger">Cancel receipt</SubmitButton>
                          </ActionForm>
                          <p className="mt-1 text-slate-500">For a payment entered by mistake. The number stays used and the receipt shows as cancelled.</p>
                        </details>
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
          {perPerson && money && receipt && (
            <div id="email-receipt" className="scroll-mt-4 space-y-6">
              <EmailComposer
                key={receipt.id}
                title={`Email receipt ${receipt.number}`}
                action={emailReceipt.bind(null, receipt.id)}
                draft={{
                  to: r.email ?? "",
                  ...receiptEmail(
                    { name: r.name, workshop: w.title, dates: dateSpan(w), number: receipt.number, amount: formatINR(receipt.amount) },
                    user.name,
                    settings,
                  ),
                }}
                attachments={[`Receipt ${receipt.number.replace(/\//g, "-")}.pdf`]}
                setup={mailSetup(settings)}
                admin={isAdmin(user)}
                submitLabel="Send receipt"
                open={receipt.id === receiptParam}
              />
              <EmailHistory emails={receiptEmails} title="Receipt emails" />
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-2 text-sm">
            <h2 className="font-semibold">Certificate</h2>
            {cert ? (
              <>
                <p>
                  <strong>{cert.number}</strong> <CopyButton value={cert.number} label="Copy certificate number" />, issued {formatDate(cert.issuedOn)}{" "}
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
                <ConfirmButton message={"Delete this registration? Only for someone added by mistake."} className="text-slate-400 hover:text-red-600">Delete (added by mistake)</ConfirmButton>
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
