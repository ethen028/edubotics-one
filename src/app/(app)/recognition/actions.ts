"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notifications";
import { canFeature, canRemove, isRecognitionValue } from "@/lib/recognition-rules";
import type { FormState } from "@/components/action-form";

const schema = z.object({
  toId: z.string().min(1, "Pick the colleague you want to thank"),
  value: z.string().refine(isRecognitionValue, "Pick what you are thanking them for"),
  message: z.string().trim().min(5, "Say a few words about what they did").max(500, "Keep it under 500 characters"),
});

function refresh() {
  revalidatePath("/", "layout");
}

export async function giveRecognition(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { toId, value, message } = parsed.data;
  if (toId === user.id) return { error: "Recognition is for thanking a colleague, not yourself." };
  const to = await db.user.findFirst({ where: { id: toId, active: true }, select: { name: true } });
  if (!to) return { error: "That person no longer has an active login." };

  const r = await db.recognition.create({ data: { fromId: user.id, toId, value, message } });
  await notify([toId], user.id, {
    kind: "recognition.received",
    title: `${user.name} recognised you: ${value}`,
    body: message,
    href: `/recognition#r-${r.id}`,
  });
  refresh();
  return { ok: `Thanks sent to ${to.name}.` };
}

/** Puts a recognition in the spotlight on everyone's Home, or takes it out again. */
export async function toggleFeatured(id: string) {
  const user = await requireUser();
  if (!canFeature(user)) throw new Error("Not allowed");
  const r = await db.recognition.findUniqueOrThrow({ where: { id } });
  const featuring = !r.featuredAt;
  await db.recognition.update({ where: { id }, data: featuring ? { featuredAt: new Date(), featuredById: user.id } : { featuredAt: null, featuredById: null } });
  if (featuring) {
    await notify([r.toId], user.id, {
      kind: "recognition.featured",
      title: `${user.name} put your recognition in the spotlight`,
      body: r.message,
      href: "/",
    });
  }
  refresh();
}

/** The giver can take back their own; an admin can remove any (logged). */
export async function removeRecognition(id: string) {
  const user = await requireUser();
  const r = await db.recognition.findUnique({ where: { id }, include: { from: { select: { name: true } }, to: { select: { name: true } } } });
  if (!r) return;
  if (!canRemove(user, r)) throw new Error("Not allowed");
  await db.recognition.delete({ where: { id } });
  if (r.fromId !== user.id) {
    await logActivity(user, "DELETED", "recognition.removed", `Removed a recognition from ${r.from.name} to ${r.to.name} (${r.value})`);
  }
  refresh();
}
