import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { humanize } from "@/lib/format";
import { createGroup, startDirect } from "../actions";
import { Avatar } from "../ui";

export const metadata = { title: "New message" };

/** Start a one-to-one chat (tap a person) or a named group (tick two or more). */
export default async function NewMessagePage() {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { active: true, closedAt: null, id: { not: user.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });

  return (
    <>
      <PageHeader
        title="New message"
        subtitle="Only the people in a conversation can read it."
        actions={
          <Link href="/messages" className="btn-secondary">
            Back to messages
          </Link>
        }
      />
      {people.length === 0 ? (
        <p className="card text-sm text-slate-500">Nobody else has a login yet. Add colleagues under Admin, then message them here.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="font-semibold">Message one person</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {people.map((p) => (
                <li key={p.id}>
                  <form action={startDirect}>
                    <input type="hidden" name="userId" value={p.id} />
                    <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                      <Avatar name={p.name} />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{p.name}</span>
                        <span className="block text-xs text-slate-500">{humanize(p.role)}</span>
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
          {people.length >= 2 && (
            <section className="card">
              <h2 className="font-semibold">Make a group</h2>
              <p className="mt-1 text-sm text-slate-500">For a school team or a project. Anyone in the group can add people or leave.</p>
              <ActionForm action={createGroup} className="mt-3 space-y-3">
                <label className="block">
                  <span className="label">Group name</span>
                  <input name="title" required maxLength={80} placeholder="e.g. St. Mary's trainers" className="input" />
                </label>
                <fieldset>
                  <legend className="label">People (pick two or more)</legend>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto">
                    {people.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="members" value={p.id} /> {p.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <SubmitButton pendingLabel="Creating…">Create group</SubmitButton>
              </ActionForm>
            </section>
          )}
        </div>
      )}
    </>
  );
}
