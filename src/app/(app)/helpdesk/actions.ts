"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TicketStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { humanize } from "@/lib/format";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { HELPDESK_CATEGORIES, canHandle, ticketScope } from "@/lib/helpdesk";
import type { FormState } from "@/components/action-form";

function refresh(id?: string) {
  revalidatePath("/helpdesk");
  if (id) revalidatePath(`/helpdesk/${id}`);
  revalidatePath("/", "layout"); // menu badge and Home cards
}

/** The optional file on a form: null when none was picked, or an error message. */
async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { file: null };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "Files can be up to 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return { error: "Attach a photo (JPG, PNG, WebP) or a PDF." };
  return { file: { fileName: file.name.slice(0, 200) || "attachment", mimeType, size: file.size, data: bytes } };
}

async function loadTicket(user: CurrentUser, id: string) {
  const ticket = await db.helpdeskTicket.findFirst({ where: { id, ...ticketScope(user) } });
  if (!ticket) throw new Error("Request not found");
  return ticket;
}

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

const ticketSchema = z.object({
  title: text(150).min(3, "Say in a few words what you need"),
  category: z.enum(HELPDESK_CATEGORIES, { message: "Pick a category" }),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: text(4000).min(5, "Add a few details so the admin team knows what to do"),
  assetId: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null),
});

export async function createTicket(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ticketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { assetId, ...data } = parsed.data;
  // Only one of your own items can be linked.
  if (assetId) {
    const mine = await db.asset.count({ where: { id: assetId, employeeId: user.employee?.id ?? "__none__" } });
    if (!mine) return { error: "Pick one of the items assigned to you." };
  }
  const upload = await readFile(formData);
  if (upload.error) return { error: upload.error };

  const ticket = await db.helpdeskTicket.create({
    data: {
      ...data,
      assetId,
      requesterId: user.id,
      ...(upload.file ? { attachments: { create: { ...upload.file, uploadedById: user.id } } } : {}),
    },
  });
  refresh();
  redirect(`/helpdesk/${ticket.id}?created=1`);
}

/** A reply from anyone who can see the request, with an optional photo or PDF. */
export async function addComment(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const ticket = await loadTicket(user, ticketId);
  const body = text(4000).safeParse(formData.get("body") ?? "");
  if (!body.success) return { error: body.error.issues[0].message };
  const upload = await readFile(formData);
  if (upload.error) return { error: upload.error };
  if (!body.data && !upload.file) return { error: "Write a reply or attach a file." };

  await db.$transaction([
    db.helpdeskComment.create({
      data: {
        ticketId,
        authorId: user.id,
        body: body.data || null,
        ...(upload.file ? { attachments: { create: { ...upload.file, ticketId, uploadedById: user.id } } } : {}),
      },
    }),
    db.helpdeskTicket.update({
      where: { id: ticketId },
      // A reply from the admin side is an update the requester should see on Home.
      data: { requesterUnread: ticket.requesterId !== user.id ? true : undefined, updatedAt: new Date() },
    }),
  ]);
  refresh(ticketId);
  return { ok: "Reply added." };
}

/** Admins pick who handles a request. Assigning an open request starts it. */
export async function assignTicket(ticketId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const ticket = await loadTicket(user, ticketId);
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  if (assigneeId === ticket.assigneeId) return;
  const assignee = assigneeId
    ? await db.user.findFirstOrThrow({ where: { id: assigneeId, active: true }, select: { name: true } })
    : null;
  await db.$transaction([
    db.helpdeskTicket.update({
      where: { id: ticketId },
      data: {
        assigneeId,
        status: assigneeId && ticket.status === "OPEN" ? "IN_PROGRESS" : undefined,
        requesterUnread: ticket.requesterId !== user.id || undefined,
      },
    }),
    db.helpdeskComment.create({
      data: { ticketId, authorId: user.id, event: assignee ? `Assigned to ${assignee.name}` : "Unassigned" },
    }),
  ]);
  refresh(ticketId);
}

/** Admin or assignee: start, finish (with what was done) or reopen. */
export async function setTicketStatus(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const ticket = await loadTicket(user, ticketId);
  if (!canHandle(user, ticket)) return { error: "Only the admin team or the person handling this can change it." };
  const status = z.enum(["OPEN", "IN_PROGRESS", "DONE"]).parse(formData.get("status"));
  const resolution = String(formData.get("resolution") ?? "").trim().slice(0, 2000) || null;
  if (status === "DONE" && !resolution) return { error: "Write what was done, so the requester knows." };
  if (status === ticket.status) return;
  await moveTo(user, ticket, status, resolution);
  return { ok: status === "DONE" ? "Marked done." : `Moved to ${humanize(status).toLowerCase()}.` };
}

