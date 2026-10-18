import { canAccessEmployeeDocument } from "@/lib/permissions";
import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams an employee document to the employee themselves or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/documents/[id]">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  const { id } = await params;
  const doc = await db.employeeDocument.findUnique({ where: { id } });
  if (!doc || !canAccessEmployeeDocument(user, doc)) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(doc.data), {
    headers: privateFileHeaders(doc),
  });
}
