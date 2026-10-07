import "server-only";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

export const POLICY_CATEGORIES = ["HR and leave", "Conduct", "Travel and expenses", "Safety", "IT and data", "Other"] as const;

/** Admins edit any notice; managers only their own. */
export const canEditNotice = (user: CurrentUser, notice: { authorId: string }) => isAdmin(user) || notice.authorId === user.id;

/** An acknowledgement only counts for the notice version it was given on. */
export const isAcked = (notice: { version: number }, ack: { version: number } | undefined) => !!ack && ack.version >= notice.version;

/** Live notices this user still has to read and acknowledge, oldest due first. */
export async function myPendingAcks(user: CurrentUser) {
  const notices = await db.notice.findMany({
    where: { requiresAck: true, archivedAt: null },
    select: {
      id: true,
      kind: true,
      title: true,
      version: true,
      ackDueDate: true,
      createdAt: true,
      acks: { where: { userId: user.id }, select: { version: true } },
    },
    orderBy: [{ ackDueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return notices.filter((n) => !isAcked(n, n.acks[0]));
}

/** Everyone with an active login, split by whether they have acknowledged the current version. */
export async function ackRoster(notice: { id: string; version: number }) {
  const [users, acks] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, employee: { select: { designation: true } } },
      orderBy: { name: "asc" },
    }),
    db.noticeAck.findMany({ where: { noticeId: notice.id } }),
  ]);
  const byUser = new Map(acks.map((a) => [a.userId, a]));
  const done = users.filter((u) => isAcked(notice, byUser.get(u.id))).map((u) => ({ ...u, ackedAt: byUser.get(u.id)!.ackedAt }));
  const waiting = users
    .filter((u) => !isAcked(notice, byUser.get(u.id)))
    .map((u) => ({ ...u, olderVersion: byUser.has(u.id) }));
  return { done, waiting, total: users.length };
}
