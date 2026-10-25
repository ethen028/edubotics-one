"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTeamwork, storageProblem, teammatesAmong, teammateWhere } from "@/lib/teamwork";
import { readFiles } from "@/lib/project-files";
import { allowRequest } from "@/lib/rate-limit";
import { MAX_CHANNEL_ABOUT, MAX_GROUP_TITLE, MAX_MESSAGE, directKey, loadMyConversation } from "@/lib/messages";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";

function refresh(id?: string) {
  revalidatePath("/messages");
  revalidatePath("/channels");
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
  const user = await requireTeamwork();
  const otherId = String(formData.get("userId") ?? "");
  if (!otherId || otherId === user.id) redirect("/messages/new");
  const other = await db.user.findFirst({ where: { id: otherId, ...(await teammateWhere()) }, select: { id: true } });
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
  const user = await requireTeamwork();
  const parsed = groupSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const people = await teammatesAmong(formData.getAll("members").map(String), user.id);
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
  await flash("Group created.");
  redirect(`/messages/${c.id}`);
}

const bodySchema = z
  .string()
  .max(MAX_MESSAGE, `Messages can be up to ${MAX_MESSAGE} characters`)
  .transform((s) => s.replace(/\r\n/g, "\n").trim());

export async function sendMessage(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const c = await mine(user.id, conversationId);
  const parsed = bodySchema.safeParse(formData.get("body") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };
  if (!parsed.data && read.files.length === 0) return { error: "Write a message or attach a file first." };
  if (!c.isGroup && !c.others.some((m) => m.user.active)) return { error: "This person no longer has a login, so they can't get messages." };
  if (!(await allowRequest("chat-send", user.id, 60, 60_000))) return { error: "That's a lot of messages at once. Wait a minute and try again." };
  const full = read.files.length ? await storageProblem(read.files.reduce((sum, f) => sum + f.size, 0)) : null;
  if (full) return { error: full };
  const now = new Date();
  await db.$transaction([
    db.chatMessage.create({
      data: {
        conversationId,
        senderId: user.id,
        body: parsed.data,
        createdAt: now,
        attachments: { create: read.files.map((f) => ({ ...f, conversationId, uploadedById: user.id })) },
      },
    }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    // Writing in a conversation means you've read it.
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } }),
  ]);
  refresh(conversationId);
  return { ok: "sent" };
}

/** The sender takes back one of their own messages; the others see "Message removed". */
export async function removeMessage(messageId: string) {
  const user = await requireTeamwork();
  const m = await db.chatMessage.findFirst({ where: { id: messageId, senderId: user.id, event: false, removedAt: null } });
  if (!m) return;
  await mine(user.id, m.conversationId);
  // Its files go too, so a removed message leaves nothing behind.
  await db.$transaction([
    db.chatAttachment.deleteMany({ where: { messageId: m.id } }),
    db.chatMessage.update({ where: { id: m.id }, data: { body: "", removedAt: new Date() } }),
  ]);
  refresh(m.conversationId);
}

/** Called when a conversation is on screen: everything in it so far is read. */
export async function markRead(conversationId: string) {
  const user = await requireTeamwork();
  const me = await db.conversationMember.findFirst({ where: { conversationId, userId: user.id, leftAt: null } });
  if (!me) return;
  const now = new Date();
  const unread = await db.chatMessage.count({
    where: { conversationId, senderId: { not: user.id }, event: false, createdAt: { gt: me.lastReadAt } },
  });
  await db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } });
  if (unread) refresh(conversationId);
}

/** Any member can add people to a group or channel. In a group they see messages from now on; in a channel, all of it. */
export async function addMembers(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) return { error: "People can only be added to groups. Start a new group instead." };
  const current = new Set(c.members.map((m) => m.userId));
  const people = (await teammatesAmong(formData.getAll("members").map(String))).filter((p) => !current.has(p.id));
  if (people.length === 0) return { error: "Pick someone to add." };
  const now = new Date();
  const joinedAt = c.isChannel ? c.createdAt : now;
  await db.$transaction([
    ...people.map((p) =>
      db.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: p.id } },
        create: { conversationId, userId: p.id, joinedAt, lastReadAt: now },
        update: { leftAt: null, joinedAt, lastReadAt: now },
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
  const user = await requireTeamwork();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) return { error: "Only groups and channels have a name." };
  const parsed = groupSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.title === c.title) return { ok: "Name kept." };
  const now = new Date();
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { title: parsed.data.title, lastMessageAt: now } }),
    db.chatMessage.create({ data: { conversationId, senderId: user.id, event: true, body: `${user.name} renamed the ${c.isChannel ? "channel" : "group"} to "${parsed.data.title}"`, createdAt: now } }),
  ]);
  refresh(conversationId);
  return { ok: "Group renamed." };
}

