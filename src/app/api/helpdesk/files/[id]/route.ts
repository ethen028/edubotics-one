import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ticketScope } from "@/lib/helpdesk";

/** Streams a helpdesk attachment to anyone who can see the request: the requester, its handler, or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/helpdesk/files/[id]">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  const { id } = await params;
  const file = await db.helpdeskAttachment.findFirst({ where: { id, ticket: ticketScope(user) } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: privateFileHeaders(file),
  });
}
