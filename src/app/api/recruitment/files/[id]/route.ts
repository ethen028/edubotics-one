import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { candidateAccess } from "@/lib/recruitment";

/** Streams a candidate's resume or file to recruiters and to the candidate's interviewers. */
export async function GET(_: Request, { params }: RouteContext<"/api/recruitment/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await db.candidateFile.findUnique({ where: { id } });
  if (!file || !(await candidateAccess(user, file.candidateId))) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