/** The requester withdraws a request nobody has started, or reopens one that wasn't really fixed. */
export async function requesterStatus(ticketId: string, formData: FormData) {
  const user = await requireUser();
  const ticket = await loadTicket(user, ticketId);
  if (ticket.requesterId !== user.id) throw new Error("Only the person who raised this can do that");
  const to = z.enum(["CANCELLED", "OPEN"]).parse(formData.get("status"));
  if (to === "CANCELLED" && ticket.status !== "OPEN") throw new Error("Only requests nobody has started can be withdrawn");
  if (to === "OPEN" && ticket.status !== "DONE") throw new Error("Only done requests can be reopened");
  await moveTo(user, ticket, to, null);
}

async function moveTo(
  user: CurrentUser,
  ticket: { id: string; requesterId: string; assigneeId: string | null; status: TicketStatus },
  status: TicketStatus,
  resolution: string | null,
) {
  const event =
    status === "DONE"
      ? "Marked done"
      : status === "CANCELLED"
        ? "Withdrawn"
        : ticket.status === "DONE"
          ? "Reopened"
          : `Moved to ${humanize(status).toLowerCase()}`;
  await db.$transaction([
    db.helpdeskTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        doneAt: status === "DONE" ? new Date() : null,
        ...(status === "DONE" ? { resolution } : {}),
        // Whoever starts or finishes an unassigned request becomes its handler.
        ...(!ticket.assigneeId && ticket.requesterId !== user.id && (status === "IN_PROGRESS" || status === "DONE")
          ? { assigneeId: user.id }
          : {}),
        requesterUnread: ticket.requesterId !== user.id || undefined,
      },
    }),
    db.helpdeskComment.create({
      data: { ticketId: ticket.id, authorId: user.id, event, body: status === "DONE" ? resolution : null },
    }),
  ]);
  refresh(ticket.id);
}

export async function setTicketPriority(ticketId: string, formData: FormData) {
  const user = await requireUser();
  const ticket = await loadTicket(user, ticketId);
  if (!canHandle(user, ticket)) throw new Error("Not allowed");
  const priority = z.enum(["LOW", "MEDIUM", "HIGH"]).parse(formData.get("priority"));
  if (priority === ticket.priority) return;
  await db.$transaction([
    db.helpdeskTicket.update({ where: { id: ticketId }, data: { priority } }),
    db.helpdeskComment.create({ data: { ticketId, authorId: user.id, event: `Priority set to ${humanize(priority).toLowerCase()}` } }),
  ]);
  refresh(ticketId);
}

/** Equipment requests: hand the requester an available item from HR Assets, which records it on their profile. */
export async function handOverAsset(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const ticket = await db.helpdeskTicket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { requester: { select: { employee: { select: { id: true } } } } },
  });
  const employeeId = ticket.requester.employee?.id;
  if (!employeeId) return { error: "This person has no HR profile, so an asset can't be recorded against them." };
  const assetId = String(formData.get("assetId") ?? "");
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "AVAILABLE") return { error: "Pick an item that is in stock." };
  await db.$transaction([
    db.asset.update({ where: { id: asset.id }, data: { employeeId, status: "ASSIGNED", assignedAt: new Date() } }),
    db.helpdeskTicket.update({ where: { id: ticketId }, data: { assetId: asset.id, requesterUnread: ticket.requesterId !== user.id || undefined } }),
    db.helpdeskComment.create({
      data: { ticketId, authorId: user.id, event: `Handed over ${asset.code} (${asset.name})` },
    }),
  ]);
  refresh(ticketId);
  revalidatePath("/hr/assets");
  revalidatePath(`/hr/employees/${employeeId}`);
  return { ok: `${asset.code} is now assigned to them in HR Assets.` };
}

/** Opening your own request clears its "updated" flag, on Home and in the menu. */
export async function markSeen(ticketId: string) {
  const user = await requireUser();
  const { count } = await db.helpdeskTicket.updateMany({
    where: { id: ticketId, requesterId: user.id, requesterUnread: true },
    data: { requesterUnread: false },
  });
  if (count) revalidatePath("/", "layout");
}
