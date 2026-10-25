import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { currentCompanyId } from "./company";

// Staff messages: private one-to-one chats and small named groups. Everything here is scoped to the person asking:
// a conversation is only ever loaded through their own membership, so nobody (admins included) can open one they
// are not in. People added to a group later see the messages from when they joined.

export const MAX_MESSAGE = 4000;
export const MAX_GROUP_TITLE = 80;

/** The key that makes two people always share one one-to-one conversation. */
export const directKey = (a: string, b: string) => [a, b].sort().join(":");

/** Conversations this person is in now (not ones they left). */
export const myMembership = (userId: string): Prisma.ConversationWhereInput => ({
  members: { some: { userId, leftAt: null } },
});

/** Messages from other people that arrived after this person last opened each conversation. */
export async function unreadMessageCount(userId: string) {
  const companyId = await currentCompanyId(); // raw SQL: the company filter is written by hand
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "ChatMessage" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId} AND cm."leftAt" IS NULL
    WHERE m."companyId" = ${companyId} AND m."senderId" <> ${userId} AND m."event" = false AND m."createdAt" > cm."lastReadAt"`;
  return Number(rows[0]?.n ?? 0);
}

/** Unread counts per conversation for this person. */
async function unreadByConversation(userId: string) {
  const companyId = await currentCompanyId();
  const rows = await db.$queryRaw<{ id: string; n: bigint }[]>`
    SELECT m."conversationId" AS id, count(*) AS n FROM "ChatMessage" m
    JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId} AND cm."leftAt" IS NULL
    WHERE m."companyId" = ${companyId} AND m."senderId" <> ${userId} AND m."event" = false AND m."createdAt" > cm."lastReadAt"
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

type Person = { id: string; name: string; active: boolean };

/** What a conversation is called for this person: the group's name, or the other person's. */
export function conversationName(c: { isGroup: boolean; title: string | null }, others: Person[]) {
  if (c.isGroup) return c.title || others.map((p) => p.name.split(" ")[0]).join(", ") || "Group";
  return others[0]?.name ?? "Just you";
}

export type ConversationRow = Awaited<ReturnType<typeof myConversations>>[number];

/** The conversation list: newest activity first, with the last message and how many are unread. */
export async function myConversations(userId: string, q = "") {
  const [conversations, unread] = await Promise.all([
    db.conversation.findMany({
      where: myMembership(userId),
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: {
        members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true, active: true } } } },
      },
    }),
    unreadByConversation(userId),
  ]);
  // The last message each person can see (from when they joined).
  const lastMessages = await Promise.all(
    conversations.map((c) => {
      const joinedAt = c.members.find((m) => m.userId === userId)!.joinedAt;
      return db.chatMessage.findFirst({
        where: { conversationId: c.id, createdAt: { gte: joinedAt } },
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { id: true, name: true } } },
      });
    }),
  );
  const needle = q.trim().toLowerCase();
  return conversations
    .map((c, i) => {
      const others = c.members.filter((m) => m.userId !== userId).map((m) => m.user);
      return {
        id: c.id,
        isGroup: c.isGroup,
        name: conversationName(c, others),
        others,
        memberCount: c.members.length,
        last: lastMessages[i],
        lastAt: lastMessages[i]?.createdAt ?? c.createdAt,
        unread: unread.get(c.id) ?? 0,
      };
    })
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.others.some((p) => p.name.toLowerCase().includes(needle)));
}

/** Messages containing the search words, in this person's own conversations only. */
export async function searchMyMessages(userId: string, q: string) {
  const needle = q.trim();
  if (needle.length < 2) return [];
  const memberships = await db.conversationMember.findMany({ where: { userId, leftAt: null }, select: { conversationId: true, joinedAt: true } });
  if (memberships.length === 0) return [];
  return db.chatMessage.findMany({
    where: {
      OR: memberships.map((m) => ({ conversationId: m.conversationId, createdAt: { gte: m.joinedAt } })),
      event: false,
      removedAt: null,
      body: { contains: needle.slice(0, 100), mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      sender: { select: { name: true } },
      conversation: {
        select: {
          id: true,
          isGroup: true,
          title: true,
          members: { where: { leftAt: null, userId: { not: userId } }, select: { user: { select: { id: true, name: true, active: true } } } },
        },
      },
    },
  });
}

/** One conversation, only if this person is in it now; otherwise null. */
export async function loadMyConversation(userId: string, id: string) {
  const c = await db.conversation.findFirst({
    where: { id, ...myMembership(userId) },
    include: {
      members: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, name: true, active: true, role: true } } },
      },
    },
  });
  if (!c) return null;
  const me = c.members.find((m) => m.userId === userId)!;
  const others = c.members.filter((m) => m.userId !== userId);
  return { ...c, me, others, name: conversationName(c, others.map((m) => m.user)) };
}

/** Initials for the round avatar. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** "10:42", "Yesterday", "Mon" or "12 Oct": short enough for the conversation list. Indian time. */
export function shortWhen(d: Date, now = new Date()) {
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = day(now);
  if (day(d) === today) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (day(d) === day(new Date(now.getTime() - 86400000))) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** The day heading between messages: "Today", "Yesterday" or "Sat, 17 Oct". */
export function dayHeading(d: Date, now = new Date()) {
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (day(d) === day(now)) return "Today";
  if (day(d) === day(new Date(now.getTime() - 86400000))) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric", timeZone: "Asia/Kolkata" });
}

export const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const timeOf = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Changes whenever a message is sent or removed in a conversation; the open chat page reloads when it does. */
export async function conversationVersion(conversationId: string) {
  const [c, removed] = await Promise.all([
    db.conversation.findUnique({ where: { id: conversationId }, select: { lastMessageAt: true } }),
    db.chatMessage.aggregate({ where: { conversationId }, _max: { removedAt: true } }),
  ]);
  const times = [c?.lastMessageAt, removed._max.removedAt].filter((d): d is Date => !!d).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
