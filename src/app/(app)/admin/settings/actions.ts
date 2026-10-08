"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/components/action-form";
import { GST_RATES, INDIAN_STATES } from "@/lib/invoices";
import { getSettings } from "@/lib/settings";
import { mailSetup, parseAddresses, sendEmail } from "@/lib/mail";
import { seal } from "@/lib/secret-box";
import { sniffMime } from "@/lib/hr-constants";
import { changedSettings, logActivity } from "@/lib/activity";
import { appAddressProblem } from "@/lib/google-sign-in";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const invoiceSettings = z.object({
  companyName: z.string().trim().min(1, "Enter the company name.").max(120),
  companyAddress: z.string().trim().min(1, "Enter the company address.").max(400),
  companyState: z.enum(INDIAN_STATES),
  companyPhone: text(40),
  companyEmail: text(120),
  pan: text(10).transform((v) => v?.toUpperCase() ?? null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "A GSTIN has 15 letters and digits.")
    .transform((v) => v || null),
  defaultGstRate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "Pick a GST rate."),
  defaultSac: text(10),
  invoicePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,6}$/, "The invoice prefix is up to 6 letters or digits."),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  bankName: text(80),
  bankAccountName: text(120),
  bankAccountNo: text(30),
  bankIfsc: text(11).transform((v) => v?.toUpperCase() ?? null),
  upiId: text(80),
  invoiceNote: text(500),
  quoteValidDays: z.coerce.number().int().min(1, "A quote must be valid for at least a day.").max(365),
  quoteTerms: text(1000),
});

export async function updateSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      hours: z.coerce.number().int().min(1).max(16),
      minutes: z.coerce.number().int().min(0).max(59),
      overtimeAfterMins: z.coerce.number().int().min(0).max(600),
      weeklyOffDays: z.array(z.coerce.number().int().min(0).max(6)).max(6),
      lopDivisor: z.coerce.number().int().min(20).max(31),
      noticePeriodDays: z.coerce.number().int().min(0).max(180),
      twoWheelerRatePerKm: z.coerce.number().min(0).max(100),
      carRatePerKm: z.coerce.number().min(0).max(100),
    })
    .safeParse({
      hours: formData.get("hours"),
      minutes: formData.get("minutes"),
      overtimeAfterMins: formData.get("overtimeAfterMins"),
      weeklyOffDays: formData.getAll("weeklyOffDays"),
      lopDivisor: formData.get("lopDivisor"),
      noticePeriodDays: formData.get("noticePeriodDays") ?? 30,
      twoWheelerRatePerKm: formData.get("twoWheelerRatePerKm") || 0,
      carRatePerKm: formData.get("carRatePerKm") || 0,
    });
  if (!parsed.success) return { error: "Check the hours, overtime minutes, weekly offs, LOP divisor, notice period and per-km rates." };
  const { hours, minutes, overtimeAfterMins, weeklyOffDays, lopDivisor, noticePeriodDays, twoWheelerRatePerKm, carRatePerKm } = parsed.data;
  const on = (k: string) => formData.get(k) === "on";
  const invoicing = invoiceSettings.safeParse(Object.fromEntries(formData));
  if (!invoicing.success) return { error: invoicing.error.issues[0].message };
  const data = {
    workMinutesPerDay: hours * 60 + minutes,
    overtimeAfterMins,
    weeklyOffDays,
    lopDivisor,
    noticePeriodDays,
    pfEnabled: on("pfEnabled"),
    esiEnabled: on("esiEnabled"),
    ptEnabled: on("ptEnabled"),
    tdsEnabled: on("tdsEnabled"),
    twoWheelerRatePerKm,
    carRatePerKm,
    ...invoicing.data,
    gstEnabled: on("gstEnabled"),
  };
  const before = await getSettings();
  await db.companySettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  const changed = changedSettings(before, data);
  if (changed) await logActivity(admin, "SETTINGS", "settings.company", `Changed settings: ${changed}`);
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

// ─── Email ─────────────────────────────────────────────────────────────────

const mailSchema = z.object({
  smtpHost: text(120),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpUser: text(160),
  mailFromName: text(80),
  mailFromAddress: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "The “send from” address isn't an email address.")
    .transform((v) => v || null),
  mailReplyTo: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "The reply-to address isn't an email address.")
    .transform((v) => v || null),
});

