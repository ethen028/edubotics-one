import type { Contact, Deal, Lead, Organization } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field, Options } from "@/components/ui";
import { humanize, toDateInput } from "@/lib/format";
import { DEAL_STAGES, KERALA_DISTRICTS, LEAD_SOURCES, LEAD_STATUSES, ORG_TYPES, PROGRAMS } from "./constants";

export function ProgramList() {
  return (
    <datalist id="programs">
      <Options values={PROGRAMS} />
    </datalist>
  );
}

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

function OwnerSelect({ users, value }: { users: Option[]; value?: string | null }) {
  return (
    <Field label="Owner">
      <select name="ownerId" defaultValue={value ?? ""} className="input">
        <option value="">Me</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function LeadForm({ action, lead, users }: { action: Action; lead?: Lead; users: Option[] }) {
  const converted = lead?.status === "CONVERTED";
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Person's name *">
          <input name="name" required defaultValue={lead?.name} className="input" />
        </Field>
        <Field label="Institution / company">
          <input name="organizationName" defaultValue={lead?.organizationName ?? ""} className="input" />
        </Field>
        <Field label="Institution type">
          <select name="orgType" defaultValue={lead?.orgType ?? ""} className="input">
            <option value="">—</option>
            <Options values={ORG_TYPES} labels={humanize} />
          </select>
        </Field>
        <Field label="City">
          <input name="city" defaultValue={lead?.city ?? ""} className="input" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={lead?.phone ?? ""} className="input" placeholder="+91" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className="input" />
        </Field>
        <Field label="Source">
          <select name="source" defaultValue={lead?.source ?? "PHONE"} className="input">
            <Options values={LEAD_SOURCES} labels={humanize} />
          </select>
        </Field>
        {!converted && (
          <Field label="Status">
            <select name="status" defaultValue={lead?.status ?? "NEW"} className="input">
              <Options values={LEAD_STATUSES} labels={humanize} />
            </select>
          </Field>
        )}
        <OwnerSelect users={users} value={lead?.ownerId} />
        <Field label="Interested in" className="sm:col-span-2">
          <input name="interest" defaultValue={lead?.interest ?? ""} className="input" list="programs" placeholder="Pick a programme or type" />
          <ProgramList />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="input" />
        </Field>
      </div>
      <SubmitButton>{lead ? "Save" : "Add lead"}</SubmitButton>
    </ActionForm>
  );
}

export function OrganizationForm({ action, org, users }: { action: Action; org?: Organization; users: Option[] }) {
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Name *" className="sm:col-span-2">
          <input name="name" required defaultValue={org?.name} className="input" />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={org?.type ?? "SCHOOL"} className="input">
            <Options values={ORG_TYPES} labels={humanize} />
          </select>
        </Field>
        <Field label="Board / affiliation">
          <input name="board" defaultValue={org?.board ?? ""} className="input" placeholder="CBSE, ICSE, State, IB…" list="boards" />
          <datalist id="boards">
            <Options values={["CBSE", "ICSE", "Kerala State", "IB", "IGCSE", "KTU", "Other"]} />
          </datalist>
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={org?.phone ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={org?.email ?? ""} className="input" />
        </Field>
        <Field label="Website">
          <input name="website" defaultValue={org?.website ?? ""} className="input" />
        </Field>
        <Field label="City">
          <input name="city" defaultValue={org?.city ?? ""} className="input" />
        </Field>
        <Field label="District">
          <input name="district" defaultValue={org?.district ?? ""} className="input" list="districts" />
          <datalist id="districts">
            <Options values={KERALA_DISTRICTS} />
          </datalist>
        </Field>
        <Field label="State">
          <input name="state" defaultValue={org?.state ?? "Kerala"} className="input" />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <input name="address" defaultValue={org?.address ?? ""} className="input" />
        </Field>
        <OwnerSelect users={users} value={org?.ownerId} />
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <textarea name="notes" rows={3} defaultValue={org?.notes ?? ""} className="input" />
        </Field>
      </div>
      <SubmitButton>{org ? "Save" : "Add institution"}</SubmitButton>
    </ActionForm>
  );
}

export function ContactForm({
  action,
  contact,
  organizations,
  users,
  defaultOrganizationId,
  compact,
}: {
  action: Action;
  contact?: Contact;
  organizations: Option[];
  users: Option[];
  defaultOrganizationId?: string;
  compact?: boolean;
}) {
  return (
    <ActionForm action={action} className="card space-y-4">
      {compact && <h2 className="font-semibold">Add contact</h2>}
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Field label="Name *">
          <input name="name" required defaultValue={contact?.name} className="input" />
        </Field>
        <Field label="Designation">
          <input name="designation" defaultValue={contact?.designation ?? ""} className="input" placeholder="Principal" />
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={contact?.phone ?? ""} className="input" />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" />
        </Field>
        <Field label="Institution">
          <select name="organizationId" defaultValue={contact?.organizationId ?? defaultOrganizationId ?? ""} className="input">
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        {!compact && <OwnerSelect users={users} value={contact?.ownerId} />}
        {!compact && (
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} className="input" />
          </Field>
        )}
      </div>
      <SubmitButton>{contact ? "Save" : "Add contact"}</SubmitButton>
    </ActionForm>
  );
}

export function DealForm({
  action,
  deal,
  organizations,
  contacts,
  users,
  defaultOrganizationId,
}: {
  action: Action;
  deal?: Deal;
  organizations: Option[];
  contacts: Option[];
  users: Option[];
  defaultOrganizationId?: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal title *" className="sm:col-span-2">
          <input name="title" required defaultValue={deal?.title} className="input" placeholder="Robotics lab setup 2026-27" />
        </Field>
        <Field label="Value (₹)">
          <input name="value" type="number" min="0" step="1" defaultValue={deal ? Number(deal.value) : 0} className="input" />
        </Field>
        <Field label="Stage">
          <select name="stage" defaultValue={deal?.stage ?? "PROSPECT"} className="input">
            <Options values={DEAL_STAGES} labels={humanize} />
          </select>
        </Field>
        <Field label="Programme / product">
          <input name="program" defaultValue={deal?.program ?? ""} className="input" list="programs" />
          <ProgramList />
        </Field>
        <Field label="Students covered">
          <input name="students" type="number" min="0" defaultValue={deal?.students ?? ""} className="input" />
        </Field>
        <Field label="Institution">
          <select name="organizationId" defaultValue={deal?.organizationId ?? defaultOrganizationId ?? ""} className="input">
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Main contact">
          <select name="contactId" defaultValue={deal?.contactId ?? ""} className="input">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected close">
          <input name="expectedClose" type="date" defaultValue={toDateInput(deal?.expectedClose)} className="input" />
        </Field>
        <OwnerSelect users={users} value={deal?.ownerId} />
        <Field label="Lost reason (if lost)" className="sm:col-span-2">
          <input name="lostReason" defaultValue={deal?.lostReason ?? ""} className="input" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={4} defaultValue={deal?.notes ?? ""} className="input" />
        </Field>
      </div>
      <SubmitButton>{deal ? "Save" : "Add deal"}</SubmitButton>
    </ActionForm>
  );
}
