import "server-only";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getApiUser, requireUser, type CurrentUser } from "./auth";
import { getSettings } from "./settings";
import { cleanDomain, emailInDomain, storageLimitBytes } from "./teamwork-rules";

// Teamwork: Messages, Channels, Files and Meetings. When Admin > Settings > Teamwork names a company email domain,
// only logins on that domain can open any of it, and only they are offered as people to message, add or invite.

export async function teamworkDomain() {
  return cleanDomain((await getSettings()).workspaceDomain);
}

export async function canUseTeamwork(user: { email: string }) {
  return emailInDomain(user.email, await teamworkDomain());
}

/** requireUser for every Teamwork page and server action: also sends people outside the company domain away. */
export async function requireTeamwork(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await canUseTeamwork(user))) redirect("/teamwork-off");
  return user;
}

/** getApiUser for Teamwork file downloads and polling. */
export async function getTeamworkApiUser() {
  const access = await getApiUser();
  if (access.error) return access;
  if (!(await canUseTeamwork(access.user))) return { error: new Response("Teamwork is for company email addresses only", { status: 403 }) };
  return access;
}

/** Active logins who can use Teamwork: the people you can message, add to a channel, share a folder with or invite. */
export async function teammateWhere(): Promise<Prisma.UserWhereInput> {
  const domain = await teamworkDomain();
  return { active: true, closedAt: null, ...(domain ? { email: { endsWith: `@${domain}`, mode: "insensitive" } } : {}) };
}

/** Keeps only the ids of people who can use Teamwork. */
export async function teammatesAmong(ids: string[], exceptId?: string) {
  const picked = [...new Set(ids)].filter((id) => id && id !== exceptId);
  if (picked.length === 0) return [];
  return db.user.findMany({ where: { id: { in: picked }, ...(await teammateWhere()) }, select: { id: true, name: true } });
}

/** Bytes used by Files and chat attachments together, and the limit. */
export async function storageUse() {
  const [files, chat] = await Promise.all([db.sharedFile.aggregate({ _sum: { size: true } }), db.chatAttachment.aggregate({ _sum: { size: true } })]);
  return { used: (files._sum.size ?? 0) + (chat._sum.size ?? 0), limit: storageLimitBytes() };
}

/** An error to show when these new files would go over the storage limit, or null. */
export async function storageProblem(adding: number) {
  const { used, limit } = await storageUse();
  if (used + adding <= limit) return null;
  return `Teamwork storage is full (${Math.round(limit / 1024 / 1024)} MB). Ask an admin to remove old files or raise the limit.`;
}
