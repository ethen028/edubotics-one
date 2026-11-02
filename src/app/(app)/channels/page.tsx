import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeamwork, teammateWhere } from "@/lib/teamwork";
import { allChannels, shortWhen } from "@/lib/messages";
import { Empty, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { createChannel, joinChannel } from "../messages/actions";
import { Avatar } from "../messages/ui";

export const metadata = { title: "Channels" };

/** Every channel in the company: open the ones you are in, join the others, or start a new one. */
export default async function ChannelsPage() {
  const user = await requireTeamwork();
  const [channels, people] = await Promise.all([
    allChannels(user.id),
    db.user.findMany({ where: { ...(await teammateWhere()), id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const mine = channels.filter((c) => c.joined);
  const others = channels.filter((c) => !c.joined);

  return (
    <>
      <PageHeader title="Channels" subtitle="Team and topic chats every staff member can find and join. For private talk, use Messages." />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <section className="card">
            <h2 className="font-semibold">Your channels</h2>
            {mine.length === 0 ? (
              <Empty>You are not in any channel yet. Join one below or start one.</Empty>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {mine.map((c) => (
                  <li key={c.id}>
                    <Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50">
                      <Avatar name={c.title ?? ""} channel />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{c.title}</span>
                        <span className="block truncate text-xs text-slate-500">{c.description || `${c.memberCount} members`}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">{shortWhen(c.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="font-semibold">More channels</h2>
            {others.length === 0 ? (
              <Empty>{channels.length === 0 ? "No channels yet. Start the first one, for example General or Trainers." : "You are in every channel."}</Empty>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {others.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                    <Avatar name={c.title ?? ""} channel />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{c.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.description ? `${c.description} · ` : ""}
                        {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                      </span>
                    </span>
                    <form action={joinChannel.bind(null, c.id)}>
                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Joining…">
                        Join
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card self-start">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="hash" className="h-4 w-4 text-brand-700" />
            New channel
          </h2>
          <p className="mt-1 text-sm text-slate-500">Everyone can see the channel and join it, and new members can read it from the start.</p>
          <ActionForm action={createChannel} className="mt-3 space-y-3">
            <label className="block">
              <span className="label">Name</span>
              <input name="title" required maxLength={80} placeholder="e.g. Trainers" className="input" />
            </label>
            <label className="block">
              <span className="label">What it&apos;s for (optional)</span>
              <input name="description" maxLength={200} placeholder="e.g. Class plans and kit for school trainers" className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="everyone" /> Add everyone now
            </label>
            {people.length > 0 && (
              <fieldset>
                <legend className="label">Or add people (optional)</legend>
                <div className="max-h-56 space-y-1.5 overflow-y-auto">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="members" value={p.id} /> {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <SubmitButton pendingLabel="Creating…">Create channel</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
