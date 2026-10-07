import Link from "next/link";
import type { EmailLog } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "./action-form";
import { Badge, Field } from "./ui";
import { formatDateTime } from "@/lib/format";
import type { MailSetup } from "@/lib/mail";

type Draft = { to: string; cc?: string; subject: string; message: string };

/** Why emails can't go out yet, with a way to fix it for admins. */
export function MailNotReady({ setup, admin }: { setup: Exclude<MailSetup, "READY">; admin: boolean }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {setup === "NOT_SET" ? "Email isn't set up yet." : "The mail account hasn't passed a test email yet."}{" "}
      {admin ? (
        <Link href="/admin/settings#email" className="link">
          Set it up in Settings
        </Link>
      ) : (
        "Ask an admin to set it up in Settings."
      )}
    </p>
  );
}

/**
 * A ready-to-send email: who to, subject and message filled in from the template, all editable.
 * The attachment is made fresh when Send is pressed.
 */
export function EmailComposer({
  title,
  action,
  draft,
  attachments,
  setup,
  admin,
  submitLabel = "Send email",
  hint,
  open = false,
  hidden,
  className = "card",
}: {
  title: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  draft: Draft;
  attachments: string[];
  setup: MailSetup;
  admin: boolean;
  submitLabel?: string;
  hint?: string;
  open?: boolean;
  hidden?: Record<string, string>;
  className?: string;
}) {
  return (
    <details className={`group ${className}`} open={open}>
      <summary className="cursor-pointer list-none font-semibold">
        <span className="mr-1 inline-block text-brand-600 transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="mt-3">
        {setup !== "READY" ? (
          <MailNotReady setup={setup} admin={admin} />
        ) : (
          <ActionForm action={action} className="space-y-3">
            {Object.entries(hidden ?? {}).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Field label="To">
              <input name="to" defaultValue={draft.to} className="input" placeholder="name@school.edu.in" />
            </Field>
            <Field label="Copy to (optional)">
              <input name="cc" defaultValue={draft.cc ?? ""} className="input" placeholder="Separate several with commas" />
            </Field>
            <Field label="Subject">
              <input name="subject" required maxLength={200} defaultValue={draft.subject} className="input" />
            </Field>
            <Field label="Message">
              <textarea name="message" required rows={12} maxLength={5000} defaultValue={draft.message} className="input text-sm" />
            </Field>
            {attachments.length > 0 && (
              <p className="text-xs text-slate-500">
                Attached: {attachments.join(", ")}
              </p>
            )}
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
            <SubmitButton pendingLabel="Sending…">{submitLabel}</SubmitButton>
          </ActionForm>
        )}
      </div>
    </details>
  );
}

type LogRow = Pick<EmailLog, "id" | "kind" | "status" | "to" | "cc" | "subject" | "error" | "createdAt" | "attachments"> & {
  sentBy: { name: string };
};

const KIND: Record<EmailLog["kind"], string> = {
  TEST: "Test",
  INVOICE: "Invoice",
  PAYMENT_REMINDER: "Reminder",
  QUOTE: "Quote",
  PAYSLIP: "Payslip",
  INTERVIEW_INVITE: "Invite",
};

/** What was emailed, to whom and by whom; failures show the mail server's reason. */
export function EmailHistory({ emails, title = "Emails", showKind = false }: { emails: LogRow[]; title?: string; showKind?: boolean }) {
  if (emails.length === 0) return null;
  return (
    <section className="card p-0">
      <h2 className="px-5 pt-4 pb-2 font-semibold">{title}</h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {emails.map((e) => (
          <li key={e.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {e.status === "SENT" ? <Badge color="green">Sent</Badge> : <Badge color="red">Failed</Badge>}
              {showKind && <Badge>{KIND[e.kind]}</Badge>}
              <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
            </div>
            <div className="mt-1 break-all">To {e.to}{e.cc && <span className="text-slate-500">, copy to {e.cc}</span>}</div>
            <div className="text-xs text-slate-500">
              {e.subject} · by {e.sentBy.name}
            </div>
            {e.error && <div className="mt-1 text-xs text-red-700">{e.error}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const emailLogSelect = {
  id: true,
  kind: true,
  status: true,
  to: true,
  cc: true,
  subject: true,
  error: true,
  createdAt: true,
  attachments: true,
  sentBy: { select: { name: true } },
} as const;
