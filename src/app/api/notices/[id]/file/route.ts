import { api } from "@convex/_generated/api";
import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { convexQuery, fetchConvexFile } from "@/lib/convex";

/** Streams a notice's attachment to anyone signed in. The file is kept in Convex storage; Next fetches it. */
export async function GET(_: Request, { params }: RouteContext<"/api/notices/[id]/file">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const file = await convexQuery(api.notices.attachment, { id });
  const data = file && (await fetchConvexFile(file.url));
  if (!file || !data) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(data), {
    headers: privateFileHeaders({ data, fileName: file.fileName }),
  });
}
