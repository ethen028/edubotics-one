import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/projects";

/** Streams a project file to anyone who can see the project. PDFs and images open in the browser; other files download. */
export async function GET(_: Request, { params }: RouteContext<"/api/project-files/[id]">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  const { id } = await params;
  const file = await db.projectFile.findFirst({ where: { id, project: projectScope(user) } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: privateFileHeaders(file),
  });
}
