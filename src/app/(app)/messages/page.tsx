import Link from "next/link";
import { requireTeamwork } from "@/lib/teamwork";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { conversationName, myConversations, searchMyMessages, shortWhen, unreadMessageCount } from "@/lib/messages";
import { ConversationList, MessagesShell } from "./ui";
import { LiveUpdates } from "./client";

export const metadata = { title: "Messages" };

/** Staff messages: the conversation list, and message search results when searching. */
export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const user = await requireTeamwork();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const [rows, found, unread] = await Promise.all([myConversations(user.id, q), searchMyMessages(user.id, q), unreadMessageCount(user.id)]);

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={unread ? `${unread} unread` : "Private chats with your colleagues"}
        actions={
          <Link href="/messages/new" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            New message
          </Link>
        }
      />
      <LiveUpdates unread={unread} />
      <MessagesShell show={q ? "both" : "list"} list={<ConversationList rows={rows} q={q} userId={user.id} />}>
        {q && found.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              {found.length === 30 ? "Latest 30 messages" : `${found.length} message${found.length === 1 ? "" : "s"}`} with &ldquo;{q}&rdquo;
            </h2>
            <ul className="divide-y divide-slate-100">
              {found.map((m) => (
                <li key={m.id}>
                  <Link href={`/messages/${m.conversation.id}#m-${m.id}`} className="block rounded-lg px-2 py-2.5 hover:bg-slate-50">
                    <span className="flex justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        <span className="font-medium text-slate-700">{conversationName(m.conversation, m.conversation.members.map((x) => x.user))}</span> ·{" "}
                        {m.senderId === user.id ? "You" : m.sender.name}
                      </span>
                      <span className="shrink-0">{shortWhen(m.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-slate-800">
                      <Highlight text={m.body} q={q} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="m-auto max-w-sm p-8 text-center">
            <span className="chat-avatar mx-auto mb-3 h-12 w-12">
              <Icon name="chat" className="h-5 w-5" />
            </span>
            {q ? (
              <p className="text-sm text-slate-500">No messages with &ldquo;{q}&rdquo;. Search looks through the conversations you are in.</p>
            ) : rows.length === 0 ? (
              <>
                <h2 className="font-semibold text-slate-900">Start your first conversation</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Message one colleague, or make a group for a school team or project. Only the people in a conversation can read it.
                </p>
                <Link href="/messages/new" className="btn-primary mt-4">
                  New message
                </Link>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-slate-900">Pick a conversation</h2>
                <p className="mt-1 text-sm text-slate-500">Or start a new one. Only the people in a conversation can read it.</p>
              </>
            )}
          </div>
        )}
      </MessagesShell>
    </>
  );
}

/** The message text with the search words marked. */
function Highlight({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return <>{text}</>;
  // Start a little before the match so it shows in the two-line preview.
  const from = Math.max(0, at - 60);
  return (
    <>
      {from > 0 && "…"}
      {text.slice(from, at)}
      <mark className="rounded bg-brand-100 px-0.5 text-brand-900">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
