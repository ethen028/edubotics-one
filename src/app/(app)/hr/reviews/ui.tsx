import { Badge, Field } from "@/components/ui";
import Link from "next/link";
import { formatDate, toDateInput } from "@/lib/format";
import { RATING_LABEL as LABEL } from "@/lib/hr-constants";

const COLOR = { 1: "red", 2: "amber", 3: "blue", 4: "green", 5: "purple" } as const;

export const ratingLabel = (r: number) => LABEL[r] ?? "";

export function RatingBadge({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-slate-400">—</span>;
  return (
    <Badge color={COLOR[rating as keyof typeof COLOR]}>
      {rating} · {LABEL[rating]}
    </Badge>
  );
}

/** Five tappable choices; works without JavaScript and on phones. */
export function RatingPicker({ name, value, compact }: { name: string; value: number | null; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((r) => (
        <label
          key={r}
          title={LABEL[r]}
          className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 select-none hover:border-brand-500 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white"
        >
          <input type="radio" name={name} value={r} defaultChecked={value === r} className="sr-only" />
          <span className="font-semibold">{r}</span>
          {!compact && <span className="ml-1 hidden sm:inline">{LABEL[r]}</span>}
        </label>
      ))}
    </div>
  );
}

/** Rating 1-5 with a short line of the scale, for headings. */
export function RatingScale() {
  return (
    <p className="text-xs text-slate-500">
      {[1, 2, 3, 4, 5].map((r) => `${r} ${LABEL[r]}`).join(" · ")}
    </p>
  );
}

export function Paragraph({ children }: { children: string | null | undefined }) {
  if (!children) return <p className="text-slate-400">Nothing written.</p>;
  return <p className="whitespace-pre-line text-slate-700">{children}</p>;
}

type CycleValues = {
  name: string;
  kind: "ANNUAL" | "HALF_YEARLY";
  periodStart: Date;
  periodEnd: Date;
  goalsDue: Date | null;
  selfDue: Date | null;
  managerDue: Date | null;
};

/** Name, period and due dates of a review cycle. The people list goes in `children`. */
export function CycleFields({ values }: { values: CycleValues }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <input name="name" required defaultValue={values.name} className="input" />
      </Field>
      <Field label="Type">
        <select name="kind" defaultValue={values.kind} className="input">
          <option value="ANNUAL">Yearly</option>
          <option value="HALF_YEARLY">Half-yearly</option>
        </select>
      </Field>
      <div className="hidden sm:block" />
      <Field label="Period from">
        <input type="date" name="periodStart" required defaultValue={toDateInput(values.periodStart)} className="input" />
      </Field>
      <Field label="Period to">
        <input type="date" name="periodEnd" required defaultValue={toDateInput(values.periodEnd)} className="input" />
      </Field>
      <Field label="Goals agreed by (optional)">
        <input type="date" name="goalsDue" defaultValue={toDateInput(values.goalsDue)} className="input" />
      </Field>
      <Field label="Self reviews due (optional)">
        <input type="date" name="selfDue" defaultValue={toDateInput(values.selfDue)} className="input" />
      </Field>
      <Field label="Manager reviews due (optional)">
        <input type="date" name="managerDue" defaultValue={toDateInput(values.managerDue)} className="input" />
      </Field>
    </div>
  );
}

type Person = { id: string; firstName: string; lastName: string; designation: string; manager: { firstName: string; lastName: string } | null };

/** Tick-list of people; those with a manager start ticked. */
export function PeoplePicker({ people, ticked }: { people: Person[]; ticked?: (p: Person) => boolean }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {people.map((p) => (
        <li key={p.id}>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-50">
            <input type="checkbox" name="employeeIds" value={p.id} defaultChecked={ticked ? ticked(p) : false} className="mt-1" />
            <span>
              <span className="font-medium">
                {p.firstName} {p.lastName}
              </span>
              <span className="block text-xs text-slate-500">
                {p.designation} · {p.manager ? `manager ${p.manager.firstName} ${p.manager.lastName}` : "no manager, an admin reviews"}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Amber card of review steps waiting on the signed-in person (Home and the reviews page). */
export function ReviewTodos({ todos, today }: { todos: { id: string; label: string; due: Date | null }[]; today: Date }) {
  if (todos.length === 0) return null;
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">
        {todos.length === 1 ? "1 performance review step needs you" : `${todos.length} performance review steps need you`}
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {todos.map((t) => (
          <li key={`${t.id}-${t.label}`} className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/hr/reviews/${t.id}`} className="font-medium text-amber-950 hover:underline">
              {t.label}
            </Link>
            {t.due && (
              <span className={`text-xs ${t.due < today ? "font-semibold text-red-700" : "text-amber-800"}`}>
                {t.due < today ? "Overdue, was due " : "By "}
                {formatDate(t.due)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
