"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { DAILY_STATUS_LABEL, LUNCH, formatDuration, workedMinutes } from "@/lib/daily-log";

type Task = { id: string; title: string; project: string; progress: number };
type Project = { id: string; name: string };
/** An entry being corrected (WorkPulse's edit): its current values fill the form. */
export type EditedEntry = {
  date: string;
  target: string;
  title: string;
  note: string;
  workStatus: string;
  startTime: string;
  endTime: string;
  hours: number;
  remarks: string;
};

/** Task Flow's "Add today's work" form, logging into the week's timesheet. With `entry` it edits that entry instead. */
export function DailyLogForm({
  action,
  tasks,
  projects,
  defaultDate,
  minDate,
  maxDate,
  entry,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  tasks: Task[];
  projects: Project[];
  defaultDate: string;
  minDate: string;
  maxDate: string;
  entry?: EditedEntry;
}) {
  const [target, setTarget] = useState(entry?.target ?? "");
  const [start, setStart] = useState(entry ? entry.startTime : "09:30");
  const [end, setEnd] = useState(entry ? entry.endTime : "18:30");
  const minutes = start && end ? workedMinutes(start, end) : null;
  // Progress and files are reported when work is logged; an edit only corrects the entry itself.
  const task = !entry && target.startsWith("task:") ? tasks.find((t) => t.id === target.slice(5)) : undefined;
  const [progress, setProgress] = useState<number | null>(null);
  const shown = progress ?? task?.progress ?? 0;

  return (
    <ActionForm action={action} className="space-y-4">
      <fieldset className="space-y-3 [&>label]:block">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-brand-700 uppercase">01 · Work</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" name="date" required defaultValue={entry?.date ?? defaultDate} min={minDate} max={maxDate} className="input" />
          </Field>
          <Field label="Work status">
            <select name="workStatus" defaultValue={entry?.workStatus ?? ""} className="input">
              <option value="">—</option>
              {Object.entries(DAILY_STATUS_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Task or project">
          <select
            name="target"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setProgress(null);
            }}
            className="input"
          >
            <option value="">Other / general work</option>
            {tasks.length > 0 && (
              <optgroup label="My tasks">
                {tasks.map((t) => (
                  <option key={t.id} value={`task:${t.id}`}>
                    {t.title} ({t.project})
                  </option>
                ))}
              </optgroup>
            )}
            {projects.length > 0 && (
              <optgroup label="Projects">
                {projects.map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Work title">
          <input name="title" defaultValue={entry?.title} className="input" placeholder="e.g. Completed motor testing" />
        </Field>
        <Field label="What you did">
          <textarea name="note" rows={2} defaultValue={entry?.note} className="input" placeholder="What you worked on, finished, problems faced" />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 [&>label]:block">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-brand-700 uppercase">02 · Time</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input type="time" name="startTime" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </Field>
          <Field label="End">
            <input type="time" name="endTime" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </Field>
        </div>
        {start || end ? (
          <p className="text-xs text-slate-500">
            {minutes ? (
              <>
                <b className="text-slate-800">{formatDuration(minutes)}</b> (lunch {LUNCH.start}–{LUNCH.end} left out){" "}
              </>
            ) : (
              "End time must be after the start. "
            )}
            <button
              type="button"
              className="link"
              onClick={() => {
                setStart("");
                setEnd("");
              }}
            >
              Type hours instead
            </button>
          </p>
        ) : (
          <Field label="Hours">
            <input type="number" name="hours" required defaultValue={entry?.hours} min="0.25" max="16" step="0.25" className="input" />
          </Field>
        )}
        {task && (
          <Field label={`Task progress (now ${task.progress}%)`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                name="progress"
                min={0}
                max={100}
                step={5}
                value={shown}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-brand-600"
              />
              <span className="w-12 text-right text-sm font-semibold text-brand-700 tabular-nums">{shown}%</span>
            </div>
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-3 [&>label]:block">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-brand-700 uppercase">
          {entry ? "03 · Remarks" : "03 · Files and remarks"}
        </legend>
        {!entry && (
          <Field label={target ? "Files (photos, documents; up to 5, 10 MB each)" : "Files (pick a task or project first)"}>
            <input type="file" name="files" multiple disabled={!target} className="input py-1.5 text-xs" />
          </Field>
        )}
        <Field label="Remarks">
          <input name="remarks" defaultValue={entry?.remarks} className="input" placeholder="Anything else" />
        </Field>
      </fieldset>

      <SubmitButton>{entry ? "Save changes" : "Add to timesheet"}</SubmitButton>
    </ActionForm>
  );
}
