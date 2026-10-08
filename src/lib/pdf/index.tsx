import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "../db";
import { certificateSignature, getSettings } from "../settings";
import { formatDate } from "../format";
import { monthLabel, payslipParts } from "../payroll";
import { CATEGORY_LABEL, payableOf } from "../expenses";
import { creditNoteNotes } from "../credit-notes";
import type { Attachment } from "../mail";
import { BillingPdf } from "./billing";
import { PayslipPdf } from "./payslip";
import { CertificatePdf, type CertificateFacts } from "./certificate";
import { certificateWording } from "../workshops";
import { fileSafe } from "./layout";

// PDF copies of invoices, quotes, payslips and certificates: attached to emails and offered as downloads.

const QUOTE_WATERMARK: Record<string, string> = { DRAFT: "draft", DECLINED: "declined", REVISED: "replaced" };

export async function invoicePdf(id: string): Promise<Attachment | null> {
  const [invoice, settings] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getSettings(),
  ]);
  if (!invoice) return null;
  const title = settings.gstEnabled && settings.gstin ? "Tax invoice" : "Invoice";
  const content = await renderToBuffer(
    <BillingPdf
      doc={invoice}
      lines={invoice.lines}
      settings={settings}
      title={title}
      partyLabel="Bill to"
      watermark={invoice.status !== "ISSUED" ? invoice.status.toLowerCase() : null}
      meta={[
        ["Invoice no.", invoice.number ?? "Given when issued"],
        ["Date", formatDate(invoice.issueDate)],
        ["Due by", formatDate(invoice.dueDate)],
      ]}
      paymentDetails
      footer="This is a computer-generated invoice."
    />,
  );
  return { filename: `Invoice ${fileSafe(invoice.number ?? "draft")}.pdf`, content, contentType: "application/pdf" };
}

export async function creditNotePdf(id: string): Promise<Attachment | null> {
  const [note, settings] = await Promise.all([
    db.creditNote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, invoice: true } }),
    getSettings(),
  ]);
  if (!note) return null;
  const content = await renderToBuffer(
    <BillingPdf
      doc={{ ...note.invoice, ...note, notes: creditNoteNotes(note) }}
      lines={note.lines}
      settings={settings}
      title="Credit note"
      partyLabel="Issued to"
      watermark={note.status === "CANCELLED" ? "cancelled" : null}
      meta={[
        ["Credit note no.", note.number],
        ["Date", formatDate(note.issueDate)],
        ["Against invoice", note.invoice.number ?? ""],
        ["Invoice date", formatDate(note.invoice.issueDate)],
      ]}
      paymentDetails={false}
      footer="This is a computer-generated credit note."
    />,
  );
  return { filename: `Credit note ${fileSafe(note.number)}.pdf`, content, contentType: "application/pdf" };
}

export async function quotePdf(id: string): Promise<Attachment | null> {
  const [quote, settings] = await Promise.all([
    db.quote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getSettings(),
  ]);
  if (!quote) return null;
  const content = await renderToBuffer(
    <BillingPdf
      doc={quote}
      lines={quote.lines}
      settings={settings}
      title="Quotation"
      partyLabel="Quote for"
      watermark={QUOTE_WATERMARK[quote.status] ?? null}
      meta={[
        ["Quote no.", quote.number ?? "Given when sent"],
        ["Date", formatDate(quote.quoteDate)],
        ["Valid until", formatDate(quote.validUntil)],
      ]}
      paymentDetails={false}
      terms={quote.terms}
      footer="Prices are in Indian rupees. GST is charged at the rate in force on the invoice date."
    />,
  );
  return { filename: `Quotation ${fileSafe(quote.number ?? "draft")}.pdf`, content, contentType: "application/pdf" };
}

export async function payslipPdf(id: string): Promise<Attachment | null> {
  const [p, settings] = await Promise.all([
    db.payslip.findUnique({
      where: { id },
      include: { run: true, employee: { include: { department: true } }, expenseClaims: { orderBy: { date: "asc" } } },
    }),
    getSettings(),
  ]);
  if (!p) return null;
  const { earnings, deductions } = payslipParts(p);
  const month = monthLabel(p.run.month);
  const name = `${p.employee.firstName} ${p.employee.lastName}`.trim();
  const content = await renderToBuffer(
    <PayslipPdf
      settings={settings}
      p={{
        monthLabel: month,
        name,
        code: p.employee.code,
        designation: p.employee.designation,
        department: p.employee.department?.name ?? null,
        daysInMonth: p.daysInMonth,
        paidDays: p.paidDays,
        lopDays: p.lopDays,
        paidOn: p.run.paidOn,
        earnings,
        deductions,
        gross: p.gross,
        totalDeductions: p.totalDeductions,
        claims: p.expenseClaims.map((c) => [`${formatDate(c.date)} · ${CATEGORY_LABEL[c.category]} · ${c.description}`, payableOf(c)]),
        reimbursements: p.reimbursements,
        net: p.net,
        note: p.note,
      }}
    />,
  );
  return { filename: `Payslip ${month} ${fileSafe(name)}.pdf`, content, contentType: "application/pdf" };
}

const certificateInclude = {
  registration: {
    include: {
      workshop: {
        include: {
          organization: { select: { name: true } },
          trainers: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" as const } },
        },
      },
    },
  },
} as const;

async function certificateFacts(where: { id: string } | { workshopId: string }): Promise<CertificateFacts[]> {
  const [certs, settings] = await Promise.all([
    db.workshopCertificate.findMany({
      where: "id" in where ? { id: where.id } : { registration: { workshopId: where.workshopId }, status: "ISSUED" },
      include: certificateInclude,
      orderBy: { registration: { name: "asc" } },
    }),
    getSettings(),
  ]);
  return certs.map((c) => {
    const w = c.registration.workshop;
    return {
      number: c.number,
      issuedOn: c.issuedOn,
      cancelled: c.status === "CANCELLED",
      name: c.registration.name,
      institution: c.registration.institution,
      title: w.certificateTitle,
      wording: certificateWording(w, w.organization?.name ?? null, settings.companyName),
      trainer: w.trainers[0]?.user.name ?? null,
    };
  });
}

/** One participant's certificate. */
export async function certificatePdf(id: string): Promise<Attachment | null> {
  const [facts, settings, signature] = await Promise.all([certificateFacts({ id }), getSettings(), certificateSignature()]);
  if (facts.length === 0) return null;
  const content = await renderToBuffer(<CertificatePdf certificates={facts} settings={settings} signatureImage={signature} />);
  return { filename: `Certificate ${fileSafe(facts[0].name)} ${fileSafe(facts[0].number)}.pdf`, content, contentType: "application/pdf" };
}

/** Every issued certificate of a workshop in one file, one page each, for printing. */
export async function workshopCertificatesPdf(workshopId: string, title: string): Promise<Attachment | null> {
  const [facts, settings, signature] = await Promise.all([certificateFacts({ workshopId }), getSettings(), certificateSignature()]);
  if (facts.length === 0) return null;
  const content = await renderToBuffer(<CertificatePdf certificates={facts} settings={settings} signatureImage={signature} />);
  return { filename: `Certificates ${fileSafe(title)}.pdf`, content, contentType: "application/pdf" };
}

/** Serves a PDF in the browser, for the "Download PDF" buttons. */
export function pdfResponse(file: Attachment, download = false) {
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
