import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams an employee document to the employee themselves or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/documents/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const doc = await db.employeeDocument.findUnique({ where: { id } });
  if (!doc || (!isAdmin(user) && user.employee?.id !== doc.employeeId)) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
