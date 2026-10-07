"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { GST_RATES, INDIAN_STATES, computeTotals, formatMoney } from "@/lib/invoices";

type Org = { id: string; name: string; address: string; gstin: string | null; state: string };
type Linked = { id: string; name: string; organizationId: string | null };

export type LineDraft = { description: string; sac: string; quantity: string; unitPrice: string; gstRate: string };

export type InvoiceDefaults = {
  organizationId?: string;
  contactId?: string | null;
  dealId?: string | null;
  projectId?: string | null;
  billToName?: string;
  billToAddress?: string | null;
  billToGstin?: string | null;
  placeOfSupply?: string;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  lines: LineDraft[];
};

export function InvoiceForm({
  action,
  orgs,
  contacts,
  deals,
  projects,
  defaults,
  settings,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  orgs: Org[];
  contacts: Linked[];
  deals: Linked[];
  projects: Linked[];
  defaults: InvoiceDefaults;
  settings: { companyState: string; gstEnabled: boolean; defaultGstRate: number; defaultSac: string | null };
  submitLabel: string;
}) {
  const [orgId, setOrgId] = useState(defaults.organizationId ?? "");
  const [billTo, setBillTo] = useState({
    name: defaults.billToName ?? "",
    address: defaults.billToAddress ?? "",
    gstin: defaults.billToGstin ?? "",
  });
  const [place, setPlace] = useState(defaults.placeOfSupply ?? settings.companyState);
  const [lines, setLines] = useState<LineDraft[]>(defaults.lines);

  const blankLine = (): LineDraft => ({
    description: "",
    sac: settings.defaultSac ?? "",
    quantity: "1",
    unitPrice: "",
    gstRate: String(settings.gstEnabled ? settings.defaultGstRate : 0),
  });

  function pickOrg(id: string) {
    setOrgId(id);
    const org = orgs.find((o) => o.id === id);
    if (org) {
      setBillTo({ name: org.name, address: org.address, gstin: org.gstin ?? "" });
      setPlace(org.state);
    }
  }

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const interState = place !== settings.companyState;
  const totals = computeTotals(
    lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      gstRate: Number(l.gstRate) || 0,
    })),
    { interState, gstEnabled: settings.gstEnabled },
  );
  const forOrg = (xs: Linked[]) => xs.filter((x) => !orgId || x.organizationId === orgId);

  return (
    <ActionForm action={action} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold">Bill to</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School / institution *">
            <select name="organizationId" required value={orgId} onChange={(e) => pickOrg(e.target.value)} className="input">
              <option value="">Pick one</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact">
            <select name="contactId" defaultValue={defaults.contactId ?? ""} className="input" key={`c${orgId}`}>
              <option value="">—</option>
              {forOrg(contacts).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name on invoice *">
            <input
              name="billToName"
              required
              value={billTo.name}
              onChange={(e) => setBillTo({ ...billTo, name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="School's GSTIN (if any)">
            <input
              name="billToGstin"
              value={billTo.gstin}
              onChange={(e) => setBillTo({ ...billTo, gstin: e.target.value })}
              className="input uppercase"
              maxLength={15}
              placeholder="Most schools have none"
            />
          </Field>
          <Field label="Billing address" className="sm:col-span-2">
            <textarea
              name="billToAddress"
              rows={2}
              value={billTo.address}
              onChange={(e) => setBillTo({ ...billTo, address: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Place of supply">
            <select name="placeOfSupply" value={place} onChange={(e) => setPlace(e.target.value)} className="input">
              {INDIAN_STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {settings.gstEnabled && (
              <p className="mt-1 text-xs text-slate-500">{interState ? "Other state: IGST applies." : "Same state: CGST + SGST apply."}</p>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Invoice date *">
              <input type="date" name="issueDate" required defaultValue={defaults.issueDate} className="input" />
            </Field>
            <Field label="Due date *">
              <input type="date" name="dueDate" required defaultValue={defaults.dueDate} className="input" />
            </Field>
          </div>
          <Field label="Won deal">
            <select name="dealId" defaultValue={defaults.dealId ?? ""} className="input" key={`d${orgId}`}>
              <option value="">—</option>
              {forOrg(deals).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delivery project">
            <select name="projectId" defaultValue={defaults.projectId ?? ""} className="input" key={`p${orgId}`}>
              <option value="">—</option>
              {forOrg(projects).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">What you&apos;re billing</h2>
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <div className="hidden gap-2 text-xs font-medium text-slate-500 md:grid md:grid-cols-[1fr_6rem_5rem_8rem_5.5rem_7rem_2rem]">
          <span>Description</span>
          <span>SAC / HSN</span>
          <span>Qty</span>
          <span>Rate (₹)</span>
          <span>{settings.gstEnabled ? "GST" : ""}</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-3 md:grid-cols-[1fr_6rem_5rem_8rem_5.5rem_7rem_2rem] md:items-center md:border-0 md:pb-0"
          >
            <input
              aria-label="Description"
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
              className="input col-span-2 md:col-span-1"
              placeholder="e.g. Robotics programme, Term 1 (Grades 3–8, 240 students)"
            />
            <input aria-label="SAC / HSN" value={l.sac} onChange={(e) => setLine(i, { sac: e.target.value })} className="input" />
            <input
              aria-label="Quantity"
              type="number"
              min="0.01"
              step="any"
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
              className="input"
            />
            <input
              aria-label="Rate"
              type="number"
              min="0"
              step="0.01"
              value={l.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
              className="input"
            />
            {settings.gstEnabled ? (
              <select aria-label="GST rate" value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} className="input">
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            ) : (
              <span />
            )}
            <span className="self-center text-right text-sm font-medium">{formatMoney(totals.lines[i].amount)}</span>
            <button
              type="button"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              disabled={lines.length === 1}
              className="justify-self-end text-lg text-slate-400 hover:text-red-600 disabled:invisible"
              aria-label="Remove line"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines([...lines, blankLine()])} className="btn-secondary btn-sm">
          Add line
        </button>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd>{formatMoney(totals.subtotal)}</dd>
          </div>
          {settings.gstEnabled &&
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
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(totals.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <Field label="Note on the invoice">
          <textarea
            name="notes"
            rows={2}
            defaultValue={defaults.notes ?? ""}
            className="input"
            placeholder="e.g. Instalment 1 of 3 as per the agreement dated 12 June 2026"
          />
        </Field>
      </section>

      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