/** Saves the mail account. Changing the server, login or sender switches sending off until a test goes through. */
export async function updateMailSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = mailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.smtpHost && !d.mailFromAddress) return { error: "Enter the address emails are sent from." };
  const before = await getSettings();
  const password = String(formData.get("smtpPassword") ?? "");
  const clear = formData.get("clearPassword") === "on";
  const smtpPassword = clear ? null : password ? seal(password) : before.smtpPassword;
  const smtpSecure = d.smtpPort === 465;
  const accountChanged =
    d.smtpHost !== before.smtpHost ||
    d.smtpPort !== before.smtpPort ||
    d.smtpUser !== before.smtpUser ||
    d.mailFromAddress !== before.mailFromAddress ||
    smtpPassword !== before.smtpPassword;
  await db.companySettings.update({
    where: { id: 1 },
    data: {
      ...d,
      smtpSecure,
      smtpPassword,
      mailBccSelf: formData.get("mailBccSelf") === "on",
      ...(accountChanged ? { mailVerifiedAt: null } : {}),
    },
  });
  const changed = changedSettings(before, { ...d, smtpPassword, mailBccSelf: formData.get("mailBccSelf") === "on" });
  if (changed) await logActivity(admin, "SETTINGS", "settings.email", `Changed the email account: ${changed}`);
  revalidatePath("/", "layout");
  if (!d.smtpHost) return { ok: "Saved. Email stays off until a mail server is filled in." };
  return { ok: accountChanged || !before.mailVerifiedAt ? "Saved. Now send a test email to switch sending on." : "Saved." };
}

/** Sends a test to the given address; when it goes through, the app may send emails. */
export async function sendTestEmail(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const to = parseAddresses(String(formData.get("testTo") ?? ""), { required: true });
  if ("error" in to) return { error: to.error };
  const settings = await getSettings();
  if (mailSetup(settings) === "NOT_SET") return { error: "Fill in and save the mail server and the “send from” address first." };
  const result = await sendEmail(
    {
      kind: "TEST",
      to: to.list,
      subject: `Test email from ${settings.companyName} (Edubotics One)`,
      message: `This is a test from Edubotics One, sent by ${user.name}.\n\nIf you can read this, invoices, quotes, payslips, interview invites and payment reminders can now be emailed from the app.`,
    },
    settings,
    user.id,
  );
  if ("error" in result) {
    await db.companySettings.update({ where: { id: 1 }, data: { mailVerifiedAt: null } });
    revalidatePath("/", "layout");
    return { error: result.error };
  }
  await db.companySettings.update({ where: { id: 1 }, data: { mailVerifiedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: `Test email sent to ${to.list.join(", ")}. Check that it arrived (and isn't in spam). Sending is now switched on.` };
}

/** The public careers page: on or off, the welcome text and an email for candidates' questions. */
export async function updateCareersSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      careersIntro: text(1500),
      careersContactEmail: text(120).pipe(z.string().email("Enter a valid contact email, or leave it blank.").nullable()),
    })
    .safeParse({ careersIntro: formData.get("careersIntro") ?? "", careersContactEmail: formData.get("careersContactEmail") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const careersEnabled = formData.get("careersEnabled") === "on";
  const before = await getSettings();
  await db.companySettings.update({ where: { id: 1 }, data: { ...parsed.data, careersEnabled } });
  if (before.careersEnabled !== careersEnabled) {
    await logActivity(admin, "SETTINGS", "settings.careers", `Switched the careers page ${careersEnabled ? "on" : "off"}`);
  }
  revalidatePath("/admin/settings");
  revalidatePath("/recruitment", "layout");
  return {
    ok: careersEnabled
      ? "Saved. The careers page is on: tick “Show on the careers page” on each job you want listed."
      : "Saved. The careers page is off and shows no jobs.",
  };
}

const MAX_SIGNATURE_BYTES = 1024 * 1024;

/** Who signs workshop certificates, and an optional scan of their signature (PNG or JPG). */
export async function updateCertificateSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({ certSignatoryName: text(100), certSignatoryTitle: text(100) })
    .safeParse({ certSignatoryName: formData.get("certSignatoryName") ?? "", certSignatoryTitle: formData.get("certSignatoryTitle") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const file = formData.get("signature");
  let signature: { certSignature: Uint8Array<ArrayBuffer>; certSignatureType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SIGNATURE_BYTES) return { error: "The signature image must be under 1 MB." };
    const data = new Uint8Array(await file.arrayBuffer());
    const type = sniffMime(data);
    if (type !== "image/png" && type !== "image/jpeg") return { error: "Upload the signature as a PNG or JPG picture." };
    signature = { certSignature: data, certSignatureType: type };
  }
  const remove = formData.get("removeSignature") === "on";
  await db.companySettings.update({
    where: { id: 1 },
    data: { ...parsed.data, ...(signature ?? {}), ...(remove && !signature ? { certSignature: null, certSignatureType: null } : {}) },
  });
  await logActivity(admin, "SETTINGS", "settings.signatory", `Changed the certificate and letter signatory${signature ? " and signature picture" : remove ? " (signature picture removed)" : ""}`);
  revalidatePath("/admin/settings");
  return { ok: "Saved. New and reprinted certificates use this." };
}

// ─── Sign-in and safety ────────────────────────────────────────────────────

/** Wrong-password lock and how long a sign-in lasts without use. */
export async function updateSafetySettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      loginMaxAttempts: z.coerce.number().int().min(3, "Allow at least 3 wrong passwords.").max(20, "Lock after at most 20 wrong passwords."),
      loginLockMinutes: z.coerce.number().int().min(1, "Lock for at least a minute.").max(24 * 60, "Lock for at most a day."),
      sessionIdleHours: z.coerce.number().int().min(1, "Sign out after at least an hour.").max(168, "Sign out after at most 168 hours (a week)."),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const before = await getSettings();
  await db.companySettings.update({ where: { id: 1 }, data: parsed.data });
  const changed = changedSettings(before, parsed.data);
  if (changed) await logActivity(admin, "SETTINGS", "settings.safety", `Changed sign-in safety: ${changed}`);
  revalidatePath("/admin/settings");
  return { ok: "Saved." };
}

