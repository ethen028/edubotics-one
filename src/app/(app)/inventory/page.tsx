import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, Field, Options, PageHeader, Stat } from "@/components/ui";
import { INVENTORY_CATEGORIES, STOCK_UNITS, isLowStock, lowStockItems, outstanding, reservedByItem } from "@/lib/inventory";
import { createItem } from "./actions";
import { StockLevel } from "./ui";
import { onOrderByItem } from "@/lib/purchases";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const q = sp.q?.trim() ?? "";
  const category = INVENTORY_CATEGORIES.find((c) => c === sp.category);
  const view = sp.view === "low" || sp.view === "archived" ? sp.view : "all";

  const where: Prisma.StockItemWhereInput = {
    active: view !== "archived",
    ...(category ? { category } : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [allItems, low, reserved, outLines, openRequests, onOrder] = await Promise.all([
    db.stockItem.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    lowStockItems(),
    reservedByItem(),
    db.stockRequestLine.findMany({
      where: { request: { status: "ISSUED" } },
      select: { itemId: true, issued: true, returned: true, writtenOff: true, item: { select: { returnable: true } } },
    }),
    db.stockRequest.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    onOrderByItem(),
  ]);
  const items = view === "low" ? allItems.filter(isLowStock) : allItems;
  const outByItem = new Map<string, number>();
  for (const l of outLines) outByItem.set(l.itemId, (outByItem.get(l.itemId) ?? 0) + outstanding(l));
  const totalOut = [...outByItem.values()].reduce((a, b) => a + b, 0);

  const tab = (v: string, label: string) => (
    <Link
      href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}), ...(v !== "all" ? { view: v } : {}) })}`}
      className={view === v ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Robotics and IoT kits, parts and consumables, counted by quantity."
        actions={
          <>
            <Link href="/inventory/requests" className="btn-secondary">
              Requests
            </Link>
            <Link href="/inventory/requests/new" className="btn-primary">
              Request items
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Items stocked" value={allItems.length} />
        <Stat label="Low or out of stock" value={low.length} href="?view=low" />
        <Stat label="Units out with projects" value={totalOut} href="/inventory/requests?status=ISSUED" />
        <Stat label="Requests to approve or issue" value={openRequests} href="/inventory/requests?status=open" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {tab("all", "In stock list")}
        {tab("low", `Low stock (${low.length})`)}
        {admin && tab("archived", "Archived")}
        <form className="ml-auto flex flex-wrap gap-2">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <select name="category" defaultValue={category ?? ""} className="input w-auto py-1.5">
            <option value="">All categories</option>
            <Options values={INVENTORY_CATEGORIES} />
          </select>
          <input name="q" defaultValue={q} placeholder="Search name, code or shelf" className="input w-56 py-1.5" />
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      </div>

      {items.length === 0 ? (
        <Empty>
          {allItems.length === 0 && !q && !category && view === "all"
            ? admin
              ? "No items yet. Add your kits and parts below."
              : "No items yet. An admin adds kits and parts here."
            : "Nothing matches."}
        </Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Where</th>
                <th>In stock</th>
                <th>Reserved</th>
                <th>Out</th>
                <th>On order</th>
                <th>Reorder at</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/inventory/${i.id}`} className="link font-medium">
                      {i.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">
                      {i.sku}
                      {!i.returnable && <span className="ml-2 font-sans">· used up, not returned</span>}
                    </div>
                  </td>
                  <td className="text-sm">{i.category}</td>
                  <td className="text-sm text-slate-600">{i.location ?? "—"}</td>
                  <td>
                    <StockLevel onHand={i.onHand} reorderLevel={i.reorderLevel} unit={i.unit} />
                  </td>
                  <td className="text-sm">{reserved.get(i.id) || "—"}</td>
                  <td className="text-sm">{outByItem.get(i.id) || "—"}</td>
                  <td className="text-sm">
                    {onOrder.get(i.id) || (admin && isLowStock(i) ? (
                      <Link href={`/purchases/new?item=${i.id}&qty=${Math.max(1, i.reorderLevel * 2 - i.onHand)}`} className="link">
                        Order
                      </Link>
                    ) : "—")}
                  </td>
                  <td className="text-sm text-slate-600">{i.reorderLevel || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {admin && (
        <section className="card max-w-3xl">
          <h2 className="mb-3 font-semibold">Add an item</h2>
          <ActionForm action={createItem} className="grid gap-3 sm:grid-cols-3">
            <Field label="Item code">
              <input name="sku" required placeholder="EB-KIT-ARD-01" className="input" />
            </Field>
            <Field label="Name" className="sm:col-span-2">
              <input name="name" required placeholder="Arduino starter robotics kit" className="input" />
            </Field>
            <Field label="Category">
              <select name="category" className="input">
                <Options values={INVENTORY_CATEGORIES} />
              </select>
            </Field>
            <Field label="Unit">
              <select name="unit" className="input">
                <Options values={STOCK_UNITS} />
              </select>
            </Field>
            <Field label="Where it's kept">
              <input name="location" placeholder="Lab cupboard B, shelf 2" className="input" />
            </Field>
            <Field label="Opening stock">
              <input name="opening" type="number" min={0} defaultValue={0} className="input" />
            </Field>
            <Field label="Low-stock alert at">
              <input name="reorderLevel" type="number" min={0} defaultValue={0} className="input" />
            </Field>
            <Field label="Unit cost (₹, optional)">
              <input name="unitCost" inputMode="decimal" className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="returnable" defaultChecked /> Comes back after use (kits, tools). Untick for consumables like
              batteries or jumper wires.
            </label>
            <Field label="Notes" className="sm:col-span-3">
              <input name="notes" className="input" />
            </Field>
            <div className="sm:col-span-3">
              <SubmitButton>Add item</SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}
    </>
  );
}
