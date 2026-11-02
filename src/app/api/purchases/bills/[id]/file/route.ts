import { privateFileHeaders } from "@/lib/file-response";
import { getApiUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams the photo or PDF of a vendor bill to admins. */
export async function GET(_: Request, { params }: RouteContext<"/api/purchases/bills/[id]/file">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const user = access.user;
  if (!isAdmin(user)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const file = await db.vendorBillFile.findUnique({ where: { billId: id } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.data), {
    headers: privateFileHeaders(file),
  });
}
