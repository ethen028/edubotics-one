import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { LetterKind } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { fullName, letterForm } from "@/lib/letters";
import { ISSUE_ORDER, LETTER_KINDS, canIssueKind, type FormField } from "@/lib/letter-rules";
import { issueLetterAction } from "../actions";

export const metadata = { title: "Issue a letter" };

function Input({ f }: { f: FormField }) {
  if (f.type === "checkbox")
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={f.name} defaultChecked={f.value === "on"} /> {f.label}
      </label>
    );
  const control =
    f.type === "textarea" ? (
      <textarea name={f.name} defaultValue={f.value} required={f.required} rows={f.name === "details" ? 6 : 3} maxLength={4000} className="input" />
    ) : f.type === "select" ? (
      <select name={f.name} defaultValue={f.value} required={f.required} className="input">
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : (
      <input name={f.name} type={f.type} defaultValue={f.value} required={f.required} maxLength={f.type === "text" ? 300 : undefined} className={f.type === "number" ? "input w-28" : "input"} />
    );
  return (
    <Field label={f.label}>
      {control}
      {f.hint && <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>}
    </Field>
  );
}

export default async function NewLetterPage({ searchParams }: PageProps<"/hr/letters/new">) {
  const user = await requireUser(["ADMIN", "HR"]);
  const q = (await searchParams) as Record<string, string | undefined>;
  if (!q.employee) redirect("/hr/letters");
  const employee = await db.employee.findUnique({ where: { id: q.employee }, select: { id: true, firstName: true, lastName: true, code: true, designation: true } });
  if (!employee) notFound();
  const name = fullName(employee);
  const self = employee.id === user.employee?.id;
  const kinds = ISSUE_ORDER.filter((k) => canIssueKind(user.role, k));
  const kind = kinds.find((k) => k === q.kind) as LetterKind | undefined;
  const header = (
    <PageHeader
      title={kind ? `${LETTER_KINDS[kind].label} for ${name}` : `Issue a letter to ${name}`}
      subtitle={`${employee.designation} · ${employee.code}`}
      actions={
        <Link href={`/hr/employees/${employee.id}`} className="btn-secondary">
          Back to their profile
        </Link>
      }
    />
  );
  if (self) return (<>{header}<p className="text-sm text-slate-600">Ask someone else to issue your own letters.</p></>);

  if (!kind) {
    const forms = await Promise.all(kinds.map((k) => letterForm(k, employee.id)));
    return (
      <>
        {header}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map((k, i) => (
            <div key={k} className="card flex flex-col text-sm">
              <h2 className="font-semibold">{LETTER_KINDS[k].label}</h2>
              <p className="mt-1 flex-1 text-slate-600">{LETTER_KINDS[k].blurb}</p>
              {forms[i].blocker ? (
                <p className="mt-3 text-xs text-slate-500">{forms[i].blocker}</p>
              ) : (
                <Link href={`/hr/letters/new?employee=${employee.id}&kind=${k}`} className="btn-secondary btn-sm mt-3 self-start">
                  Start
                </Link>
              )}
            </div>
          ))}
        </div>
        {!isAdmin(user) && <p className="mt-4 text-xs text-slate-500">Letters that show pay are issued by an admin.</p>}
      </>
    );
  }

  const old = q.replaces ? await db.hrLetter.findUnique({ where: { id: q.replaces } }) : null;
  const replaces = old && old.kind === kind && old.employeeId === employee.id && old.status === "ISSUED" ? old : null;
  const [form, settings] = await Promise.all([letterForm(kind, employee.id, (replaces?.inputs as Record<string, string> | null) ?? {}), getSettings()]);
  const meta = LETTER_KINDS[kind];

  return (
    <>
      {header}
      <div className="card max-w-2xl space-y-4">
        <p className="text-sm text-slate-600">{meta.blurb} Their details come from their record; what you type below is added to the letter.</p>
        {replaces && (
          <p className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            This is a fresh copy of {replaces.number ?? "their ID card"}, with today&apos;s date and their record as it is now. The earlier copy will be marked replaced.
          </p>
        )}
        {meta.reviewWording && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The wording of this letter is a plain starting point and has not been checked by a lawyer. Read it before you hand it over, and have it checked once before you rely on it.
          </p>
        )}
        {!settings.letterSignatoryName && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No signatory is set, so the letter is signed “Authorised signatory” with a blank line to sign by hand.{" "}
            {isAdmin(user) ? (
              <Link href="/admin/settings#letters" className="link">
                Set one in Settings
              </Link>
            ) : (
              "Ask an admin to set one in Settings."
            )}
          </p>
        )}
        {form.blocker ? (
          <p className="text-sm text-slate-700">{form.blocker}</p>
        ) : (
          <ActionForm action={issueLetterAction.bind(null, kind, employee.id, replaces?.id ?? null)} className="space-y-4">
            {form.fields.map((f) => (
              <Input key={f.name} f={f} />
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Issuing…">{meta.numbered ? "Issue and number it" : "Make the ID card"}</SubmitButton>
              <span className="text-xs text-slate-500">You can check it, download it and email it on the next page.</span>
            </div>
          </ActionForm>
        )}
      </div>
    </>
  );
}
