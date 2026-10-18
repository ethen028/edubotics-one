import { db } from "@/lib/db";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
};

export async function GET() {
  const result = await checkHealth(() => db.$queryRaw`SELECT 1`);
  return Response.json(result, {
    status: result.status === "ok" ? 200 : 503,
    headers,
  });
}
