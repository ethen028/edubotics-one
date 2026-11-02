import { timingSafeEqual } from "node:crypto";
import { runReminderRounds } from "@/lib/payment-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Whether the request carries the CRON_SECRET Vercel sends with its cron calls. Refused when none is set. */
function fromCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Vercel's daily cron (vercel.json) calls this to send the automatic payment reminders, since a
 * hosted copy has no timer of its own. The office computer doesn't need it. Sending twice is
 * impossible: each company's round claims the day first.
 */
export async function GET(request: Request) {
  if (!fromCron(request)) return new Response("Not found", { status: 404 });
  const result = await runReminderRounds();
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
