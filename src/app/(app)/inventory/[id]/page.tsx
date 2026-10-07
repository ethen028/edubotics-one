import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, Options, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { INVENTORY_CATEGORIES, STOCK_UNITS, outstanding, requestNo, reservedByItem } from "@/lib/inventory";
import { recordMovement, toggleItemActive, updateItem } from "../actions";
import { StockLevel } from "../ui";

const MOVE_COLOR = { RECEIVE: "green", RETURN: "blue", ISSUE: "purple", ADJUST: "gray", WRITE_OFF: "red" } as const;

export default async function ItemPage({ params }: PageProps<"/inventory/[id]">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const { id } = await params;
  const item = await db.stockItem.findUnique({
    where: { id },
    include: {
      movements: {
        include: { by: { select: { name: true } }, request: { select: { id: true, number: true } }, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      requestLines: {
        where: { request: { status: "ISSUED" } },
        include: {
          item: { select: { returnable: true } },
          request: { include: { requester: { select: { name: true } }, project: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!item) notFound();
  const reserved = (await reservedByItem([id])).get(id) ?? 0;
  const out = item.requestLines.filter((l) => outstanding(l) > 0);
  const today = todayIST();

  return (
    <>
      <PageHeader
        title={item.name}
        subtitle={
          <>
            <span className="font-mono">{item.sku}</span> · {item.category}
            {item.location && ` · ${item.location}`}
            {!item.returnable && " · consumable"}
            {!item.active && (
              <span className="ml-2">
                <Badge>Archived</Badge>
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link href="/inventory" className="btn-secondary">
              All stock
            </Link>
            {item.active && (
              <Link href={`/inventory/requests/new?item=${item.id}`} className="btn-primary">
                Request this
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="In stock" value={<StockLevel onHand={item.onHand} reorderLevel={item.reorderLevel} unit={item.unit} />} />
        <Stat label="Reserved for approved requests" value={reserved} />
        <Stat label="Out with people" value={out.reduce((n, l) => n + outstanding(l), 0)} />
        <Stat label="Low-stock alert at" value={item.reorderLevel || "Off"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 font-semibold">Out right now</h2>
            {out.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing out.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {out.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/inventory/requests/${l.request.id}`} className="link">
                        {requestNo(l.request.number)}
                      </Link>{" "}
                      · {l.request.requester.name}
                      {l.request.project && <span className="text-slate-500"> · {l.request.project.name}</span>}
                    </span>
                    <span>
                      <b>{outstanding(l)}</b> {item.unit}
                      {l.request.returnBy && (
                        <span className={l.request.returnBy < today ? "ml-2 font-medium text-red-600" : "ml-2 text-slate-500"}>
                          back by {formatDate(l.request.returnBy)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Stock history</h2>
            {item.movements.length === 0 ? (
              <Empty>No stock movements yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th className="text-right">Qty</th>
                    <th>For</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {item.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(m.createdAt)}</td>
                      <td>
                        <Badge color={MOVE_COLOR[m.type]}>{m.type === "ADJUST" ? "Count fix" : humanize(m.type)}</Badge>
                        {m.note && <div className="mt-0.5 text-xs text-slate-500">{m.note}</div>}
                      </td>
                      <td className={`text-right font-medium ${m.quantity < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="text-sm">
                        {m.request && (
                          <Link href={`/inventory/requests/${m.request.id}`} className="link">
                            {requestNo(m.request.number)}
                          </Link>
                        )}
                        {m.project && <div className="text-xs text-slate-500">{m.project.name}</div>}
                      </td>
                      <td className="text-sm">{m.by.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {admin && item.active && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Update stock</h2>
              <ActionForm action={recordMovement.bind(null, item.id)} className="grid gap-3">
                <Field label="What happened">
                  <select name="kind" className="input">
                    <option value="RECEIVE">Received (bought or built)</option>
                    <option value="COUNT">Counted the shelf (set the real number)</option>
                    <option value="WRITE_OFF">Lost, damaged or used up</option>
                  </select>
                </Field>
                <Field label="Quantity (for a count, the number on the shelf)">
                  <input name="quantity" type="number" min={0} required className="input" />
                </Field>
                <Field label="Note">
                  <input name="note" placeholder="Invoice no., supplier, or reason" className="input" />
                </Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </section>
          )}

          {admin ? (
            <section className="card">
              <h2 className="mb-3 font-semibold">Item details</h2>
              <ActionForm action={updateItem.bind(null, item.id)} className="grid gap-3">
                <Field label="Item code">
                  <input name="sku" defaultValue={item.sku} required className="input" />
                </Field>
                <Field label="Name">
                  <input name="name" defaultValue={item.name} required className="input" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <select name="category" defaultValue={item.category} className="input">
                      <Options values={INVENTORY_CATEGORIES} />
                    </select>
                  </Field>
                  <Field label="Unit">
                    <select name="unit" defaultValue={item.unit} className="input">
                      <Options values={STOCK_UNITS} />
                    </select>
                  </Field>
                  <Field label="Low-stock alert at">
                    <input name="reorderLevel" type="number" min={0} defaultValue={item.reorderLevel} className="input" />
                  </Field>
                  <Field label="Unit cost (₹)">
                    <input name="unitCost" inputMode="decimal" defaultValue={item.unitCost?.toString() ?? ""} className="input" />
                  </Field>
                </div>
                <Field label="Where it's kept">
                  <input name="location" defaultValue={item.location ?? ""} className="input" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="returnable" defaultChecked={item.returnable} /> Comes back after use
                </label>
                <Field label="Notes">
                  <input name="notes" defaultValue={item.notes ?? ""} className="input" />
                </Field>
                <SubmitButton>Save details</SubmitButton>
              </ActionForm>
              {item.unitCost && (
                <p className="mt-3 text-xs text-slate-500">Stock value {formatINR(Number(item.unitCost) * item.onHand)}</p>
              )}
              <form action={toggleItemActive.bind(null, item.id)} className="mt-3 border-t border-slate-100 pt-3">
                <button className="text-xs text-slate-500 hover:underline">
                  {item.active ? "Archive (no longer stocked)" : "Restore to the stock list"}
                </button>
              </form>
            </section>
          ) : (
            item.notes && (
              <section className="card text-sm">
                <h2 className="mb-1 font-semibold">Notes</h2>
                {item.notes}
              </section>
            )
          )}
        </div>
      </div>
    </>
  );
}
