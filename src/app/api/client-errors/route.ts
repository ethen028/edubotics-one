import { getApiUser } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { reportServerError } from "@/lib/telemetry";

/** Authenticated aggregate boundary signal. Never accepts messages, stacks, URLs or personal data. */
export async function POST(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  if (request.body) return new Response("Request body is not accepted", { status: 400 });
  if (!(await allowRequest("client-errors", access.user.id, 10, 900000))) return new Response("Too many requests", { status: 429 });
  reportServerError(null);
  return new Response(null, { status: 204 });
}
