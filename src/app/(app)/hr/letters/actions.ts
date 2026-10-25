"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LetterKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canOffer } from "@/lib/recruitment";
import { logActivity } from "@/lib/activity";
import { flash } from "@/lib/flash";
import { issueLetter, issueOfferLetter } from "@/lib/letters";
import { LETTER_KINDS, canIssueKind } from "@/lib/letter-rules";
import type { FormState } from "@/components/action-form";

function refresh(employeeId: string | null) {
  revalidatePath("/hr/letters");
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
}

/** Issue a letter from the form, or a fresh copy in place of an earlier one. */
export async function issueLetterAction(kind: LetterKind, employeeId: string, replacesId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "HR"]);
  if (!z.enum(LetterKind).safeParse(kind).success || !canIssueKind(user.role, kind)) return { error: "Only an admin can issue this letter, as it shows pay." };
  if (kind === "OFFER") return { error: "Offer letters are made in Recruitment." };
  if (employeeId === user.employee?.id) return { error: "Ask someone else to issue your own letters." };
  if (replacesId) {
    const old = await db.hrLetter.findUnique({ where: { id: replacesId }, select: { kind: true, employeeId: true, status: true } });
    if (!old || old.kind !== kind || old.employeeId !== employeeId || old.status !== "ISSUED") return { error: "That letter has already been replaced or cancelled." };
  }
  const values: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string" && !k.startsWith("$")) values[k] = v.slice(0, 4000);
  const result = await issueLetter(kind, employeeId, values, user.id, replacesId);
  if ("error" in result) return { error: result.error };
  const { letter } = result;
  await logActivity(user, "HR", "letter.issued", `Issued ${LETTER_KINDS[kind].label.toLowerCase()}${letter.number ? ` ${letter.number}` : ""} to ${letter.recipient}${replacesId ? " in place of an earlier copy" : ""}`);
  refresh(employeeId);
  await flash(`${LETTER_KINDS[kind].label} issued${letter.number ? `: ${letter.number}` : ""}.`);
  redirect(`/hr/letters/${letter.id}`);
}

/** Issue (or reissue) the offer letter for an offer. Admins only, as offers carry salary. */
export async function issueOfferLetterAction(offerId: string) {
  const user = await requireUser(["ADMIN"]);
  if (!canOffer(user)) redirect("/?denied=1");
  const result = await issueOfferLetter(offerId, user.id);
  if ("error" in result) redirect("/recruitment");
  const { letter } = result;
  await logActivity(user, "HR", "letter.issued", `Issued offer letter ${letter.number} to ${letter.recipient}`);
  refresh(letter.employeeId);
  revalidatePath(`/recruitment/offers/${offerId}`);
  await flash(`Offer letter issued: ${letter.number}.`);
  redirect(`/hr/letters/${letter.id}`);
}

/** Withdraw a letter given by mistake. Its number stays used, and the copy is marked cancelled. */
export async function cancelLetter(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "HR"]);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it's being cancelled." };
  const letter = await db.hrLetter.findUnique({ where: { id } });
  if (!letter || !canIssueKind(user.role, letter.kind)) return { error: "Letter not found." };
  if (letter.status !== "ISSUED") return { error: "Only the current copy of a letter can be cancelled." };
  await db.hrLetter.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.slice(0, 300), cancelledById: user.id } });
  await logActivity(user, "HR", "letter.cancelled", `Cancelled ${LETTER_KINDS[letter.kind].label.toLowerCase()} ${letter.number ?? ""} for ${letter.recipient}: ${reason.slice(0, 200)}`);
  refresh(letter.employeeId);
  revalidatePath(`/hr/letters/${id}`);
  return { ok: "Letter cancelled." };
}
