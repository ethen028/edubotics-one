"use client";

import { useState } from "react";
import type { Workshop, WorkshopStatus } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Badge, Field } from "@/components/ui";
import { toDateInput } from "@/lib/format";
import {
  CERTIFICATE_TITLES,
  WORKSHOP_AUDIENCES,
  WORKSHOP_FEE_TYPES,
  WORKSHOP_MODES,
  audienceLabel,
  feeTypeLabel,
  modeLabel,
  statusLabel,
} from "@/lib/workshops";

type Option = { id: string; name: string };
/** A workshop with its money fields as plain numbers, so it can be handed to this client form. */
export type WorkshopValues = Omit<Workshop, "hours" | "fee"> & { hours: number | null; fee: number };

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function WorkshopBadge({ status }: { status: WorkshopStatus }) {
  const color = status === "UPCOMING" ? "blue" : status === "COMPLETED" ? "green" : "gray";
  return <Badge color={color}>{statusLabel[status]}</Badge>;
}

/** New workshop and edit workshop. Trainers are picked here only when creating; afterwards on the workshop page. */
export function WorkshopForm({
  action,
  workshop,
  users,
  orgs,
  defaultCoordinatorId,
  submitLabel,
}: {
  action: Action;
  workshop?: WorkshopValues;
  users: Option[];
  orgs: Option[];
  defaultCoordinatorId: string;
  submitLabel: string;
}) {
  const [feeType, setFeeType] = useState(workshop?.feeType ?? "PER_PERSON");
  const [mode, setMode] = useState(workshop?.mode ?? "IN_PERSON");
  return (
    <ActionForm action={action} className="card space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Workshop title *" className="sm:col-span-2">
          <input name="title" required maxLength={200} defaultValue={workshop?.title} placeholder="e.g. Arduino and IoT hands-on workshop" className="input" />
        </Field>
        <Field label="What it covers" className="sm:col-span-2">
          <textarea name="description" rows={2} defaultValue={workshop?.description ?? ""} className="input" placeholder="Topics, kits used, what participants build" />
        </Field>
        <Field label="Who it's for">
          <select name="audience" defaultValue={workshop?.audience ?? "COLLEGE"} className="input">
            {WORKSHOP_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {audienceLabel[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Host college or company (from CRM)">
          <select name="organizationId" defaultValue={workshop?.organizationId ?? ""} className="input">
            <option value="">None: our own public workshop</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="First day *">
          <input type="date" name="startDate" required defaultValue={toDateInput(workshop?.startDate)} className="input" />
        </Field>
        <Field label="Last day (leave empty for one day)">
          <input
            type="date"
            name="endDate"
            defaultValue={workshop && workshop.endDate.getTime() !== workshop.startDate.getTime() ? toDateInput(workshop.endDate) : ""}
            className="input"
          />
        </Field>
        <Field label="Held">
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="input">
            {WORKSHOP_MODES.map((m) => (
              <option key={m} value={m}>
                {modeLabel[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={mode === "ONLINE" ? "Meeting link" : "Venue"}>
          <input
            name="venue"
            defaultValue={workshop?.venue ?? ""}
            className="input"
            placeholder={mode === "ONLINE" ? "Google Meet or Zoom link" : "e.g. Seminar hall, Block B"}
          />
        </Field>
        <Field label="Total hours (printed on certificates)">
          <input type="number" name="hours" min="0.5" step="0.5" defaultValue={workshop?.hours ?? ""} className="input" placeholder="e.g. 12" />
        </Field>
        <Field label="Places (leave empty for no limit)">
          <input type="number" name="capacity" min="1" defaultValue={workshop?.capacity ?? ""} className="input" />
        </Field>
        <Field label="Coordinator *">
          <select name="coordinatorId" required defaultValue={workshop?.coordinatorId ?? defaultCoordinatorId} className="input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        {!workshop && (
          <Field label="Trainers">
            <select name="trainerIds" multiple size={Math.min(5, users.length)} className="input">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">Hold Ctrl (or ⌘) to pick more than one. The first one signs the certificates.</span>
          </Field>
        )}
      </div>

      <fieldset className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Fees</legend>
        <Field label="Who pays">
          <select name="feeType" value={feeType} onChange={(e) => setFeeType(e.target.value as typeof feeType)} className="input">
            {WORKSHOP_FEE_TYPES.map((f) => (
              <option key={f} value={f}>
                {feeTypeLabel[f]}
              </option>
            ))}
          </select>
        </Field>
        {feeType === "PER_PERSON" ? (
          <Field label="Fee per participant, GST included (₹) *">
            <input type="number" name="fee" min="1" step="1" required defaultValue={workshop?.fee || ""} className="input" />
          </Field>
        ) : (
          <p className="self-end text-xs text-slate-500">
            {feeType === "INSTITUTION" ? "Raise an invoice to the host from the workshop page once it's saved." : "Nobody is charged."}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Certificates</legend>
        <Field label="Certificate title">
          <select name="certificateTitle" defaultValue={workshop?.certificateTitle ?? CERTIFICATE_TITLES[0]} className="input">
            {CERTIFICATE_TITLES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Attendance needed (% of the days)">
          <input type="number" name="minAttendancePct" min="1" max="100" required defaultValue={workshop?.minAttendancePct ?? 75} className="input" />
        </Field>
        {feeType === "PER_PERSON" && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="certNeedsPayment" defaultChecked={workshop?.certNeedsPayment ?? true} />
            Only give a certificate once the fee is fully paid
          </label>
        )}
      </fieldset>

      <Field label="Notes (staff only)">
        <textarea name="notes" rows={2} defaultValue={workshop?.notes ?? ""} className="input" />
      </Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

/** One day's register: tick who is present. "Everyone" ticks the whole list. */
export function AttendanceList({
  action,
  people,
  locked,
}: {
  action: Action;
  people: { id: string; name: string; sub: string | null; present: boolean | null }[];
  locked: boolean;
}) {
  const [ticked, setTicked] = useState(() => new Set(people.filter((p) => p.present).map((p) => p.id)));
  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-slate-600">
          {ticked.size} of {people.length} present
        </span>
        {!locked && (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setTicked(new Set(people.map((p) => p.id)))}>
              Everyone present
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setTicked(new Set())}>
              Clear
            </button>
          </div>
        )}
      </div>
      <ul className="card divide-y divide-slate-100 p-0">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                name="present"
                value={p.id}
                checked={ticked.has(p.id)}
                onChange={() => toggle(p.id)}
                disabled={locked}
                className="h-5 w-5 accent-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                {p.sub && <span className="block truncate text-xs text-slate-500">{p.sub}</span>}
              </span>
              {p.present === null && !ticked.has(p.id) && <span className="text-xs text-slate-400">not marked</span>}
            </label>
          </li>
        ))}
      </ul>
      {!locked && <SubmitButton>Save attendance</SubmitButton>}
    </ActionForm>
  );
}
