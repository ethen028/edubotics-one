import { getCurrentUser, isManagerOrAdmin } from "@/lib/auth";
import { invoicePdf, pdfResponse } from "@/lib/pdf";

/** The invoice as a PDF, the same file that is attached when it's emailed. */
export async function GET(req: Request, { params }: RouteContext<"/invoices/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user || !isManagerOrAdmin(user)) return new Response("Not found", { status: 404 });
  const file = await invoicePdf((await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
