import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** What can land in someone's Inbox (from Task Flow v5). Shown as a small label next to each message. */
export const NOTIFICATION_KINDS = {
  "task.assigned": "New task",
  "task.update-requested": "Update requested",
  "task.updated": "Task update",
  "task.review": "Ready for review",
  "task.blocked": "Blocked",
  "task.unblocked": "Ready to start",
  "project.post": "Project post",
  "project.decided": "Project approval",
  "timesheet.decided": "Timesheet",
  "plan.assigned": "Work plan",
  "plan.review": "Weekly review",
  "commission.ready": "Commission",
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

type Message = { kind: NotificationKind; title: string; body?: string | null; href: string };

/**
 * Puts a message in each person's Inbox. The person who caused it is left out (nobody needs telling about their own
 * action), as are repeats in `userIds`. Pass `tx` to write inside an open transaction.
 */
export async function notify(
  userIds: (string | null | undefined)[],
  actorId: string | null,
  message: Message,
  tx: Prisma.TransactionClient = db,
) {
  const to = [...new Set(userIds.filter((id): id is string => !!id && id !== actorId))];
  if (to.length === 0) return;
  const body = message.body?.trim() ? message.body.trim().slice(0, 300) : null;
  await tx.notification.createMany({
    data: to.map((userId) => ({ userId, kind: message.kind, title: message.title.slice(0, 200), body, href: message.href })),
  });
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
