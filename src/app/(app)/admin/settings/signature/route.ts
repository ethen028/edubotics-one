import { getCurrentUser, isAdmin } from "@/lib/auth";
import { certificateSignature, letterSignature } from "@/lib/settings";

/** An uploaded signature, shown as a preview in Settings: the certificate one, or with ?letters the HR letter one. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("Not found", { status: 404 });
  const sig = new URL(req.url).searchParams.has("letters") ? await letterSignature() : await certificateSignature();
  if (!sig) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(sig.data), { headers: { "Content-Type": sig.type, "Cache-Control": "private, no-store" } });
}
