import { getCurrentUser, isAdmin } from "@/lib/auth";
import { certificateSignature } from "@/lib/settings";

/** The uploaded certificate signature, shown as a preview in Settings. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("Not found", { status: 404 });
  const sig = await certificateSignature();
  if (!sig) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(sig.data), { headers: { "Content-Type": sig.type, "Cache-Control": "private, no-store" } });
}
