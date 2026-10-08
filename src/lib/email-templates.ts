/** Starting subject and message for each email. People can change both before sending. No database access here. */
import type { Settings } from "./settings";
import { formatDate } from "./format";
import { formatMoney } from "./invoices";

export type Draft = { subject: string; message: string };

const greeting = (name: string | null | undefined) => (name ? `Dear ${name},` : "Dear Sir/Madam,");

function signOff(sender: string, s: Settings) {
  return `Thank you,\n${sender}\n${s.companyName}`;
}

/** Where to pay, from Admin → Settings → Invoices. Empty when nothing is filled in. */
function payTo(s: Settings) {
  const bank = [
    s.bankAccountName && `Account name: ${s.bankAccountName}`,
    s.bankName && `Bank: ${s.bankName}`,
    s.bankAccountNo && `Account no.: ${s.bankAccountNo}`,
    s.bankIfsc && `IFSC: ${s.bankIfsc}`,
    s.upiId && `UPI: ${s.upiId}`,
  ].filter(Boolean);
  return bank.length ? `You can pay by bank transfer or UPI:\n${bank.join("\n")}` : "";
}

const paragraphs = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n\n");

type InvoiceFacts = { number: string; issueDate: Date; dueDate: Date; total: unknown; balance: number; daysLate: number };

export function invoiceEmail(inv: InvoiceFacts, contact: string | null, sender: string, s: Settings): Draft {
  return {
    subject: `Invoice ${inv.number} from ${s.companyName}`,
    message: paragraphs(
      greeting(contact),
      `Please find attached our invoice ${inv.number} dated ${formatDate(inv.issueDate)} for ${formatMoney(Number(inv.total))}, due by ${formatDate(inv.dueDate)}.`,
      payTo(s),
      "Please quote the invoice number when you pay, and reply to this email if you have any questions.",
      signOff(sender, s),
    ),
  };
}

/** A gentle reminder for one or more unpaid invoices from the same school. */
export function reminderEmail(invoices: InvoiceFacts[], contact: string | null, sender: string, s: Settings): Draft {
  const total = invoices.reduce((n, i) => n + i.balance, 0);
  const one = invoices.length === 1 ? invoices[0] : null;
  const line = (i: InvoiceFacts) =>
    `${i.number} dated ${formatDate(i.issueDate)}: ${formatMoney(i.balance)} due ${formatDate(i.dueDate)}${i.daysLate > 0 ? ` (${i.daysLate} days ago)` : ""}`;
  return {
    subject: one ? `Payment reminder: invoice ${one.number}` : `Payment reminder: ${invoices.length} invoices from ${s.companyName}`,
    message: paragraphs(
      greeting(contact),
      one
        ? `This is a friendly reminder that ${formatMoney(one.balance)} is still due on our invoice ${one.number} dated ${formatDate(one.issueDate)}${
            one.daysLate > 0 ? `, which was due on ${formatDate(one.dueDate)}` : `, due by ${formatDate(one.dueDate)}`
          }. A copy is attached.`
        : `This is a friendly reminder that ${formatMoney(total)} is still due on these invoices. Copies are attached.\n\n${invoices.map(line).join("\n")}`,
      payTo(s),
      "If you have already paid, please reply with the payment reference (UTR or cheque number) so we can match it.",
      signOff(sender, s),
    ),
  };
}

type QuoteFacts = { number: string; quoteDate: Date; validUntil: Date; subtotal: unknown; total: unknown; cgst: unknown; sgst: unknown; igst: unknown };

export function quoteEmail(q: QuoteFacts, dealTitle: string | null, contact: string | null, sender: string, s: Settings): Draft {
  const tax = Number(q.cgst) + Number(q.sgst) + Number(q.igst);
  return {
    subject: `Quotation ${q.number} from ${s.companyName}${dealTitle ? `: ${dealTitle}` : ""}`,
    message: paragraphs(
      greeting(contact),
      `Thank you for your interest. Please find attached our quotation ${q.number}${dealTitle ? ` for ${dealTitle}` : ""}.`,
      tax > 0
        ? `The amount is ${formatMoney(Number(q.subtotal))} plus GST, ${formatMoney(Number(q.total))} in all, and the quote is valid until ${formatDate(q.validUntil)}.`
        : `The amount is ${formatMoney(Number(q.total))}, and the quote is valid until ${formatDate(q.validUntil)}.`,
      "We would be glad to walk you through it or adjust it to suit your school. Just reply to this email to confirm or ask questions.",
      signOff(sender, s),
    ),
  };
}

type PayslipFacts = { firstName: string; monthLabel: string; net: unknown; paidOn: Date | null };

export function payslipEmail(p: PayslipFacts, s: Settings): Draft {
  return {
    subject: `Your payslip for ${p.monthLabel}`,
    message: paragraphs(
      `Dear ${p.firstName},`,
      `Your payslip for ${p.monthLabel} is attached. Net pay: ${formatMoney(Number(p.net))}${p.paidOn ? `, paid on ${formatDate(p.paidOn)}` : ""}.`,
      "You can see all your payslips in Edubotics One under Payroll → My payslips. If anything looks wrong, reply to this email.",
      `Regards,\n${s.companyName}`,
    ),
  };
}

type InterviewFacts = { round: string; when: string; mode: string; location: string | null; interviewer: string; jobTitle: string };

export function interviewEmail(i: InterviewFacts, candidate: string, sender: string, s: Settings): Draft {
  const whereLabel = i.mode === "Video call" ? "Link" : i.mode === "Phone" ? "Number" : "Where";
  return {
    subject: `Interview for ${i.jobTitle} at ${s.companyName}: ${i.when}`,
    message: paragraphs(
      `Dear ${candidate},`,
      `Thank you for applying for the ${i.jobTitle} role at ${s.companyName}. We would like to invite you to a ${i.round.toLowerCase()} interview.`,
      [`When: ${i.when} (India time)`, `How: ${i.mode}`, i.location && `${whereLabel}: ${i.location}`, `With: ${i.interviewer}`]
        .filter(Boolean)
        .join("\n"),
      "A calendar invite is attached. Please reply to confirm, or suggest another time if this one doesn't suit you.",
      signOff(sender, s),
    ),
  };
}

/** "Thu, 15 Oct 2026, 10:30 am" in India time. */
export function interviewTime(d: Date) {
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-IN", { ...o, timeZone: "Asia/Kolkata" });
  return `${part({ weekday: "short" })}, ${part({ day: "numeric", month: "short", year: "numeric" })}, ${part({ hour: "numeric", minute: "2-digit" })}`;
}
