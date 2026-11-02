import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { RECOGNITION_VALUES } from "@/lib/recognition-rules";
import { giveRecognition } from "./actions";

/** Pick a colleague, what for, and a few words. Everyone in the company sees it. */
export function GiveForm({ people, to }: { people: { id: string; name: string }[]; to?: string }) {
  return (
    <ActionForm action={giveRecognition} className="space-y-4">
      <Field label="Who do you want to thank?">
        <select name="toId" required defaultValue={people.some((p) => p.id === to) ? to : ""} className="input">
          <option value="" disabled>
            Choose a colleague
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="label">What for?</legend>
        <div className="flex flex-wrap gap-2">
          {RECOGNITION_VALUES.map((v, i) => (
            <label key={v} className="filter-chip cursor-pointer has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white">
              <input type="radio" name="value" value={v} required defaultChecked={i === 0} className="sr-only" />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="What did they do?">
        <textarea
          name="message"
          required
          minLength={5}
          maxLength={500}
          rows={4}
          placeholder="e.g. Stayed late to fix the robot kits before the St. Mary's workshop."
          className="input"
        />
      </Field>
      <p className="text-xs text-slate-500">Everyone can see it, and they get a note in their Inbox.</p>
      <SubmitButton pendingLabel="Sending…">Send thanks</SubmitButton>
    </ActionForm>
  );
}
