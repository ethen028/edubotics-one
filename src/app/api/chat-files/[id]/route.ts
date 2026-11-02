import { privateFileHeaders } from "@/lib/file-response";
import { db } from "@/lib/db";
import { getTeamworkApiUser } from "@/lib/teamwork";

/** A file sent in a chat, only for people in that conversation who could see the message it came with. */
export async function GET(_: Request, { params }: RouteContext<"/api/chat-files/[id]">) {
  const access = await getTeamworkApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const file = await db.chatAttachment.findUnique({ where: { id } });
  if (!file) return new Response("Not found", { status: 404 });
  const member = await db.conversationMember.findFirst({
    where: { conversationId: file.conversationId, userId: access.user.id, leftAt: null, joinedAt: { lte: file.createdAt } },
  });
  if (!member) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), { headers: privateFileHeaders(file) });
}
