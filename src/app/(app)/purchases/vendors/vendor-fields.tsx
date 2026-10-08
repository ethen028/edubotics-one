import type { Vendor } from "@prisma/client";
import { Field, Options } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/purchase-math";

/** Fields shared by the add and edit vendor forms. */
export function VendorFields({ vendor }: { vendor?: Vendor }) {
  return (
    <>
      <Field label="Name" className="sm:col-span-2">
        <input name="name" required defaultValue={vendor?.name} placeholder="Robu Electronics" className="input" />
      </Field>
      <Field label="State">
        <select name="state" defaultValue={vendor?.state ?? "Kerala"} className="input">
          <Options values={INDIAN_STATES} />
        </select>
      </Field>
      <Field label="Contact person">
        <input name="contactName" defaultValue={vendor?.contactName ?? ""} className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={vendor?.phone ?? ""} inputMode="tel" className="input" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={vendor?.email ?? ""} className="input" />
      </Field>
      <Field label="GSTIN (optional)">
        <input name="gstin" defaultValue={vendor?.gstin ?? ""} placeholder="32ABCDE1234F1Z5" className="input uppercase" />
      </Field>
      <Field label="PAN (optional)">
        <input name="pan" defaultValue={vendor?.pan ?? ""} className="input uppercase" />
      </Field>
      <Field label="Pay within (days of bill)">
        <input name="paymentDays" type="number" min={0} max={365} defaultValue={vendor?.paymentDays ?? 30} className="input" />
      </Field>
      <Field label="Address" className="sm:col-span-3">
        <textarea name="address" rows={2} defaultValue={vendor?.address ?? ""} className="input" />
      </Field>
      <Field label="Bank account / UPI for payments" className="sm:col-span-3">
        <input name="bankDetails" defaultValue={vendor?.bankDetails ?? ""} placeholder="A/c 1234567890, IFSC SBIN0001234 or vendor@upi" className="input" />
      </Field>
      <Field label="Notes" className="sm:col-span-3">
        <input name="notes" defaultValue={vendor?.notes ?? ""} placeholder="What they supply, delivery time, discounts" className="input" />
      </Field>
    </>
  );
}
