import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { allowApplication, careersSettings, clientAddress, publicJob } from "@/lib/careers";

/**
 * Applications from the public careers page. This is a plain route rather than a server action so
 * that, when the page is put on the internet, only this one address needs to accept form posts
 * (see src/proxy.ts). It answers JSON to the page's script, or redirects when scripts are off.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `keep it under ${max} characters`)
    .transform((v) => (v === "" ? null : v));

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().max(160).email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .refine((v) => (v.match(/\d/g) ?? []).length >= 10 && /^[+\d\s()-]{10,20}$/.test(v), "Enter a phone number with at least 10 digits."),
  city: text(80),
  currentRole: text(160),
  experienceYears: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number({ message: "Experience must be a number of years." }).min(0).max(50).nullable()),
  noticePeriod: text(60),
  referredBy: text(120),
  message: text(2000),
});

type Result = { ok: true } | { error: string };

function respond(request: Request, jobId: string, result: Result, status = 200) {
  if (request.headers.get("accept")?.includes("application/json")) return Response.json(result, { status });
  const url = new URL(request.url);
  url.pathname = "ok" in result ? "/careers/thanks" : `/careers/${jobId}`;
  url.search = "ok" in result ? "" : `?error=${encodeURIComponent(result.error)}`;
  url.hash = "ok" in result ? "" : "apply";
  return Response.redirect(url, 303);
}

export async function POST(request: Request, { params }: RouteContext<"/careers/[id]/apply">) {
  const { id } = await params;
  const settings = await careersSettings();
  const job = settings.enabled ? await publicJob(id) : null;
  if (!job) return respond(request, id, { error: "This job is no longer taking applications." }, 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(request, id, { error: "The form could not be read. Please try again." }, 400);
  }
  // A hidden field people never see; bots that fill every box get a polite "thanks" and nothing is saved.
  if (String(form.get("website") ?? "") !== "") return respond(request, id, { ok: true });

  const fields = Object.fromEntries(
    ["name", "email", "phone", "city", "currentRole", "experienceYears", "noticePeriod", "referredBy", "message"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return respond(request, id, { error: parsed.error.issues[0].message }, 400);
  if (form.get("consent") !== "on") {
    return respond(request, id, { error: "Please tick the box to let us keep your details for hiring." }, 400);
  }

  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return respond(request, id, { error: "Attach your resume." }, 400);
  if (file.size > MAX_DOCUMENT_BYTES) return respond(request, id, { error: "Your resume can be up to 5 MB." }, 400);
  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(data);
  if (!mimeType) return respond(request, id, { error: "Attach your resume as a PDF, or a JPG or PNG photo. Save Word files as PDF first." }, 400);
  const resume = { kind: "Resume", fileName: file.name.slice(0, 200) || "resume.pdf", mimeType, size: file.size, data };

  // Counted only once an application is complete, so someone fixing a typo isn't locked out.
  if (!allowApplication(clientAddress(request.headers))) {
    return respond(request, id, { error: "Too many applications from this connection. Please try again in an hour." }, 429);
  }

  const { message, ...details } = parsed.data;
  const now = new Date();
  const stamp = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  // Someone applying twice for the same job updates their existing entry instead of making a second one.
  const existing = await db.candidate.findFirst({
    where: { jobId: job.id, OR: [{ email: details.email }, { phone: details.phone }] },
    select: { id: true, notes: true },
  });
  if (existing) {
    const note = [`Applied again on the careers page on ${stamp}.`, message].filter(Boolean).join("\n");
    await db.candidate.update({
      where: { id: existing.id },
      data: {
        notes: [existing.notes, note].filter(Boolean).join("\n\n"),
        appliedOnlineAt: now,
        files: { create: resume },
      },
    });
  } else {
    await db.candidate.create({
      data: {
        jobId: job.id,
        ...details,
        source: "Careers page",
        notes: message ? `Their message: ${message}` : null,
        appliedOnlineAt: now,
        files: { create: resume },
      },
    });
  }
  revalidatePath("/recruitment", "layout");
  return respond(request, id, { ok: true });
}
