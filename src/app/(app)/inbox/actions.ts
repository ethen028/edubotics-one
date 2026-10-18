"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Opens a message: marks it read and goes to the page it is about. */
export async function openNotification(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) redirect("/inbox");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
  // Messages only ever link inside the app.
  redirect(n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/inbox");
}

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function toggleRead(id: string) {
  const user = await requireUser();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  await db.notification.update({ where: { id }, data: { readAt: n.readAt ? null : new Date() } });
  revalidatePath("/", "layout");
}
