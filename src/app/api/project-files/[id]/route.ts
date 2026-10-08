import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/projects";

/** Streams a project file to anyone who can see the project. PDFs and images open in the browser; other files download. */
export async function GET(_: Request, { params }: RouteContext<"/api/project-files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await db.projectFile.findFirst({ where: { id, project: projectScope(user) } });
  if (!file) return new Response("Not found", { status: 404 });
  const inline = file.mimeType !== "application/octet-stream";
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
