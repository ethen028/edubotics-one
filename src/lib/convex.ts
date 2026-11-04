import "server-only";
import { ConvexError } from "convex/values";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { getCurrentSession } from "./auth";
import { companyOfSession } from "./company";
import { onConvexUrl, signConvexToken } from "./convex-token";

/**
 * Next's side of the Convex bridge. Orbit keeps its own sign-in (sessions in PostgreSQL); for each call to
 * Convex this signs a short-lived token for the current session with Orbit's private key, and Convex checks
 * it against the public key (convex/auth.config.ts). Convex functions then see who is calling, their
 * company and role (convex/lib/orbit.ts).
 *
 * Settings (.env): CONVEX_URL (where Next reaches Convex) and CONVEX_AUTH_PRIVATE_KEY (from
 * `npm run convex:keys`). The office copy makes both by itself (docker/start.sh).
 */

function convexUrl() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL is not set.");
  return url;
}

/** The token for whoever is signed in. Pages call requireUser first, so a missing session here is a bug. */
async function currentToken() {
  const current = await getCurrentSession();
  if (!current) throw new Error("Not signed in");
  const { session, user } = current;
  const privateKey = process.env.CONVEX_AUTH_PRIVATE_KEY;
  if (!privateKey) throw new Error("CONVEX_AUTH_PRIVATE_KEY is not set. Run `npm run convex:keys`.");
  return signConvexToken(
    { userId: user.id, sessionId: session.id, companyId: companyOfSession(current), role: user.role, isOwner: user.isOwner },
    privateKey,
  );
}

/** Reads from Convex as the signed-in person. Call after requireUser. */
export async function convexQuery<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q>): Promise<FunctionReturnType<Q>> {
  return fetchQuery(query, args, { token: await currentToken(), url: convexUrl() });
}

/** Writes to Convex as the signed-in person. Call after requireUser. */
export async function convexMutation<M extends FunctionReference<"mutation">>(mutation: M, args: FunctionArgs<M>): Promise<FunctionReturnType<M>> {
  return fetchMutation(mutation, args, { token: await currentToken(), url: convexUrl() });
}

/** A Convex refusal written for staff ("Files can be up to 5 MB."), or null for anything unexpected. */
export function convexMessage(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : null;
}

/**
 * Puts a file in Convex storage and returns its id. `uploadUrl` is a mutation that hands out a one-time
 * upload address after checking the person may attach files there.
 */
export async function uploadToConvex(uploadUrl: FunctionReference<"mutation", "public", Record<string, never>, string>, file: { data: Uint8Array; mimeType: string }) {
  const address = await convexMutation(uploadUrl, {} as FunctionArgs<typeof uploadUrl>);
  const res = await fetch(onConvexUrl(address, convexUrl()), {
    method: "POST",
    headers: { "Content-Type": file.mimeType },
    body: Buffer.from(file.data),
  });
  if (!res.ok) throw new Error(`Upload to Convex failed (${res.status})`);
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}

/** Fetches a stored file through Next, so the browser never needs to reach Convex for it. */
export async function fetchConvexFile(address: string) {
  const res = await fetch(onConvexUrl(address, convexUrl()), { cache: "no-store" });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}