/** Leaves a group: it disappears from your list and you stop getting its messages. */
export async function leaveGroup(conversationId: string) {
  const user = await requireTeamwork();
  const c = await mine(user.id, conversationId);
  if (!c.isGroup) throw new Error("One-to-one chats can't be left");
  const now = new Date();
  await db.$transaction([
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { leftAt: now } }),
    db.chatMessage.create({ data: { conversationId, senderId: user.id, event: true, body: `${user.name} left`, createdAt: now } }),
  ]);
  refresh(conversationId);
  await flash(c.isChannel ? "You left the channel. You can join again from Channels." : "You left the group.");
  redirect(c.isChannel ? "/channels" : "/messages");
}

// ─── Channels ──────────────────────────────────────────────────────────────

const channelSchema = z.object({
  title: z.string().trim().min(2, "Give the channel a short name").max(MAX_GROUP_TITLE, `Keep the name under ${MAX_GROUP_TITLE} characters`),
  description: z
    .string()
    .trim()
    .max(MAX_CHANNEL_ABOUT, `Keep the description under ${MAX_CHANNEL_ABOUT} characters`)
    .transform((v) => v || null),
});

/** A channel for a topic or team. Every staff member can see it in Channels and join; "everyone" adds all of them now. */
export async function createChannel(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const parsed = channelSchema.safeParse({ title: formData.get("title"), description: formData.get("description") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const taken = await db.conversation.findFirst({ where: { isChannel: true, title: { equals: parsed.data.title, mode: "insensitive" } }, select: { id: true } });
  if (taken) return { error: "There is already a channel with that name. Join it from the list, or pick another name." };
  const people =
    formData.get("everyone") === "on"
      ? (await db.user.findMany({ where: { ...(await teammateWhere()), id: { not: user.id } }, select: { id: true } }))
      : await teammatesAmong(formData.getAll("members").map(String), user.id);
  const c = await db.conversation.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      isGroup: true,
      isChannel: true,
      createdById: user.id,
      members: { create: [{ userId: user.id }, ...people.map((p) => ({ userId: p.id }))] },
      messages: { create: { senderId: user.id, event: true, body: `${user.name} started the channel` } },
    },
  });
  refresh();
  await flash("Channel created.");
  redirect(`/messages/${c.id}`);
}

/** Joins a channel: it shows in your Messages and you can read everything in it so far. */
export async function joinChannel(conversationId: string) {
  const user = await requireTeamwork();
  const c = await db.conversation.findFirst({ where: { id: conversationId, isChannel: true }, select: { id: true, createdAt: true } });
  if (!c) throw new Error("Channel not found");
  const now = new Date();
  const already = await db.conversationMember.findFirst({ where: { conversationId, userId: user.id, leftAt: null } });
  if (!already) {
    await db.$transaction([
      db.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        create: { conversationId, userId: user.id, joinedAt: c.createdAt, lastReadAt: now },
        update: { leftAt: null, joinedAt: c.createdAt, lastReadAt: now },
      }),
      db.chatMessage.create({ data: { conversationId, senderId: user.id, event: true, body: `${user.name} joined`, createdAt: now } }),
      db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    ]);
    refresh(conversationId);
  }
  redirect(`/messages/${conversationId}`);
}

/** Changes what a channel is for; any member can. */
export async function describeChannel(conversationId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeamwork();
  const c = await mine(user.id, conversationId);
  if (!c.isChannel) return { error: "Only channels have a description." };
  const parsed = channelSchema.shape.description.safeParse(formData.get("description") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.conversation.update({ where: { id: conversationId }, data: { description: parsed.data } });
  refresh(conversationId);
  return { ok: "Description saved." };
}
