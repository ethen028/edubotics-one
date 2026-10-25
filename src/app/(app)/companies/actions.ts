"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, rawDb } from "@/lib/db";
import { getCurrentSession, hashPassword, requireSuperadmin } from "@/lib/auth";
import { inCompany, prefixTaken } from "@/lib/company";
import { addStarterData } from "@/lib/company-starter";
import { INDIAN_STATES } from "@/lib/invoices";
import { logActivity } from "@/lib/activity";
import { passwordProblem } from "@/lib/passwords";
import type { FormState } from "@/components/action-form";

/** Pages a switch may land on: inside the app only. */
const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

/** A superadmin picks the company to work in. Kept on this browser's session, so other devices are unaffected. */
export async function switchCompany(formData: FormData) {
  const me = await requireSuperadmin();
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const company = await rawDb.company.findUnique({ where: { id: String(formData.get("companyId") ?? "") } });
  if (!company) throw new Error("That company is no longer in the group");
  const home = company.id === me.companyId;
  await rawDb.session.update({ where: { id: current.session.id }, data: { activeCompanyId: home ? null : company.id } });
  await inCompany(company.id, () => logActivity(me, "SIGN_IN", "company.switched", `${me.name} (superadmin) opened ${company.name}`));
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

const newCompany = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  legalName: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  state: z.enum(INDIAN_STATES),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,6}$/, "The document prefix is up to 6 letters or digits, e.g. EBK."),
  adminName: z.string().trim().max(120).optional(),
  adminEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email for the first admin.")]).optional(),
  adminPassword: z.string().max(200).optional(),
});

/**
 * Adds a company to the group: its own settings (name on letterheads, state for GST, document prefix), the
 * same starter departments, leave types, holidays and training as every company, and optionally its first
 * admin, who becomes that company's owner.
 */
export async function createCompany(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSuperadmin();
  const parsed = newCompany.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (await rawDb.company.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } } })) return { error: "There is already a company with that name." };
  if (await prefixTaken(d.prefix)) return { error: `Another company already numbers its documents ${d.prefix}/…; pick a different prefix.` };
  const admin = d.adminEmail ? { name: d.adminName || d.adminEmail, email: d.adminEmail, password: d.adminPassword ?? "" } : null;
  if (admin) {
    const weak = passwordProblem(admin.password, admin);
    if (weak) return { error: `First admin's temporary password: ${weak}` };
    if (await rawDb.user.findUnique({ where: { email: admin.email } })) return { error: "That email already has a login in the group." };
  }

  const company = await rawDb.company.create({ data: { name: d.name } });
  try {
    await inCompany(company.id, async () => {
      await db.companySettings.create({
        data: {
          companyId: company.id,
          companyName: d.legalName || d.name,
          companyAddress: d.address ?? "",
          companyState: d.state,
          invoicePrefix: d.prefix,
          companyWebsite: null,
        },
      });
      await addStarterData(db, company.id);
      if (admin) {
        await db.user.create({
          data: { name: admin.name, email: admin.email, role: "ADMIN", isOwner: true, passwordHash: await hashPassword(admin.password), mustChangePassword: true },
        });
      }
      await logActivity(me, "SETTINGS", "company.created", `${me.name} added ${d.name} to the group${admin ? ` with ${admin.email} as its first admin` : ""}`);
    });
  } catch (e) {
    // Nothing half-made stays behind: the company and anything in it go again.
    await rawDb.$transaction([
      rawDb.user.deleteMany({ where: { companyId: company.id } }),
      rawDb.trainingModule.deleteMany({ where: { companyId: company.id } }),
      rawDb.holiday.deleteMany({ where: { companyId: company.id } }),
      rawDb.leaveType.deleteMany({ where: { companyId: company.id } }),
      rawDb.department.deleteMany({ where: { companyId: company.id } }),
      rawDb.activityLog.deleteMany({ where: { companyId: company.id } }),
      rawDb.companySettings.deleteMany({ where: { companyId: company.id } }),
      rawDb.company.delete({ where: { id: company.id } }),
    ]);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That email already has a login in the group." };
    throw e;
  }
  revalidatePath("/companies");
  return { ok: `${d.name} added. Open it to fill in its settings (GSTIN, bank, signatories) and add its people.` };
}

/** Renames a company in the group (the name in the switcher; its letterhead name is in its own settings). */
export async function renameCompany(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSuperadmin();
  const name = z.string().trim().min(2, "Enter the company name.").max(120).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const clash = await rawDb.company.findFirst({ where: { name: { equals: name.data, mode: "insensitive" }, id: { not: id } } });
  if (clash) return { error: "There is already a company with that name." };
  const before = await rawDb.company.update({ where: { id }, data: { name: name.data } });
  await inCompany(id, () => logActivity(me, "SETTINGS", "company.renamed", `Renamed the company to ${before.name}`));
  revalidatePath("/", "layout");
  return { ok: "Name saved." };
}
