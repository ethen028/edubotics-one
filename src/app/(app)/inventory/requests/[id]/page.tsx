import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { projectScope } from "@/lib/projects";
import { canApproveRequest, outstanding, requestNo, requestScope } from "@/lib/inventory";
import { cancelRequest, decideStockRequest, issueRequest, returnRequest } from "../../actions";
import { RequestBadge } from "../../ui";

export default async function RequestPage({ params }: PageProps<"/inventory/requests/[id]">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;
  const request = await db.stockRequest.findFirst({
    // Admins see every request (both scopes are empty for them); others also see requests for projects they're on.
    where: { id, ...(admin ? {} : { OR: [requestScope(user), { project: projectScope(user) }] }) },
    include: {
      requester: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
      project: { select: { id: true, name: true } },
      lines: { include: { item: true }, orderBy: { item: { name: "asc" } } },
    },
  });
  if (!request) notFound();

  const canApprove = request.status === "PENDING" && (await canApproveRequest(user, request));
  const canCancel = (request.status === "PENDING" || request.status === "APPROVED") && (request.requesterId === user.id || admin);
  const today = todayIST();
  const late = request.status === "ISSUED" && request.returnBy && request.returnBy < today;
  const showIssued = request.status === "ISSUED" || request.status === "CLOSED";

  return (
    <>
      <PageHeader
        title={`${requestNo(request.number)} · ${request.requester.name}`}
        subtitle={<>Asked {formatDateTime(request.createdAt)}</>}
        actions={
          <Link href="/inventory/requests" className="btn-secondary">
            All requests
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Asked</th>
                  {showIssued && <th className="text-right">Issued</th>}
                  {showIssued && <th className="text-right">Back</th>}
                  {showIssued && <th className="text-right">Lost / used</th>}
                  {showIssued && <th className="text-right">Still out</th>}
                  {!showIssued && <th className="text-right">In stock now</th>}
                </tr>
              </thead>
              <tbody>
                {request.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/inventory/${l.item.id}`} className="link">
                        {l.item.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {l.item.sku}
                        {!l.item.returnable && " · consumable"}
                      </div>
                    </td>
                    <td className="text-right">
                      {l.quantity} <span className="text-xs text-slate-500">{l.item.unit}</span>
                    </td>
                    {showIssued && <td className="text-right">{l.issued}</td>}
                    {showIssued && <td className="text-right">{l.item.returnable ? l.returned : "—"}</td>}
                    {showIssued && <td className="text-right">{l.item.returnable ? l.writtenOff : l.issued}</td>}
                    {showIssued && <td className="text-right font-semibold">{outstanding(l) || "—"}</td>}
                    {!showIssued && (
                      <td className={`text-right ${l.item.onHand < l.quantity ? "font-semibold text-red-600" : ""}`}>{l.item.onHand}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {admin && request.status === "APPROVED" && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Hand out the items</h2>
              <p className="mb-3 text-sm text-slate-500">
                Change a number to issue part of a line, for example when stock is short. Stock goes down as soon as you save.
              </p>
              <ActionForm action={issueRequest.bind(null, request.id)} className="space-y-2">
                {request.lines.map((l) => (
                  <label key={l.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {l.item.name} <span className="text-slate-500">(asked {l.quantity}, {l.item.onHand} in stock)</span>
                    </span>
                    <input
                      name={`issue_${l.id}`}
                      type="number"
                      min={0}
                      max={l.quantity}
                      defaultValue={Math.min(l.quantity, Math.max(0, l.item.onHand))}
                      className="input w-24"
                    />
                  </label>
                ))}
                <SubmitButton>Issue items</SubmitButton>
              </ActionForm>
            </section>
          )}

          {admin && request.status === "ISSUED" && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Take items back</h2>
              <p className="mb-3 text-sm text-slate-500">
                Returned items go back into stock. Lost, broken or used-up ones are written off. You can record a partial return now and
                the rest later.
              </p>
              <ActionForm action={returnRequest.bind(null, request.id)} className="space-y-2">
                <div className="grid grid-cols-[1fr_6rem_6rem] gap-2 text-xs font-medium text-slate-500">
                  <span>Item (still out)</span>
                  <span>Returned</span>
                  <span>Lost / used</span>
                </div>
                {request.lines
                  .filter((l) => outstanding(l) > 0)
                  .map((l) => (
                    <div key={l.id} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 text-sm">
                      <span>
                        {l.item.name} <span className="text-slate-500">({outstanding(l)})</span>
                      </span>
                      <input name={`return_${l.id}`} type="number" min={0} max={outstanding(l)} defaultValue={outstanding(l)} className="input" />
                      <input name={`lost_${l.id}`} type="number" min={0} max={outstanding(l)} defaultValue={0} className="input" />
                    </div>
                  ))}
                <input name="note" placeholder="Note, e.g. 2 servo motors burnt out" className="input" />
                <SubmitButton>Record return</SubmitButton>
              </ActionForm>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card space-y-2 text-sm">
            <div>
              <RequestBadge status={request.status} />
              {late && (
                <span className="ml-2 text-xs font-medium text-red-600">Return overdue</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">For: </span>
              {request.purpose}
            </div>
            {request.project && (
              <div>
                <span className="text-slate-500">Project: </span>
                <Link href={`/projects/${request.project.id}`} className="link">
                  {request.project.name}
                </Link>
              </div>
            )}
            {request.neededBy && (
              <div>
                <span className="text-slate-500">Needed by: </span>
                {formatDate(request.neededBy)}
              </div>
            )}
            {request.returnBy && (
              <div>
                <span className="text-slate-500">Return by: </span>
                {formatDate(request.returnBy)}
              </div>
            )}
            {request.decidedBy && (
              <div className="border-t border-slate-100 pt-2">
                {request.status === "REJECTED" ? "Rejected" : "Approved"} by {request.decidedBy.name}, {formatDateTime(request.decidedAt)}
                {request.decisionNote && <div className="text-slate-500">“{request.decisionNote}”</div>}
              </div>
            )}
            {request.issuedAt && <div>Issued {formatDateTime(request.issuedAt)}</div>}
            {request.closedAt && request.status === "CLOSED" && <div>Closed {formatDateTime(request.closedAt)}</div>}
          </section>

          {canApprove && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Your decision</h2>
              <form action={decideStockRequest.bind(null, request.id)} className="space-y-2">
                <input name="note" placeholder="Note (optional)" className="input" />
                <div className="flex gap-2">
                  <button name="decision" value="APPROVED" className="btn-primary btn-sm">
                    Approve
                  </button>
                  <button name="decision" value="REJECTED" className="btn-danger btn-sm">
                    Reject
                  </button>
                </div>
              </form>
            </section>
          )}

          {request.status === "PENDING" && !canApprove && (
            <p className="text-sm text-slate-500">Waiting for {request.requester.name}&apos;s manager or an admin to approve.</p>
          )}
          {request.status === "APPROVED" && !admin && <p className="text-sm text-slate-500">Approved. An admin will hand out the items.</p>}

          {canCancel && (
            <form action={cancelRequest.bind(null, request.id)}>
              <button className="text-sm text-slate-500 hover:text-red-600 hover:underline">Cancel this request</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
