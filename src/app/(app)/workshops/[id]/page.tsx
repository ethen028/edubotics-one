import Link from "next/link";
import { notFound } from "next/navigation";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, methodLabel } from "@/lib/invoices";
import {
  audienceLabel,
  canManageWorkshop,
  canMarkAttendance,
  dateSpan,
  daysNeeded,
  feeTypeLabel,
  modeLabel,
  standing,
  workshopDays,
} from "@/lib/workshops";
import {
  addRegistration,
  addTrainer,
  deleteWorkshop,
  markPaidInFull,
  pasteRegistrations,
  removeTrainer,
  setWorkshopStatus,
  updateWorkshop,
} from "../actions";
import { loadWorkshop, workshopFormOptions, type LoadedWorkshop } from "../data";
import { WorkshopBadge, WorkshopForm, type WorkshopValues } from "../ui";

export const metadata = { title: "Workshop" };

export default async function WorkshopPage({ params }: PageProps<"/workshops/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const w = await loadWorkshop(id);
  if (!w) notFound();
  const canManage = canManageWorkshop(user, w);
  const money = isManagerOrAdmin(user);
  const canMark = canMarkAttendance(user, { coordinatorId: w.coordinatorId, trainers: w.trainers });
  const options = canManage ? await workshopFormOptions() : null;
  const today = todayIST();
  const days = workshopDays(w);
  const needed = daysNeeded(days.length, w.minAttendancePct);
  const perPerson = w.feeType === "PER_PERSON";

  const live = w.registrations.filter((r) => r.status === "REGISTERED");
  const rows = w.registrations.map((r) => ({ r, st: standing(w, r, today) }));
  const expected = live.reduce((s, r) => s + Number(r.fee), 0);
  const received = rows.reduce((s, x) => s + x.st.paid, 0);
  const due = rows.filter((x) => x.r.status === "REGISTERED").reduce((s, x) => s + x.st.due, 0);
  const issued = live.filter((r) => r.certificate?.status === "ISSUED").length;
  const ready = rows.filter((x) => !x.r.certificate && !x.st.blocker).length;
  const full = w.capacity != null && live.length >= w.capacity;
  const shownStatus = w.status === "UPCOMING" && w.endDate < today ? "COMPLETED" : w.status;
  const daysSoFar = days.filter((d) => d <= today);

  return (
    <>
      <PageHeader
        title={w.title}
        subtitle={
          <>
            <WorkshopBadge status={shownStatus} /> {dateSpan(w)}
            {w.organization && (
              <>
                {" · "}
                <Link href={`/crm/organizations/${w.organization.id}`} className="link">
                  {w.organization.name}
                </Link>
              </>
            )}
            {" · "}
            {audienceLabel[w.audience]}
          </>
        }
        actions={
          <>
            <Link href="/workshops" className="btn-secondary">
              All workshops
            </Link>
            {canMark && live.length > 0 && daysSoFar.length > 0 && (
              <Link href={`/workshops/${w.id}/attendance`} className="btn-secondary">
                Attendance
              </Link>
            )}
            {canManage && (
              <Link href={`/workshops/${w.id}/certificates`} className="btn-primary">
                Certificates{ready > 0 ? ` (${ready} ready)` : ""}
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card py-3">
              <div className="text-xs text-slate-500">Registered</div>
              <div className="text-xl font-semibold">
                {live.length}
                {w.capacity ? <span className="text-sm font-normal text-slate-400"> / {w.capacity}</span> : null}
              </div>
            </div>
            <div className="card py-3">
              <div className="text-xs text-slate-500">Days</div>
              <div className="text-xl font-semibold">{days.length}</div>
            </div>
            {money && perPerson ? (
              <div className="card py-3">
                <div className="text-xs text-slate-500">Fees received</div>
                <div className="text-xl font-semibold">{formatINR(received)}</div>
                {due > 0 && <div className="text-xs text-amber-700">{formatINR(due)} still due</div>}
              </div>
            ) : (
              <div className="card py-3">
                <div className="text-xs text-slate-500">Fee</div>
                <div className="text-sm font-semibold">{feeTypeLabel[w.feeType]}</div>
              </div>
            )}
            <div className="card py-3">
              <div className="text-xs text-slate-500">Certificates</div>
              <div className="text-xl font-semibold">{issued}</div>
            </div>
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-semibold">Participants</h2>
              {canMark && w.registrations.length > 0 && (
                <a href={`/workshops/${w.id}/export`} download className="link text-sm">
                  Download spreadsheet
                </a>
              )}
            </div>
            {!canMark ? (
              <Empty>Participants&apos; details are open to the workshop&apos;s trainers, its coordinator, managers and admins.</Empty>
            ) : w.registrations.length === 0 ? (
              <Empty>Nobody registered yet.{canManage && " Add people below, one by one or pasted from a spreadsheet."}</Empty>
            ) : (
              <div className="card overflow-x-auto p-0">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="hidden md:table-cell">Contact</th>
                      {money && perPerson && <th className="text-right">Fee</th>}
                      <th className="text-center">Attended</th>
                      <th>Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ r, st }) => (
                      <tr key={r.id} className={r.status === "CANCELLED" ? "opacity-50" : ""}>
                        <td>
                          {canManage ? (
                            <Link href={`/workshops/registrations/${r.id}`} className="link font-medium">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{r.name}</span>
                          )}
                          {r.status === "CANCELLED" && (
                            <>
                              {" "}
                              <Badge>Cancelled</Badge>
                            </>
                          )}
                          <div className="text-xs text-slate-500">{[r.institution, r.detail].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="hidden text-xs md:table-cell">
                          <div className="break-all">{r.email}</div>
                          <div className="text-slate-500">{r.phone}</div>
                        </td>
                        {money && perPerson && (
                          <td className="text-right whitespace-nowrap">
                            {Number(r.fee) === 0 ? (
                              <span className="text-slate-500">Waived</span>
                            ) : st.due <= 0 ? (
                              <Badge color="green">Paid</Badge>
                            ) : (
                              <>
                                <div className="text-amber-700">{formatINR(st.due)} due</div>
                                {st.paid > 0 && <div className="text-xs text-slate-500">{formatINR(st.paid)} paid</div>}
                                {r.status === "REGISTERED" && (
                                  <form action={markPaidInFull.bind(null, r.id)} className="mt-1 flex justify-end gap-1">
                                    <select name="method" defaultValue="UPI" className="rounded border border-slate-200 px-1 text-xs" aria-label="How they paid">
                                      {PAYMENT_METHODS.map((m) => (
                                        <option key={m} value={m}>
                                          {methodLabel[m]}
                                        </option>
                                      ))}
                                    </select>
                                    <button className="text-xs font-medium text-brand-600 hover:underline">Paid today</button>
                                  </form>
                                )}
                              </>
                            )}
                          </td>
                        )}
                        <td className="text-center whitespace-nowrap">
                          {st.marked === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className={st.attended >= needed ? "" : "text-amber-700"}>
                              {st.attended} / {days.length}
                            </span>
                          )}
                        </td>
                        <td className="text-xs">
                          {r.certificate ? (
                            <>
                              <a href={`/workshops/certificates/${r.certificate.id}/pdf`} target="_blank" className="link whitespace-nowrap">
                                {r.certificate.number}
                              </a>
                              <div className="text-slate-500">
                                {r.certificate.status === "CANCELLED" ? "Cancelled" : r.certificate.emails.length ? "Emailed" : "Not emailed yet"}
                              </div>
                            </>
                          ) : st.blocker ? (
                            <span className="text-slate-500">{st.blocker}</span>
                          ) : (
                            <span className="font-medium text-emerald-700">Ready to issue</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {canManage && w.status !== "CANCELLED" && (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="mb-3 font-semibold">Add a participant</h2>
                {full ? (
                  <p className="text-sm text-amber-800">All {w.capacity} places are taken. Raise the number of places under “Edit details” to add more.</p>
                ) : (
                  <ActionForm action={addRegistration.bind(null, w.id)} className="space-y-3">
                    <Field label="Name, as on the certificate *">
                      <input name="name" required maxLength={120} className="input" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Email">
                        <input name="email" type="email" className="input" />
                      </Field>
                      <Field label="Phone">
                        <input name="phone" className="input" />
                      </Field>
                    </div>
                    <Field label={w.audience === "PROFESSIONAL" ? "Company" : "College or school"}>
                      <input name="institution" defaultValue={w.organization?.name ?? ""} className="input" />
                    </Field>
                    <Field label={w.audience === "PROFESSIONAL" ? "Designation" : "Course and year"}>
                      <input name="detail" className="input" placeholder={w.audience === "PROFESSIONAL" ? "e.g. Teacher" : "e.g. B.Tech ECE, 3rd year"} />
                    </Field>
                    <SubmitButton>Register</SubmitButton>
                  </ActionForm>
                )}
              </div>
              <div className="card">
                <h2 className="mb-1 font-semibold">Paste a list</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Copy rows from a spreadsheet or a Google Form&apos;s responses sheet: one person per line, columns in the order name, email, phone,
                  college or company, course or designation. A header row is skipped, and people already registered with the same email are left out.
                </p>
                <ActionForm action={pasteRegistrations.bind(null, w.id)} className="space-y-3">
                  <textarea
                    name="pasted"
                    rows={8}
                    required
                    className="input font-mono text-xs"
                    placeholder={"Anjali Menon\tanjali@example.com\t9847000001\tSNGCE Kolenchery\tB.Tech ECE 3rd year\nRahul Nair, rahul@example.com, 9847000002, MACE, B.Tech EEE 2nd year"}
                  />
                  <SubmitButton>Add everyone</SubmitButton>
                </ActionForm>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card space-y-1 text-sm">
            <h2 className="mb-1 font-semibold">Details</h2>
            {w.description && <p className="mb-2 text-slate-600">{w.description}</p>}
            <Row k="Dates" v={`${dateSpan(w)} (${days.length} day${days.length === 1 ? "" : "s"})`} />
            <Row k="Held" v={modeLabel[w.mode]} />
            {w.venue && (
              <Row
                k={w.mode === "ONLINE" ? "Link" : "Venue"}
                v={/^https?:\/\//.test(w.venue) ? <a href={w.venue} target="_blank" rel="noreferrer" className="link break-all">{w.venue}</a> : w.venue}
              />
            )}
            {w.hours && <Row k="Hours" v={`${Number(w.hours)}`} />}
            <Row k="Places" v={w.capacity ?? "No limit"} />
            <Row k="Fee" v={perPerson ? `${formatINR(w.fee)} per person` : feeTypeLabel[w.feeType]} />
            <Row k="Coordinator" v={w.coordinator.name} />
            <Row k="Certificate" v={`${w.certificateTitle}, ${needed === days.length ? "every day" : `${needed} of ${days.length} days`}${w.certNeedsPayment && perPerson ? ", fee paid" : ""}`} />
            {money && perPerson && <Row k="Expected" v={formatINR(expected)} />}
            {w.notes && <p className="border-t border-slate-100 pt-2 text-xs whitespace-pre-line text-slate-600">{w.notes}</p>}
          </section>

          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Trainers</h2>
            {w.trainers.length === 0 ? (
              <p className="text-amber-700">No trainer yet.</p>
            ) : (
              <ul className="space-y-1">
                {w.trainers.map((t, i) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>
                      {t.user.name}
                      {i === 0 && <span className="text-xs text-slate-500"> · signs certificates</span>}
                    </span>
                    {canManage && (
                      <form action={removeTrainer.bind(null, w.id, t.userId)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && options && (
              <form action={addTrainer.bind(null, w.id)} className="mt-3 flex gap-2">
                <select name="userId" className="input" defaultValue="">
                  <option value="">Add a trainer…</option>
                  {options.users
                    .filter((u) => !w.trainers.some((t) => t.userId === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                <button className="btn-secondary">Add</button>
              </form>
            )}
          </section>

          {w.feeType === "INSTITUTION" && money && (
            <section className="card text-sm">
              <h2 className="mb-2 font-semibold">Invoice to the host</h2>
              {w.invoices.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {w.invoices.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <Link href={`/invoices/${i.id}`} className="link">
                        {i.number ?? "Draft invoice"}
                      </Link>
                      <span>
                        {formatINR(i.total)} {i.status === "CANCELLED" && <Badge>Cancelled</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {w.organization ? (
                <Link href={`/invoices/new?workshop=${w.id}`} className="btn-secondary">
                  {w.invoices.length ? "Raise another invoice" : "Raise an invoice"}
                </Link>
              ) : (
                <p className="text-xs text-slate-500">Pick the host college or company under “Edit details” first.</p>
              )}
            </section>
          )}

          {canManage && (
            <section className="card text-sm">
              <h2 className="mb-2 font-semibold">Status</h2>
              <form action={setWorkshopStatus.bind(null, w.id)} className="flex gap-2">
                <select name="status" defaultValue={w.status} className="input">
                  <option value="UPCOMING">Upcoming</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <button className="btn-secondary">Save</button>
              </form>
              <p className="mt-2 text-xs text-slate-500">It shows as completed by itself once the last day has passed.</p>
            </section>
          )}

          {canManage && options && (
            <details className="card">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">Edit details</summary>
              <div className="mt-3 -mx-5 -mb-5">
                <WorkshopForm
                  action={updateWorkshop.bind(null, w.id)}
                  workshop={formValues(w)}
                  users={options.users}
                  orgs={options.orgs}
                  defaultCoordinatorId={w.coordinatorId}
                  submitLabel="Save changes"
                />
              </div>
            </details>
          )}

          {canManage && w.registrations.length === 0 && (
            <form action={deleteWorkshop.bind(null, w.id)}>
              <button className="text-xs text-slate-400 hover:text-red-600">Delete this workshop</button>
            </form>
          )}
          <p className="text-xs text-slate-400">Added on {formatDate(w.createdAt)}.</p>
        </aside>
      </div>
    </>
  );
}

/** Just the workshop's own fields, money as plain numbers, for the client-side edit form. */
function formValues(w: LoadedWorkshop): WorkshopValues {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { organization, coordinator, trainers, registrations, invoices, hours, fee, ...rest } = w;
  return { ...rest, hours: hours == null ? null : Number(hours), fee: Number(fee) };
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-slate-500">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
