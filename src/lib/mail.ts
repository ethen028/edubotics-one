import "server-only";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { EmailKind } from "@prisma/client";
import { db } from "./db";
import type { Settings } from "./settings";
import { unseal } from "./secret-box";

/** NOT_SET: no mail account yet. UNTESTED: filled in but no test email has gone through. READY: emails can go out. */
export type MailSetup = "NOT_SET" | "UNTESTED" | "READY";

export function mailSetup(s: Settings): MailSetup {
  if (!s.smtpHost || !s.mailFromAddress) return "NOT_SET";
  return s.mailVerifiedAt ? "READY" : "UNTESTED";
}

export const MAIL_NOT_READY: Record<Exclude<MailSetup, "READY">, string> = {
  NOT_SET: "Email isn't set up yet. An admin can add the company mail account under Admin → Settings → Email.",
  UNTESTED: "The mail account in Admin → Settings → Email hasn't passed a test email yet, so nothing is sent.",
};

const MAX_RECIPIENTS = 10;
const address = z.email();

/** Comma- or space-separated addresses → a clean list, or an error naming the address that's wrong. */
export function parseAddresses(value: string | null | undefined, { required }: { required: boolean }): { list: string[] } | { error: string } {
  const list = (value ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (required && list.length === 0) return { error: "Enter at least one email address to send to." };
  if (list.length > MAX_RECIPIENTS) return { error: `Send to at most ${MAX_RECIPIENTS} addresses at a time.` };
  const bad = list.find((a) => !address.safeParse(a).success);
  if (bad) return { error: `“${bad}” isn't an email address.` };
  return { list: [...new Set(list.map((a) => a.toLowerCase()))] };
}

function transport(s: Settings) {
  const password = unseal(s.smtpPassword);
  return nodemailer.createTransport({
    host: s.smtpHost!,
    port: s.smtpPort,
    secure: s.smtpSecure,
    requireTLS: !s.smtpSecure && s.smtpPort === 587,
    auth: s.smtpUser ? { user: s.smtpUser, pass: password ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

/** Mail server errors in words an office can act on. */
function explain(e: unknown, s: Settings) {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.code === "EAUTH" || err.responseCode === 535)
    return "The mail server turned down the username or password. For Gmail or Google Workspace, use an app password, not the normal one.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND", "ECONNREFUSED"].includes(err.code ?? ""))
    return `Couldn't reach the mail server ${s.smtpHost}:${s.smtpPort}. Check the server name and port, and that this computer is online.`;
  if (err.responseCode === 550 || err.responseCode === 553)
    return `The mail server refused the address: ${err.message ?? "unknown reason"}`;
  return err.message ?? String(e);
}

export type Attachment = { filename: string; content: Buffer; contentType: string };

export type OutgoingEmail = {
  kind: EmailKind;
  to: string[];
  cc?: string[];
  subject: string;
  message: string; // plain text the person typed or kept from the template
  attachments?: Attachment[];
  links?: { invoiceIds?: string[]; quoteId?: string; payslipId?: string; interviewId?: string; creditNoteId?: string };
};

/**
 * Sends one email from the company account and records it, sent or failed, in the email history.
 * Only a test email may go out before the account has passed a test.
 */
export async function sendEmail(email: OutgoingEmail, settings: Settings, userId: string): Promise<{ ok: true } | { error: string }> {
  const setup = mailSetup(settings);
  if (setup === "NOT_SET") return { error: MAIL_NOT_READY.NOT_SET };
  if (setup === "UNTESTED" && email.kind !== "TEST") return { error: MAIL_NOT_READY.UNTESTED };

  const from = { name: settings.mailFromName || settings.companyName, address: settings.mailFromAddress! };
  let error: string | null = null;
  try {
    await transport(settings).sendMail({
      from,
      to: email.to,
      cc: email.cc?.length ? email.cc : undefined,
      bcc: settings.mailBccSelf && email.kind !== "TEST" ? from.address : undefined,
      replyTo: settings.mailReplyTo || undefined,
      subject: email.subject,
      text: plainBody(email.message, settings),
      html: htmlBody(email.message, settings),
      attachments: email.attachments,
    });
  } catch (e) {
    error = explain(e, settings);
  }

  await db.emailLog.create({
    data: {
      kind: email.kind,
      status: error ? "FAILED" : "SENT",
      to: email.to.join(", "),
      cc: email.cc?.length ? email.cc.join(", ") : null,
      subject: email.subject,
      attachments: (email.attachments ?? []).map((a) => a.filename),
      error,
      sentById: userId,
      quoteId: email.links?.quoteId,
      payslipId: email.links?.payslipId,
      interviewId: email.links?.interviewId,
      creditNoteId: email.links?.creditNoteId,
      invoices: email.links?.invoiceIds?.length ? { connect: email.links.invoiceIds.map((id) => ({ id })) } : undefined,
    },
  });
  return error ? { error } : { ok: true };
}

function footerLines(s: Settings) {
  return [s.companyName, s.companyAddress.replace(/\s*\n\s*/g, ", "), [s.companyPhone, s.companyEmail].filter(Boolean).join(" · ")].filter(
    Boolean,
  );
}

function plainBody(message: string, s: Settings) {
  return `${message.trim()}\n\n--\n${footerLines(s).join("\n")}\n`;
}

const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The typed message in a simple branded frame that reads well in Gmail and on phones. */
function htmlBody(message: string, s: Settings) {
  const paragraphs = message
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe4e2">
<tr><td style="background:#0f3d3e;padding:16px 24px;font:600 17px Arial,Helvetica,sans-serif;color:#ffffff">${escape(s.companyName)}</td></tr>
<tr><td style="padding:24px;font:15px/1.55 Arial,Helvetica,sans-serif;color:#1e293b">${paragraphs}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#64748b">${footerLines(s)
    .map(escape)
    .join("<br>")}</td></tr>
</table></td></tr></table></body></html>`;
}
