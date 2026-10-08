"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import type { FormState } from "@/components/action-form";

type Item = { id: string; name: string; sku: string; unit: string; available: number; category: string };

/** Item + quantity rows for a request. Sent as repeated itemId / quantity fields. */
export function RequestLines({ items, initialItemId }: { items: Item[]; initialItemId?: string }) {
  const [rows, setRows] = useState<{ key: number; itemId: string }[]>([{ key: 0, itemId: initialItemId ?? "" }]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const item = byId.get(row.itemId);
        return (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <select
              name="itemId"
              value={row.itemId}
              onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, itemId: e.target.value } : r)))}
              className="input min-w-0 flex-1"
              required={idx === 0}
            >
              <option value="">Pick an item…</option>
              {categories.map((c) => (
                <optgroup key={c} label={c}>
                  {items
                    .filter((i) => i.category === c)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.sku}) · {i.available} {i.unit} free
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <input name="quantity" type="number" min={1} defaultValue={1} className="input w-24" aria-label="Quantity" />
            <span className="w-12 text-xs text-slate-500">{item?.unit}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                className="text-xs text-slate-500 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setRows([...rows, { key: Math.max(...rows.map((r) => r.key)) + 1, itemId: "" }])}
        className="btn-secondary btn-sm"
      >
        Add another item
      </button>
    </div>
  );
}

/**
 * Like ActionForm, but keeps what was typed when the server sends back an error
 * (a plain form action resets every field, which loses a long list of items).
 */
export function KeepValuesForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      )}
      {children}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
