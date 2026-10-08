"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "SESSION";
type Audience = "EVERYONE" | "ROLE" | "PEOPLE";
type Row = { key: number; id?: string; label: string; needsPhoto: boolean };

export type TemplateDefaults = {
  title: string;
  description: string;
  frequency: Frequency;
  weekday: number;
  dayOfMonth: number;
  dueTime: string;
  audience: Audience;
  role: string;
  people: string[];
  items: { id?: string; label: string; needsPhoto: boolean }[];
};

export function TemplateForm({
  action,
  defaults,
  users,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: TemplateDefaults;
  users: { id: string; name: string; role: string; designation: string | null }[];
}) {
  const [frequency, setFrequency] = useState<Frequency>(defaults.frequency);
  const [audience, setAudience] = useState<Audience>(defaults.audience);
  const [rows, setRows] = useState<Row[]>(() =>
    (defaults.items.length ? defaults.items : [{ label: "", needsPhoto: false }]).map((i, key) => ({ ...i, key })),
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: number) =>
    setRows((rs) => {
      const to = index + by;
      if (to < 0 || to >= rs.length) return rs;
      const copy = [...rs];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  const add = () => {
    setRows((rs) => [...rs, { key: nextKey, label: "", needsPhoto: false }]);
    setNextKey((k) => k + 1);
  };

  const session = frequency === "SESSION";

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(rows.map(({ id, label, needsPhoto }) => ({ id, label, needsPhoto })))} />

      <section className="card space-y-4">
        <Field label="Name">
          <input name="title" required maxLength={120} defaultValue={defaults.title} placeholder="e.g. Office opening" className="input" />
        </Field>
        <Field label="Instructions (optional)">
          <textarea
            name="description"
            rows={2}
            maxLength={1000}
            defaultValue={defaults.description}
            placeholder="Anything people should know before they start"
            className="input"
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">When</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["DAILY", "Every working day", "Skips weekly offs and holidays in Admin > Settings, and days on leave"],
              ["WEEKLY", "Once a week", "On the day you pick, or any time earlier that week"],
              ["MONTHLY", "Once a month", "On a set date, or the last working day for month-end jobs"],
              ["SESSION", "Before each school session", "For the trainer of every class in School sessions; opens the day before"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${frequency === value ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
            >
              <input type="radio" name="frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />
              <span>
                <b>{label}</b>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {frequency === "WEEKLY" && (
            <Field label="Due on">
              <select name="weekday" defaultValue={defaults.weekday} className="input">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {frequency === "MONTHLY" && (
            <Field label="Due on">
              <select name="dayOfMonth" defaultValue={defaults.dayOfMonth} className="input">
                <option value={0}>Last working day</option>
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Day {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!session && (
            <Field label="Due by (optional)">
              <input name="dueTime" type="time" defaultValue={defaults.dueTime} className="input" />
            </Field>
          )}
        </div>
        {session && <p className="text-sm text-slate-500">Due when the class starts. Cancelled classes are skipped.</p>}
      </section>

      {!session && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Who does it</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["PEOPLE", "Chosen people"],
                ["ROLE", "Everyone with a role"],
                ["EVERYONE", "Everyone"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} />
                {label}
              </label>
            ))}
          </div>
          {audience === "ROLE" && (
            <Field label="Role" className="block max-w-xs">
              <select name="role" defaultValue={defaults.role} className="input">
                <option value="EMPLOYEE">Employees</option>
                <option value="MANAGER">Managers</option>
                <option value="ADMIN">Admins</option>
              </select>
            </Field>
          )}
          {audience === "PEOPLE" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="people" value={u.id} defaultChecked={defaults.people.includes(u.id)} />
                  <span className="truncate">
                    {u.name}
                    {u.designation && <span className="text-slate-500"> · {u.designation}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">Their manager sees anything they miss. Each person ticks their own copy.</p>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Items</h2>
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2">
              <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
              <input
                value={r.label}
                onChange={(e) => update(r.key, { label: e.target.value })}
                maxLength={200}
                placeholder="e.g. Switch on the lights and fans"
                className="input min-w-0 flex-1"
                aria-label={`Item ${i + 1}`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={r.needsPhoto} onChange={(e) => update(r.key, { needsPhoto: e.target.checked })} />
                Needs photo
              </label>
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="btn-secondary btn-sm px-2" aria-label="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} className="btn-secondary btn-sm px-2" aria-label="Move down">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="btn-secondary btn-sm px-2 text-red-600"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={add} className="btn-secondary btn-sm">
          Add item
        </button>
      </section>

      <SubmitButton>Save checklist</SubmitButton>
    </ActionForm>
  );
}
