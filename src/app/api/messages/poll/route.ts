import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { allowRequest } from "@/lib/rate-limit";
import { conversationVersion, unreadMessageCount } from "@/lib/messages";

/**
 * What an open Messages page asks every few seconds: this person's unread count and, for the conversation on
 * screen, a marker that changes when a message is sent or removed there. Never returns message text.
 */
export async function GET(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const userId = access.user.id;
  // Pages ask every 5 seconds; this leaves room for a few open tabs.
  if (!(await allowRequest("chat-poll", userId, 60, 60_000))) {
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  }
  const c = new URL(request.url).searchParams.get("c");
  const member = c ? await db.conversationMember.count({ where: { conversationId: c, userId, leftAt: null } }) : 0;
  const [unread, latest] = await Promise.all([unreadMessageCount(userId), member ? conversationVersion(c!) : null]);
  return Response.json({ unread, latest }, { headers: { "Cache-Control": "no-store" } });
}
