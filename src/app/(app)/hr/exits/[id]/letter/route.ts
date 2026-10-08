import { getCurrentUser, isAdmin } from "@/lib/auth";
import { exitLetterPdf, pdfResponse } from "@/lib/pdf";

/** The relieving letter, the same file that is attached when it's emailed. Admins only. */
export async function GET(req: Request, { params }: RouteContext<"/hr/exits/[id]/letter">) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("Not found", { status: 404 });
  const file = await exitLetterPdf((await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
