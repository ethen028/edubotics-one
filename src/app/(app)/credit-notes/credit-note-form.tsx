"use client";

import { startTransition, useActionState, useState } from "react";
import type { FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { computeTotals, formatMoney } from "@/lib/invoices";
import { CREDIT_REASONS, creditReasonLabel, type CreditReason } from "@/lib/credit-notes";

export type CreditLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
  /** Still there to credit, before GST. */
  left: number;
};

type Draft = { quantity: string; unitPrice: string };

/** What's left on a line, as quantity × rate: the invoice's own when nothing was credited yet. */
function whatIsLeft(l: CreditLine): Draft {
  if (l.left <= 0) return { quantity: "0", unitPrice: String(l.unitPrice) };
  if (Math.abs(l.left - l.amount) < 0.005) return { quantity: String(l.quantity), unitPrice: String(l.unitPrice) };
  return { quantity: "1", unitPrice: l.left.toFixed(2) };
}

export function CreditNoteForm({
  action,
  lines,
  interState,
  taxed,
  today,
  minDate,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lines: CreditLine[];
  interState: boolean;
  taxed: boolean;
  today: string;
  minDate: string;
}) {
  const [reason, setReason] = useState<CreditReason | "">("");
  const [drafts, setDrafts] = useState<Draft[]>(lines.map((l) => ({ quantity: "0", unitPrice: String(l.unitPrice) })));
  const set = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const fillAll = () => setDrafts(lines.map(whatIsLeft));

  const totals = computeTotals(
    lines.map((l, i) => ({
      description: l.description,
      quantity: Number(drafts[i].quantity) || 0,
      unitPrice: Number(drafts[i].unitPrice) || 0,
      gstRate: l.gstRate,
    })),
    { interState, gstEnabled: true },
  );

  const [state, formAction, pending] = useActionState(action, undefined);

  // Submitted by hand so a refused credit note keeps what was typed (a form action would clear the fields).
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-6"
    >
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(lines.map((l, i) => ({ invoiceLineId: l.id, quantity: drafts[i].quantity || 0, unitPrice: drafts[i].unitPrice || 0 })))}
      />
      <section className="card grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Why the credit *">
          <select
            name="reason"
            required
            value={reason}
            onChange={(e) => {
              const r = e.target.value as CreditReason;
              setReason(r);
              if (r === "CANCEL_INVOICE") fillAll();
            }}
            className="input"
          >
            <option value="">Pick a reason…</option>
            {CREDIT_REASONS.map((r) => (
              <option key={r} value={r}>
                {creditReasonLabel[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Credit note date *">
          <input type="date" name="issueDate" required defaultValue={today} min={minDate} max={today} className="input" />
        </Field>
        <Field label={reason === "OTHER" ? "Details, printed on the credit note *" : "Details, printed on the credit note"} className="sm:col-span-2">
          <input
            name="reasonNote"
            className="input"
            maxLength={500}
            required={reason === "OTHER"}
            placeholder="e.g. 4 of the 40 sessions in August were not held (school closed for floods)"
          />
        </Field>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">What you&apos;re crediting</h2>
          <button type="button" onClick={fillAll} className="btn-secondary text-xs">
            Credit everything left
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Enter the quantity and rate being taken off, before GST. For sessions not held, that&apos;s the number of sessions at the invoice
          rate; for a wrong price, the full quantity at the difference.
        </p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice line</th>
                <th className="text-right">Left to credit</th>
                <th className="w-24">Quantity</th>
                <th className="w-32">Rate (₹)</th>
                {taxed && <th className="text-right">GST</th>}
                <th className="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id} className={l.left <= 0 ? "opacity-50" : ""}>
                  <td className="min-w-48">
                    <div className="whitespace-pre-line">{l.description}</div>
                    <div className="text-xs text-slate-500">
                      Invoiced {l.quantity} × {formatMoney(l.unitPrice)} = {formatMoney(l.amount)}
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">{formatMoney(l.left)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={drafts[i].quantity}
                      disabled={l.left <= 0}
                      onChange={(e) => set(i, { quantity: e.target.value })}
                      className="input"
                      aria-label={`Quantity to credit on ${l.description}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={drafts[i].unitPrice}
                      disabled={l.left <= 0}
                      onChange={(e) => set(i, { unitPrice: e.target.value })}
                      className="input"
                      aria-label={`Rate to credit on ${l.description}`}
                    />
                  </td>
                  {taxed && <td className="text-right">{l.gstRate}%</td>}
                  <td className={`text-right font-medium whitespace-nowrap ${totals.lines[i].amount > l.left + 0.005 ? "text-red-600" : ""}`}>
                    {formatMoney(totals.lines[i].amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd>{formatMoney(totals.subtotal)}</dd>
          </div>
          {taxed &&
            (interState ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">IGST</dt>
                <dd>{formatMoney(totals.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-500">CGST</dt>
                  <dd>{formatMoney(totals.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">SGST</dt>
                  <dd>{formatMoney(totals.sgst)}</dd>
                </div>
              </>
            ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
            <dt>Credit note total</dt>
            <dd>{formatMoney(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Issuing…" : "Issue credit note"}
        </button>
        <span className="text-xs text-slate-500">It gets the next credit note number straight away and can&apos;t be edited after, only cancelled.</span>
      </div>
    </form>
  );
}