/** The Google client for "Sign in with Google". It only switches on with everything filled in. */
export async function updateGoogleSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      googleClientId: text(200).refine((v) => !v || /^[\w.-]+\.apps\.googleusercontent\.com$/.test(v), "The client ID ends in .apps.googleusercontent.com."),
      googleDomain: text(100).transform((v) => v?.toLowerCase().replace(/^@/, "") ?? null),
      appAddress: text(200).transform((v) => v?.replace(/\/+$/, "") ?? null),
    })
    .safeParse({
      googleClientId: formData.get("googleClientId") ?? "",
      googleDomain: formData.get("googleDomain") ?? "",
      appAddress: formData.get("appAddress") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.googleDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d.googleDomain)) return { error: "Enter the company domain like eduboticsglobal.com." };
  if (d.appAddress) {
    const problem = appAddressProblem(d.appAddress);
    if (problem) return { error: problem };
  }
  const before = await getSettings();
  const secret = String(formData.get("googleClientSecret") ?? "").trim();
  const googleClientSecret = secret ? seal(secret) : before.googleClientSecret;
  const googleEnabled = formData.get("googleEnabled") === "on";
  if (googleEnabled && (!d.googleClientId || !googleClientSecret || !d.appAddress)) {
    return { error: "Fill in the client ID, client secret and app address before switching Google sign-in on." };
  }
  await db.companySettings.update({ where: { id: 1 }, data: { ...d, googleClientSecret, googleEnabled } });
  const changed = changedSettings(before, { ...d, googleClientSecret, googleEnabled });
  if (changed) await logActivity(admin, "SETTINGS", "settings.google", `Changed Google sign-in: ${changed}`);
  revalidatePath("/admin/settings");
  revalidatePath("/login");
  return {
    ok: googleEnabled
      ? "Saved. Google sign-in is on: try it from the sign-in page in a private window before telling everyone."
      : "Saved. Google sign-in is off; everyone signs in with their password.",
  };
}
