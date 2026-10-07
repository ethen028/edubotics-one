import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ASSET_CATEGORIES_FOR_HELPDESK, canHandle, ticketNo, ticketScope } from "@/lib/helpdesk";
import { PriorityBadge } from "../../projects/ui";
import { addComment, assignTicket, handOverAsset, requesterStatus, setTicketPriority, setTicketStatus } from "../actions";
import { FileLink, TicketStatusBadge } from "../ui";
import { MarkSeen } from "./mark-seen";

export const metadata = { title: "Helpdesk request" };

const fileFields = { id: true, fileName: true, mimeType: true, size: true } as const;

export default async function TicketPage({ params, searchParams }: PageProps<"/helpdesk/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { created } = (await searchParams) as Record<string, string | undefined>;
  const ticket = await db.helpdeskTicket.findFirst({
    where: { id, ...ticketScope(user) },
    include: {
      requester: { select: { id: true, name: true, email: true, employee: { select: { id: true, designation: true, phone: true } } } },
      assignee: { select: { id: true, name: true } },
      asset: { select: { id: true, code: true, name: true, status: true } },
      attachments: { where: { commentId: null }, select: fileFields, orderBy: { createdAt: "asc" } },
      comments: {
        include: { author: { select: { id: true, name: true } }, attachments: { select: fileFields } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) notFound();

  const admin = isAdmin(user);
  const handler = canHandle(user, ticket);
  const isRequester = ticket.requesterId === user.id;
  const closed = ticket.status === "DONE" || ticket.status === "CANCELLED";
  const offerAsset =
    admin && !closed && !!ticket.requester.employee && ASSET_CATEGORIES_FOR_HELPDESK.includes(ticket.category);
  const [staff, stock] = await Promise.all([
    admin ? db.user.findMany({ where: { active: true }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } }) : [],
    offerAsset
      ? db.asset.findMany({ where: { status: "AVAILABLE" }, orderBy: [{ category: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true, category: true } })
      : [],
  ]);

  return (
    <>
      {isRequester && ticket.requesterUnread && <MarkSeen ticketId={ticket.id} />}
      {created && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Request sent. The admin team has it, and you&apos;ll see their replies here and on Home.
        </div>
      )}
      <PageHeader
        title={ticket.title}
        subtitle={
          <>
            <span className="font-mono">{ticketNo(ticket.number)}</span> · {ticket.category} · raised by {ticket.requester.name} on{" "}
            {formatDateTime(ticket.createdAt)} ·{" "}
            <Link href="/helpdesk" className="link">
              All requests
            </Link>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {ticket.status === "DONE" && ticket.resolution && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="text-[11px] font-semibold tracking-widest text-emerald-700 uppercase">Done · {formatDateTime(ticket.doneAt)}</div>
              <p className="mt-1 whitespace-pre-wrap">{ticket.resolution}</p>
              {isRequester && (
                <form action={requesterStatus.bind(null, ticket.id)} className="mt-3">
                  <button name="status" value="OPEN" className="btn-secondary btn-sm">
                    Not sorted? Reopen
                  </button>
                </form>
              )}
            </section>
          )}

          <section className="card">
            <h2 className="mb-2 font-semibold">Details</h2>
            <p className="text-sm whitespace-pre-wrap text-slate-800">{ticket.description}</p>
            {ticket.asset && (
              <p className="mt-3 text-sm">
                <span className="text-slate-500">Item: </span>
                {admin ? (
                  <Link href="/hr/assets" className="link">
                    {ticket.asset.code} · {ticket.asset.name}
                  </Link>
                ) : (
                  <b>
                    {ticket.asset.code} · {ticket.asset.name}
                  </b>
                )}
              </p>
            )}
            {ticket.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ticket.attachments.map((f) => (
                  <FileLink key={f.id} file={f} />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Conversation</h2>
            {ticket.comments.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">No replies yet.</p>
            ) : (
              <ol className="mb-4 space-y-3">
                {ticket.comments.map((c) =>
                  c.event && !c.body ? (
                    <li key={c.id} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span>
                        <b className="font-medium text-slate-700">{c.author.name}</b> · {c.event} · {formatDateTime(c.createdAt)}
                      </span>
                    </li>
                  ) : (
                    <li
                      key={c.id}
                      className={`rounded-xl border p-3 text-sm ${c.author.id === ticket.requesterId ? "border-slate-200 bg-white" : "border-brand-100 bg-brand-50/60"}`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <b className="text-slate-800">{c.author.name}</b>
                        {c.author.id !== ticket.requesterId && <Badge color="blue">Admin team</Badge>}
                        {c.event && <Badge color="green">{c.event}</Badge>}
                        <span>{formatDateTime(c.createdAt)}</span>
                      </div>
                      {c.body && <p className="whitespace-pre-wrap text-slate-800">{c.body}</p>}
                      {c.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {c.attachments.map((f) => (
                            <FileLink key={f.id} file={f} />
                          ))}
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ol>
            )}
            {ticket.status !== "CANCELLED" && (
              <ActionForm action={addComment.bind(null, ticket.id)} className="space-y-2">
                <textarea
                  name="body"
                  rows={3}
                  maxLength={4000}
                  placeholder={isRequester ? "Add more details or answer a question" : "Reply to " + ticket.requester.name.split(" ")[0]}
                  className="input"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-xs" />
                  <SubmitButton>Send reply</SubmitButton>
                </div>
              </ActionForm>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Request</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Raised by</dt>
                <dd className="text-right">
                  {admin && ticket.requester.employee ? (
                    <Link href={`/hr/employees/${ticket.requester.employee.id}`} className="link">
                      {ticket.requester.name}
                    </Link>
                  ) : (
                    ticket.requester.name
                  )}
                  {ticket.requester.employee?.designation && (
                    <div className="text-xs text-slate-500">{ticket.requester.employee.designation}</div>
                  )}
                </dd>
              </div>
              {handler && ticket.requester.employee?.phone && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Phone</dt>
                  <dd>{ticket.requester.employee.phone}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Handled by</dt>
                <dd>{ticket.assignee?.name ?? <span className="text-slate-400">Not assigned yet</span>}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Last update</dt>
                <dd>{formatDateTime(ticket.updatedAt)}</dd>
              </div>
            </dl>
            {isRequester && ticket.status === "OPEN" && (
              <form action={requesterStatus.bind(null, ticket.id)} className="mt-4 border-t border-slate-100 pt-3">
                <button name="status" value="CANCELLED" className="text-xs text-slate-500 hover:text-red-700 hover:underline">
                  Don&apos;t need this any more? Withdraw it
                </button>
              </form>
            )}
          </section>

          {handler && ticket.status !== "CANCELLED" && (
            <section className="card space-y-4 text-sm">
              <h2 className="font-semibold">Handle this request</h2>

              {admin && (
                <form action={assignTicket.bind(null, ticket.id)} className="flex gap-2">
                  <select name="assigneeId" defaultValue={ticket.assigneeId ?? ""} className="input py-1.5" aria-label="Handled by">
                    <option value="">Not assigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id === user.id ? `Me (${s.name})` : s.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn-secondary btn-sm">Assign</button>
                </form>
              )}

              <form action={setTicketPriority.bind(null, ticket.id)} className="flex gap-2">
                <select name="priority" defaultValue={ticket.priority} className="input py-1.5" aria-label="Priority">
                  <option value="LOW">Low priority</option>
                  <option value="MEDIUM">Medium priority</option>
                  <option value="HIGH">High priority</option>
                </select>
                <button className="btn-secondary btn-sm">Set</button>
              </form>

              {ticket.status === "OPEN" && (
                <ActionForm action={setTicketStatus.bind(null, ticket.id)}>
                  <button name="status" value="IN_PROGRESS" className="btn-secondary w-full">
                    Start working on it
                  </button>
                </ActionForm>
              )}

              {!closed && (
                <ActionForm action={setTicketStatus.bind(null, ticket.id)} className="space-y-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="status" value="DONE" />
                  <Field label="What was done">
                    <textarea
                      name="resolution"
                      rows={3}
                      required
                      maxLength={2000}
                      placeholder="e.g. New charger handed over at the office"
                      className="input"
                    />
                  </Field>
                  <SubmitButton className="btn-primary w-full">Mark done</SubmitButton>
                </ActionForm>
              )}

              {ticket.status === "DONE" && (
                <ActionForm action={setTicketStatus.bind(null, ticket.id)}>
                  <button name="status" value="IN_PROGRESS" className="btn-secondary w-full">
                    Reopen
                  </button>
                </ActionForm>
              )}
            </section>
          )}

          {offerAsset && (
            <section className="card text-sm">
              <h2 className="mb-1 font-semibold">Hand over an item</h2>
              <p className="mb-3 text-xs text-slate-500">
                Gives {ticket.requester.name.split(" ")[0]} an item that&apos;s in stock in{" "}
                <Link href="/hr/assets" className="link">
                  HR Assets
                </Link>{" "}
                and records it on their profile.
              </p>
              {stock.length === 0 ? (
                <p className="text-slate-500">Nothing is in stock right now.</p>
              ) : (
                <ActionForm action={handOverAsset.bind(null, ticket.id)} className="space-y-2">
                  <select name="assetId" required className="input py-1.5" aria-label="Item">
                    {stock.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name} ({a.category})
                      </option>
                    ))}
                  </select>
                  <SubmitButton className="btn-secondary w-full">Hand over</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
