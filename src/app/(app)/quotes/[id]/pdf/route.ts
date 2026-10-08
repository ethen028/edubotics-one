import { getCurrentUser, isManagerOrAdmin } from "@/lib/auth";
import { quotePdf, pdfResponse } from "@/lib/pdf";

/** The quote as a PDF, the same file that is attached when it's emailed. */
export async function GET(req: Request, { params }: RouteContext<"/quotes/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user || !isManagerOrAdmin(user)) return new Response("Not found", { status: 404 });
  const file = await quotePdf((await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
