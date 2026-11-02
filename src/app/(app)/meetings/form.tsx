import { ActionForm, SubmitButton } from "@/components/action-form";
import type { FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { toISTInput } from "@/lib/recruitment";
import { MEETING_LENGTHS } from "@/lib/teamwork-rules";

type Values = {
  title: string;
  startsAt: Date | null;
  minutes: number;
  location: string | null;
  joinUrl: string | null;
  agenda: string | null;
  attendeeIds: string[];
};

const lengthLabel = (n: number) => (n < 60 ? `${n} minutes` : n === 60 ? "1 hour" : n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} hours`);

/** The meeting form, for a new meeting and for changing one. */
export function MeetingForm({
  action,
  people,
  values,
  submit,
  draft,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  people: { id: string; name: string }[];
  values: Values;
  submit: string;
  draft?: string;
}) {
  return (
    <ActionForm action={action} draft={draft} className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="card space-y-4">
        <Field label="Title" className="block">
          <input name="title" required maxLength={120} defaultValue={values.title} placeholder="e.g. Monday planning" className="input" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date and time" className="block">
            <input name="startsAt" type="datetime-local" required defaultValue={values.startsAt ? toISTInput(values.startsAt) : ""} className="input" />
          </Field>
          <Field label="How long" className="block">
            <select name="minutes" defaultValue={values.minutes} className="input">
              {MEETING_LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {lengthLabel(n)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="makeCall" defaultChecked={!values.joinUrl} /> Video call in Orbit
          </label>
          <p className="text-xs text-slate-500">
            Orbit makes a call link when this is ticked and no link is pasted below. Everyone invited gets a Join button 15 minutes before; it opens in a
            new tab and works on phones too. The first person to join signs in to Jitsi once with Google.
          </p>
          <Field label="Or paste a Google Meet, Zoom or Teams link (optional)" className="block">
            <input name="joinUrl" inputMode="url" autoComplete="off" maxLength={500} defaultValue={values.joinUrl ?? ""} placeholder="https://meet.google.com/abc-defg-hij" className="input" />
          </Field>
        </fieldset>
        <Field label="Place (optional)" className="block">
          <input name="location" maxLength={120} defaultValue={values.location ?? ""} placeholder="e.g. Office meeting room" className="input" />
        </Field>
        <Field label="Agenda (optional)" className="block">
          <textarea name="agenda" rows={6} maxLength={4000} defaultValue={values.agenda ?? ""} placeholder={"1. Last week's sessions\n2. Kit for next week"} className="input" />
        </Field>
      </div>
      <div className="card space-y-3 self-start">
        <h2 className="font-semibold">Who to invite</h2>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="everyone" /> Everyone
        </label>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="people" value={p.id} defaultChecked={values.attendeeIds.includes(p.id)} /> {p.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500">They get it in their Inbox and on their Calendar, and can say if they can come.</p>
        <SubmitButton>{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
