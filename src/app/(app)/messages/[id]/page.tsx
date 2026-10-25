import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamwork, teammateWhere } from "@/lib/teamwork";
import { db } from "@/lib/db";
import { Icon } from "@/components/icons";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { humanize } from "@/lib/format";
import { conversationFiles, conversationVersion, dayHeading, dayKey, loadMyConversation, myConversations, shortWhen, timeOf, unreadMessageCount } from "@/lib/messages";
import { formatSize } from "@/lib/project-files";
import { addMembers, describeChannel, joinChannel, leaveGroup, removeMessage, renameGroup, sendMessage } from "../actions";
import { Attachment, Avatar, ConversationList, MessagesShell } from "../ui";
import { Composer, LiveUpdates, ReadAndScroll } from "../client";

export const metadata = { title: "Messages" };

/** One conversation: its messages (from when you joined), the composer, its files, and for groups the people in it. */
export default async function ConversationPage({ params, searchParams }: PageProps<"/messages/[id]">) {
  const user = await requireTeamwork();
  const { id } = await params;
  const showFiles = ((await searchParams) as Record<string, string | undefined>).tab === "files";
  const c = await loadMyConversation(user.id, id);
  if (!c) {
    // A channel you're not in yet (from a link someone shared): offer to join instead of "not found".
    const channel = await db.conversation.findFirst({ where: { id, isChannel: true }, select: { title: true, description: true } });
    if (!channel) notFound();
    return (
      <div className="card mx-auto mt-6 max-w-md text-center">
        <span className="chat-avatar mx-auto mb-3 h-12 w-12">
          <Icon name="hash" className="h-5 w-5" />
        </span>
        <h1 className="font-semibold text-slate-900">{channel.title}</h1>
        {channel.description && <p className="mt-1 text-sm text-slate-500">{channel.description}</p>}
        <p className="mt-2 text-sm text-slate-600">You are not in this channel yet. Join to read it from the start and post.</p>
        <form action={joinChannel.bind(null, id)} className="mt-4">
          <SubmitButton pendingLabel="Joining…">Join channel</SubmitButton>
        </form>
      </div>
    );
  }

  const [messages, rows, unread, version, colleagues, files] = await Promise.all([
    db.chatMessage.findMany({
      where: { conversationId: id, createdAt: { gte: c.me.joinedAt } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        sender: { select: { id: true, name: true } },
        attachments: { select: { id: true, fileName: true, mimeType: true, size: true } },
      },
    }),
    myConversations(user.id),
    unreadMessageCount(user.id),
    conversationVersion(id),
    c.isGroup
      ? db.user.findMany({
          where: { ...(await teammateWhere()), id: { notIn: c.members.map((m) => m.userId) } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
    conversationFiles(id, c.me.joinedAt),
  ]);
  messages.reverse();
  const tab = (files: boolean) => `/messages/${id}${files ? "?tab=files" : ""}`;
  const firstUnread = messages.find((m) => m.senderId !== user.id && !m.event && m.createdAt > c.me.lastReadAt)?.id;
  // "Seen" under your last message in a one-to-one chat, once the other person has opened it.
  const other = c.isGroup ? null : c.others[0];
  const myLast = [...messages].reverse().find((m) => m.senderId === user.id && !m.event && !m.removedAt);
  const seen = other && myLast && other.lastReadAt >= myLast.createdAt;
  const subtitle = c.isChannel
    ? c.description || `${c.members.length} ${c.members.length === 1 ? "member" : "members"}`
    : c.isGroup
    ? c.members.map((m) => (m.userId === user.id ? "You" : m.user.name.split(" ")[0])).join(", ")
    : other
      ? other.user.active
        ? humanize(other.user.role)
        : "No longer has a login"
      : "";

  return (
    <>
      <LiveUpdates conversationId={id} latest={version ?? undefined} unread={unread} />
      <ReadAndScroll conversationId={id} latest={version ?? undefined} />
      <MessagesShell show="chat" list={<ConversationList rows={rows} activeId={id} q="" userId={user.id} />}>
        <header className="flex items-center gap-3 border-b border-[var(--line)] px-3 py-2.5">
          <Link href="/messages" className="icon-btn md:hidden" aria-label="Back to conversations">
            <Icon name="arrowLeft" className="h-4 w-4" />
          </Link>
          <Avatar name={c.name} group={c.isGroup} channel={c.isChannel} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold text-slate-900">{c.name}</h1>
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          </div>
          <nav className="chat-tabs" aria-label="Conversation">
            <Link href={tab(false)} aria-current={!showFiles ? "page" : undefined}>
              Chat
            </Link>
            <Link href={tab(true)} aria-current={showFiles ? "page" : undefined}>
              Files{files.length > 0 && <span className="ml-1 text-slate-400">{files.length}</span>}
            </Link>
          </nav>
          {c.isGroup && (
            <details className="chat-people">
              <summary className="btn-secondary btn-sm cursor-pointer list-none">
                <Icon name="users" className="h-3.5 w-3.5" />
                {c.members.length}
              </summary>
              <div className="chat-people-panel card space-y-4 p-4">
                <div>
                  <h2 className="mb-1 text-xs font-semibold text-slate-500 uppercase">In this {c.isChannel ? "channel" : "group"}</h2>
                  <ul className="space-y-1 text-sm">
                    {c.members.map((m) => (
                      <li key={m.userId} className="flex items-center gap-2">
                        <Avatar name={m.user.name} size="sm" />
                        {m.userId === user.id ? "You" : m.user.name}
                      </li>
                    ))}
                  </ul>
                </div>
                {colleagues.length > 0 && (
                  <ActionForm action={addMembers.bind(null, id)}>
                    <span className="label">Add people</span>
                    <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                      {colleagues.map((p) => (
                        <label key={p.id} className="flex items-center gap-2">
                          <input type="checkbox" name="members" value={p.id} /> {p.name}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.isChannel ? "They see the whole channel, earlier messages included." : "They see messages from when they are added, not earlier ones."}
                    </p>
                    <SubmitButton className="btn-secondary btn-sm mt-2">Add</SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={renameGroup.bind(null, id)}>
                  <label className="label" htmlFor="group-title">
                    {c.isChannel ? "Channel name" : "Group name"}
                  </label>
                  <div className="flex gap-2">
                    <input id="group-title" name="title" defaultValue={c.title ?? ""} maxLength={80} className="input" />
                    <SubmitButton className="btn-secondary btn-sm">Rename</SubmitButton>
                  </div>
                </ActionForm>
                {c.isChannel && (
                  <ActionForm action={describeChannel.bind(null, id)}>
                    <label className="label" htmlFor="channel-about">
                      What it&apos;s for
                    </label>
                    <div className="flex gap-2">
                      <input id="channel-about" name="description" defaultValue={c.description ?? ""} maxLength={200} className="input" />
                      <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
                    </div>
                  </ActionForm>
                )}
                <form action={leaveGroup.bind(null, id)}>
                  <ConfirmButton
                    className="btn-danger btn-sm"
                    message={c.isChannel ? `Leave "${c.name}"? You can join again any time from Channels.` : `Leave "${c.name}"? You stop seeing it and its messages.`}
                  >
                    {c.isChannel ? "Leave channel" : "Leave group"}
                  </ConfirmButton>
                </form>
              </div>
            </details>
          )}
        </header>

        {showFiles ? (
          <div className="chat-scroll">
            {files.length === 0 ? (
              <p className="m-auto max-w-xs py-10 text-center text-sm text-slate-500">
                No files yet. Attach one with the paperclip under Chat; only the people in this conversation can open it.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <Icon name="file" className="h-5 w-5 shrink-0 text-brand-700" />
                    <span className="min-w-0 flex-1">
                      <a href={`/api/chat-files/${f.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:underline">
                        {f.fileName}
                      </a>
                      <span className="block text-xs text-slate-500">
                        {formatSize(f.size)} · {f.uploadedBy.name} · {shortWhen(f.createdAt)}
                      </span>
                    </span>
                    <Link href={`${tab(false)}#m-${f.messageId}`} className="text-xs text-brand-700 hover:underline">
                      In chat
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
        <div className="chat-scroll">
          {messages.length === 300 && <p className="pb-2 text-center text-xs text-slate-400">Showing the latest 300 messages.</p>}
          {messages.length === 0 && (
            <div className="m-auto max-w-xs py-10 text-center text-sm text-slate-500">
              No messages yet. Say hello{other ? ` to ${other.user.name.split(" ")[0]}` : ""}.{" "}
              {c.isChannel ? "Every staff member can find this channel and join it." : "Only the people in this conversation can read it."}
            </div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const mine = m.senderId === user.id;
            const grouped = !newDay && prev && !prev.event && prev.senderId === m.senderId && m.createdAt.getTime() - prev.createdAt.getTime() < 5 * 60000;
            return (
              <div key={m.id}>
                {newDay && <div className="chat-day">{dayHeading(m.createdAt)}</div>}
                {m.id === firstUnread && <div className="chat-new">New messages</div>}
                {m.event ? (
                  <p className="chat-event">
                    {m.body} · {timeOf(m.createdAt)}
                  </p>
                ) : (
                  <div id={`m-${m.id}`} className={`chat-msg ${mine ? "chat-mine" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
                    {c.isGroup && !mine && !grouped && <div className="mb-0.5 px-1 text-xs font-medium text-slate-500">{m.sender.name}</div>}
                    <div className={`chat-bubble ${m.removedAt ? "chat-removed" : ""}`}>
                      {m.removedAt ? "Message removed" : m.body}
                      {!m.removedAt && m.attachments.length > 0 && (
                        <span className={`chat-files ${m.body ? "mt-2" : ""}`}>
                          {m.attachments.map((a) => (
                            <Attachment key={a.id} file={a} />
                          ))}
                        </span>
                      )}
                      <span className="chat-time">{timeOf(m.createdAt)}</span>
                    </div>
                    {mine && !m.removedAt && (
                      <form action={removeMessage.bind(null, m.id)} className="chat-remove">
                        <ConfirmButton className="text-[11px] text-slate-400 hover:text-red-600" message="Remove this message for everyone?">
                          Remove
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {seen && <p className="mt-1 text-right text-[11px] text-slate-400">Seen</p>}
          <div id="chat-end" />
        </div>
        )}

        {!showFiles && (
        <Composer
          action={sendMessage.bind(null, id)}
          placeholder={c.isGroup ? `Message ${c.name}` : `Message ${other?.user.name.split(" ")[0] ?? ""}`}
          disabled={!c.isGroup && other && !other.user.active ? "This person no longer has a login, so they can't get new messages." : undefined}
        />
        )}
      </MessagesShell>
    </>
  );
}
