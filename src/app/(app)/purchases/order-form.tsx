"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/components/action-form";
import { COMPANY_STATE, GST_RATES, orderTotals } from "@/lib/purchase-math";
import { TotalsTable } from "./ui";

type Vendor = { id: string; name: string; state: string };
type Item = { id: string; name: string; sku: string; unit: string; category: string; unitCost: number | null; onHand: number };
type Row = { key: number; itemId: string; description: string; quantity: string; unit: string; unitPrice: string; gstRate: string };

const UNITS = ["pcs", "kit", "set", "pack", "box", "m"];

function blankRow(key: number, item?: Item): Row {
  return {
    key,
    itemId: item?.id ?? "",
    description: item?.name ?? "",
    quantity: "1",
    unit: item?.unit ?? "pcs",
    unitPrice: item?.unitCost != null ? String(item.unitCost) : "",
    gstRate: "18",
  };
}

/**
 * New purchase order: vendor, lines (a stock item or free text), GST per line and a running total.
 * Keeps what was typed when the server sends back an error.
 */
export function OrderForm({
  action,
  vendors,
  items,
  projects,
  initial,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  vendors: Vendor[];
  items: Item[];
  projects: { id: string; name: string }[];
  initial: { vendorId?: string; itemId?: string; quantity?: number; projectId?: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const byId = new Map(items.map((i) => [i.id, i]));
  const firstItem = initial.itemId ? byId.get(initial.itemId) : undefined;
  const [vendorId, setVendorId] = useState(initial.vendorId ?? "");
  const [rows, setRows] = useState<Row[]>(() => {
    const r = blankRow(0, firstItem);
    if (initial.quantity) r.quantity = String(initial.quantity);
    return [r];
  });
  const categories = [...new Set(items.map((i) => i.category))];
  const vendor = vendors.find((v) => v.id === vendorId);
  const interState = !!vendor && vendor.state !== COMPANY_STATE;

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const totals = orderTotals(
    rows.map((r) => ({ quantity: Number(r.quantity) || 0, unitPrice: Number(r.unitPrice.replace(/,/g, "")) || 0, gstRate: Number(r.gstRate) })),
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Vendor</span>
          <select name="vendorId" value={vendorId} onChange={(e) => setVendorId(e.target.value)} required className="input">
            <option value="">Pick a vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.state})
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Not listed?{" "}
            <Link href="/purchases/vendors?back=order" className="link">
              Add a vendor
            </Link>
            {vendor && <> · {interState ? "Outside Kerala: IGST" : "In Kerala: CGST + SGST"}</>}
          </span>
        </label>
        <label>
          <span className="label">Project (optional)</span>
          <select name="projectId" defaultValue={initial.projectId ?? ""} className="input">
            <option value="">Not for a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="label">What it&apos;s for</span>
          <input name="purpose" required placeholder="20 Arduino kits for the St. Mary's Grade 6 batch" className="input" />
        </label>
        <label>
          <span className="label">Needed by (optional)</span>
          <input name="expectedBy" type="date" className="input" />
        </label>
      </div>

      <div>
        <span className="label">What to buy</span>
        <p className="mb-2 text-xs text-slate-500">
          Pick a stock item and it goes into inventory when it arrives. For anything else (printing, a tool repair), leave the item blank and
          describe it. Prices are per unit, before GST.
        </p>
        <div className="space-y-3">
          {rows.map((row) => {
            const item = byId.get(row.itemId);
            return (
              <div key={row.key} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12">
                <select
                  name="lineItem"
                  value={row.itemId}
                  onChange={(e) => {
                    const it = byId.get(e.target.value);
                    set(row.key, it ? { itemId: it.id, description: it.name, unit: it.unit, unitPrice: row.unitPrice || (it.unitCost != null ? String(it.unitCost) : "") } : { itemId: "" });
                  }}
                  className="input col-span-2 sm:col-span-4"
                  aria-label="Stock item"
                >
                  <option value="">Not a stock item</option>
                  {categories.map((c) => (
                    <optgroup key={c} label={c}>
                      {items
                        .filter((i) => i.category === c)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.sku}) · {i.onHand} {i.unit} in stock
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  name="lineDesc"
                  value={row.description}
                  onChange={(e) => set(row.key, { description: e.target.value })}
                  placeholder="Description"
                  className="input col-span-2 sm:col-span-4"
                  aria-label="Description"
                />
                <input
                  name="lineQty"
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => set(row.key, { quantity: e.target.value })}
                  className="input sm:col-span-1"
                  aria-label="Quantity"
                />
                {item ? (
                  <>
                    <input type="hidden" name="lineUnit" value={item.unit} />
                    <span className="self-center text-sm text-slate-500 sm:col-span-1">{item.unit}</span>
                  </>
                ) : (
                  <select name="lineUnit" value={row.unit} onChange={(e) => set(row.key, { unit: e.target.value })} className="input sm:col-span-1" aria-label="Unit">
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                )}
                <input
                  name="linePrice"
                  inputMode="decimal"
                  value={row.unitPrice}
                  onChange={(e) => set(row.key, { unitPrice: e.target.value })}
                  placeholder="₹ per unit"
                  className="input sm:col-span-1"
                  aria-label="Price per unit before GST"
                />
                <select name="lineGst" value={row.gstRate} onChange={(e) => set(row.key, { gstRate: e.target.value })} className="input sm:col-span-1" aria-label="GST rate">
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    className="col-span-2 text-left text-xs text-slate-500 hover:text-red-600 sm:col-span-12"
                  >
                    Remove this line
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setRows([...rows, blankRow(Math.max(...rows.map((r) => r.key)) + 1)])}
          className="btn-secondary btn-sm mt-2"
        >
          Add another line
        </button>
      </div>

      <TotalsTable {...totals} interState={interState} />

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
