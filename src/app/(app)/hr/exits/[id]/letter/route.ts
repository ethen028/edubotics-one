import { getApiUser, isAdmin } from "@/lib/auth";
import { draftExitLetterPdf, pdfResponse } from "@/lib/pdf";

/** The draft relieving letter while someone is on notice. Admins only; once they leave it is an issued letter under /hr/letters. */
export async function GET(req: Request, { params }: RouteContext<"/hr/exits/[id]/letter">) {
  const user = (await getApiUser()).user;
  if (!user || !isAdmin(user)) return new Response("Not found", { status: 404 });
  const file = await draftExitLetterPdf((await params).id);
  if (!file) return new Response("Not found", { status: 404 });
  return pdfResponse(file, new URL(req.url).searchParams.has("download"));
}
