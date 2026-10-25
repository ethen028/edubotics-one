import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { initials, shortWhen, type ConversationRow } from "@/lib/messages";
import { formatSize } from "@/lib/project-files";

/** A round avatar: initials for a person, a people icon for a group, a # for a channel. */
export function Avatar({ name, group, channel, size = "md" }: { name: string; group?: boolean; channel?: boolean; size?: "sm" | "md" }) {
  return (
    <span className={`chat-avatar ${size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs"}`} aria-hidden="true">
      {channel ? <Icon name="hash" className="h-4 w-4" /> : group ? <Icon name="users" className="h-4 w-4" /> : initials(name)}
    </span>
  );
}

/** A file in a chat bubble: photos show small, anything else is a tile with its name and size. Opens in a new tab. */
export function Attachment({ file }: { file: { id: string; fileName: string; mimeType: string; size: number } }) {
  const href = `/api/chat-files/${file.id}`;
  if (file.mimeType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="chat-photo" title={file.fileName}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind sign-in, not a public image */}
        <img src={href} alt={file.fileName} loading="lazy" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="chat-file">
      <Icon name="file" className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.fileName}</span>
        <span className="block text-[11px] opacity-75">{formatSize(file.size)}</span>
      </span>
    </a>
  );
}

/** The left-hand list of conversations, with search. Hidden on a phone while a chat is open. */
export function ConversationList({
  rows,
  activeId,
  q,
  userId,
}: {
  rows: ConversationRow[];
  activeId?: string;
  q: string;
  userId: string;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] p-3">
        <form action="/messages" className="relative min-w-0 flex-1" role="search">
          <label htmlFor="chat-search" className="sr-only">
            Search messages
          </label>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="chat-search" name="q" defaultValue={q} placeholder="Search people or messages" className="input rounded-full pl-9" />
        </form>
        <Link href="/messages/new" className="btn-primary h-9 w-9 shrink-0 p-0" title="New message" aria-label="New message">
          <Icon name="plus" className="h-4 w-4" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          {q ? `No conversations with "${q}".` : "No conversations yet."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.map((c) => {
            const last = c.last;
            const preview = !last
              ? c.isGroup
                ? `${c.memberCount} people`
                : "Say hello"
              : last.removedAt
                ? "Message removed"
                : last.event
                  ? last.body
                  : `${last.senderId === userId ? "You: " : c.isGroup ? `${last.sender.name.split(" ")[0]}: ` : ""}${last.body || "Sent a file"}`;
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className={`chat-row ${c.id === activeId ? "chat-row-active" : ""}`}
                >
                  <Avatar name={c.name} group={c.isGroup} channel={c.isChannel} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${c.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                        {c.name}
                        {!c.isGroup && c.others[0] && !c.others[0].active && <span className="font-normal text-slate-400"> (left)</span>}
                      </span>
                      <span className={`shrink-0 text-[11px] ${c.unread ? "font-semibold text-brand-700" : "text-slate-400"}`}>{shortWhen(c.lastAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${c.unread ? "text-slate-700" : "text-slate-500"} ${last?.removedAt ? "italic" : ""}`}>{preview}</span>
                      {c.unread > 0 && (
                        <span className="nav-badge shrink-0" title={`${c.unread} unread`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The two-pane Messages screen: the list on the left, the open chat on the right. On a phone only one shows at a
 * time: the list on /messages, the chat on /messages/[id]; while searching, the list with the results under it.
 */
export function MessagesShell({ list, children, show }: { list: ReactNode; children: ReactNode; show: "list" | "chat" | "both" }) {
  return (
    <div className="chat-shell card p-0">
      <aside className={`chat-list ${show === "chat" ? "hidden md:flex" : "flex"}`} aria-label="Conversations">
        {list}
      </aside>
      <section className={`chat-pane ${show === "list" ? "hidden md:flex" : "flex"}`}>{children}</section>
    </div>
  );
}
