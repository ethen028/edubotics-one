"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { MAX_GROUP_TITLE, MAX_MESSAGE, directKey, loadMyConversation } from "@/lib/messages";
import type { FormState } from "@/components/action-form";

function refresh(id?: string) {
  revalidatePath("/messages");
  if (id) revalidatePath(`/messages/${id}`);
  revalidatePath("/", "layout"); // the unread count in the menu
}

async function mine(userId: string, id: string) {
  const c = await loadMyConversation(userId, id);
  if (!c) throw new Error("Conversation not found");
  return c;
}

/** Opens the one-to-one chat with someone, starting it the first time. */
export async function startDirect(formData: FormData) {
  const user = await requireUser();
  const otherId = String(formData.get("userId") ?? "");
  if (!otherId || otherId === user.id) redirect("/messages/new");
  const other = await db.user.findFirst({ where: { id: otherId, active: true, closedAt: null }, select: { id: true } });
  if (!other) redirect("/messages/new");
  const key = directKey(user.id, other.id);
  const existing = await db.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
  if (existing) {
    // Back in the conversation if either had somehow left it.
    await db.conversationMember.updateMany({ where: { conversationId: existing.id, leftAt: { not: null } }, data: { leftAt: null } });
    redirect(`/messages/${existing.id}`);
  }
  const c = await db.conversation
    .create({
      data: {
        directKey: key,
        createdById: user.id,
        members: { create: [{ userId: user.id }, { userId: other.id }] },
      },
    })
    // Both clicked at the same moment: use the one that won.
    .catch(() => db.conversation.findUniqueOrThrow({ where: { directKey: key } }));
  refresh();
  redirect(`/messages/${c.id}`);
}

const groupSchema = z.object({
  title: z.string().trim().min(2, "Give the group a short name").max(MAX_GROUP_TITLE, `Keep the name under ${MAX_GROUP_TITLE} characters`),
});

/** A named group with two or more other people. */
export async function createGroup(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = groupSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const picked = [...new Set(formData.getAll("members").map(String))].filter((id) => id && id !== user.id);
  const people = await db.user.findMany({ where: { id: { in: picked }, active: true, closedAt: null }, select: { id: true } });
  if (people.length < 2) return { error: "Pick at least two people for a group. For one person, start a one-to-one chat." };
  const c = await db.conversation.create({
    data: {
      title: parsed.data.title,
      isGroup: true,
      createdById: user.id,
      members: { create: [{ userId: user.id }, ...people.map((p) => ({ userId: p.id }))] },
      messages: { create: { senderId: user.id, event: true, body: `${user.name} started the group` } },
    },
  });
  refresh();
  redirect(`/messages/${c.id}`);
}

const bodySchema = z
  .string()
  .max(MAX_MESSAGE, `Messages can be up to ${MAX_MESSAGE} characters`)
  .transform((s) => s.replace(/\r\n/g, "\n").trim());

export async function sendMessage(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await mine(user.id, conversationId);
  const parsed = bodySchema.safeParse(formData.get("body") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data) return { error: "Write a message first." };
  if (!c.isGroup && !c.others.some((m) => m.user.active)) return { error: "This person no longer has a login, so they can't get messages." };
  if (!(await allowRequest("chat-send", user.id, 60, 60_000))) return { error: "That's a lot of messages at once. Wait a minute and try again." };
  const now = new Date();
  await db.$transaction([
    db.chatMessage.create({ data: { conversationId, senderId: user.id, body: parsed.data, createdAt: now } }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    // Writing in a conversation means you've read it.
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } }),
  ]);
  refresh(conversationId);
  return { ok: "sent" };
}

/** The sender takes back one of their own messages; the others see "Message removed". */
export async function removeMessage(messageId: string) {
  const user = await requireUser();
  const m = await db.chatMessage.findFirst({ where: { id: messageId, senderId: user.id, event: false, removedAt: null } });
  if (!m) return;
  await mine(user.id, m.conversationId);
  await db.chatMessage.update({ where: { id: m.id }, data: { body: "", removedAt: new Date() } });
  refresh(m.conversationId);
}

/** Called when a conversation is on screen: everything in it so far is read. */
export async function markRead(conversationId: string) {
  const user = await requireUser();
  const me = await db.conversationMember.findFirst({ where: { conversationId, userId: user.id, leftAt: null } });
  if (!me) return;
  const now = new Date();
  const unread = await db.chatMessage.count({
    where: { conversationId, senderId: { not: user.id }, event: false, createdAt: { gt: me.lastReadAt } },
  });
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } });
  if (unread) refresh(conversationId);
}

/** Any member can add people to a group. They see messages from now on, not the earlier ones. */
export async function addMembers(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) return { error: "People can only be added to groups. Start a new group instead." };
  const current = new Set(c.members.map((m) => m.userId));
  const picked = [...new Set(formData.getAll("members").map(String))].filter((id) => id && !current.has(id));
  const people = await db.user.findMany({ where: { id: { in: picked }, active: true, closedAt: null }, select: { id: true, name: true } });
  if (people.length === 0) return { error: "Pick someone to add." };
  const now = new Date();
  await db.$transaction([
    ...people.map((p) =>
      db.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: p.id } },
        create: { conversationId, userId: p.id, joinedAt: now, lastReadAt: now },
        update: { leftAt: null, joinedAt: now, lastReadAt: now },
      }),
    ),
    db.chatMessage.create({
      data: { conversationId, senderId: user.id, event: true, body: `${user.name} added ${people.map((p) => p.name).join(", ")}`, createdAt: now },
    }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
  ]);
  refresh(conversationId);
  return { ok: `Added ${people.length === 1 ? people[0].name : `${people.length} people`}.` };
}

export async function renameGroup(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) return { error: "Only groups have a name." };
  const parsed = groupSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.title === c.title) return { ok: "Name kept." };
  const now = new Date();
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { title: parsed.data.title, lastMessageAt: now } }),
    db.chatMessage.create({ data: { conversationId, senderId: user.id, event: true, body: `${user.name} renamed the group to "${parsed.data.title}"`, createdAt: now } }),
  ]);
  refresh(conversationId);
  return { ok: "Group renamed." };
}

/** Leaves a group: it disappears from your list and you stop getting its messages. */
export async function leaveGroup(conversationId: string) {
  const user = await requireUser();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) throw new Error("One-to-one chats can't be left");
  const now = new Date();
  await db.$transaction([
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { leftAt: now } }),
    db.chatMessage.create({ data: { conversationId, senderId: user.id, event: true, body: `${user.name} left`, createdAt: now } }),
  ]);
  refresh(conversationId);
  redirect("/messages");
}
