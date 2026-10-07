import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams the photo or PDF of a vendor bill to admins. */
export async function GET(_: Request, { params }: RouteContext<"/api/purchases/bills/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!isAdmin(user)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const file = await db.vendorBillFile.findUnique({ where: { billId: id } });
  if (!file) return new Response("Not found", { status: 404 });
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
