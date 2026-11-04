import "server-only";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { db } from "./db";
import { convexQuery } from "./convex";
import { isAcked } from "./notice-rules";

export { POLICY_CATEGORIES, canEditNotice, isAcked } from "./notice-rules";

/**
 * The notice board lives in Convex (convex/notices.ts); people still live in PostgreSQL. These helpers read
 * from Convex and turn Convex's millisecond dates back into Dates for the pages.
 */

export const toDate = (ms: number | null | undefined) => (ms == null ? null : new Date(ms));

/** Names of people by id, for "posted by" and the acknowledgement roster. */
export async function namesOf(ids: string[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/**
 * Live notices the signed-in person still has to acknowledge, oldest due first. Shown on Home and counted in
 * the menu on every page, so if Convex can't be reached this logs and shows nothing rather than breaking
 * every page.
 */
export async function myPendingAcks() {
  try {
    const rows = await convexQuery(api.notices.myPending, {});
    return rows.map((n) => ({ id: n._id as string, kind: n.kind, title: n.title, ackDueDate: toDate(n.ackDueDate) }));
  } catch (error) {
    console.error("Notice board (Convex) unavailable:", error);
    return [];
  }
}

/** Up to three current announcements for Home, with the poster's name. Empty if Convex can't be reached. */
export async function homeAnnouncements(today: Date) {
  try {
    const rows = await convexQuery(api.notices.forHome, { today: today.getTime() });
    const names = await namesOf(rows.map((n) => n.authorId));
    return rows.map((n) => ({ id: n._id as string, title: n.title, body: n.body, pinned: n.pinned, createdAt: new Date(n.createdAt), author: { name: names.get(n.authorId) ?? "Former staff" } }));
  } catch (error) {
    console.error("Notice board (Convex) unavailable:", error);
    return [];
  }
}

/** Everyone with an active login, split by whether they have acknowledged the current version. */
export async function ackRoster(notice: { _id: Id<"notices">; version: number }) {
  const [users, acks] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, employee: { select: { designation: true } } },
      orderBy: { name: "asc" },
    }),
    convexQuery(api.notices.acknowledgements, { id: notice._id }),
  ]);
  const byUser = new Map(acks.map((a) => [a.userId, a]));
  const done = users.filter((u) => isAcked(notice, byUser.get(u.id))).map((u) => ({ ...u, ackedAt: new Date(byUser.get(u.id)!.ackedAt) }));
  const waiting = users
    .filter((u) => !isAcked(notice, byUser.get(u.id)))
    .map((u) => ({ ...u, olderVersion: byUser.has(u.id) }));
  return { done, waiting, total: users.length };
}
