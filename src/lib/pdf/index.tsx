import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "../db";
import { certificateSignature, getSettings, letterSignature } from "../settings";
import { formatDate } from "../format";
import { monthLabel, payslipParts } from "../payroll";
import { CATEGORY_LABEL, payableOf } from "../expenses";
import { creditNoteNotes } from "../credit-notes";
import type { Attachment } from "../mail";
import { BillingPdf } from "./billing";
import { PayslipPdf } from "./payslip";
import { CertificatePdf, type CertificateFacts } from "./certificate";
import { certificateWording, dateSpan, receiptTax } from "../workshops";
import { formatMoney, methodLabel } from "../invoices";
import { fileSafe } from "./layout";
import { IdCardPdf, LetterPdf } from "./letter";
import { draftRelievingBody, idPhoto } from "../letters";
import { LETTER_KINDS, type LetterBody } from "../letter-rules";

// PDF copies of invoices, quotes, payslips, certificates and HR letters: attached to emails and offered as downloads.

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
  const { earnings, deductions, companyPays } = payslipParts(p);
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
        companyPays,
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

/** A workshop fee receipt. With GST on, it is also the tax invoice for the fee, the GST worked out from inside the amount paid. */
export async function receiptPdf(id: string): Promise<Attachment | null> {
  const [p, settings] = await Promise.all([
    db.workshopPayment.findUnique({
      where: { id },
      include: { registration: { include: { workshop: true, payments: { where: { cancelledAt: null }, select: { id: true, amount: true, paidOn: true, seq: true, fy: true } } } } },
    }),
    getSettings(),
  ]);
  if (!p) return null;
  const r = p.registration;
  const w = r.workshop;
  const tax = receiptTax(p.amount, p.gstRate, p.placeOfSupply !== settings.companyState);
  const rate = Number(p.gstRate);
  // What had been paid up to and including this receipt, so a reprint later still reads as it did on the day.
  const upTo = r.payments.filter((x) => x.paidOn < p.paidOn || (x.paidOn.getTime() === p.paidOn.getTime() && (x.fy < p.fy || (x.fy === p.fy && x.seq <= p.seq))));
  const paid = upTo.reduce((sum, x) => sum + Number(x.amount), 0);
  const balance = Math.max(0, Math.round((Number(r.fee) - paid) * 100) / 100);
  const notes = [
    `Received on ${formatDate(p.paidOn)}${p.method === "OTHER" ? "" : ` by ${p.method === "UPI" ? "UPI" : methodLabel[p.method].toLowerCase()}`}${p.reference ? `, reference ${p.reference}` : ""}.`,
    p.cancelledAt ? null : `Fee ${formatMoney(r.fee)}, paid so far ${formatMoney(paid)}${balance > 0 ? `, balance due ${formatMoney(balance)}` : ", paid in full"}.`,
    p.cancelledAt ? `This receipt was cancelled: ${p.cancelReason?.replace(/\.$/, "")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const content = await renderToBuffer(
    <BillingPdf
      doc={{
        placeOfSupply: p.placeOfSupply,
        billToName: r.name,
        billToAddress: [r.institution, r.detail, r.email ?? r.phone].filter(Boolean).join("\n") || null,
        billToGstin: null,
        notes,
        ...tax,
      }}
      lines={[
        {
          id: p.id,
          description: `Fee for the workshop “${w.title}”, ${dateSpan(w)}`,
          sac: settings.defaultSac,
          quantity: 1,
          unitPrice: tax.subtotal,
          gstRate: rate,
          amount: tax.subtotal,
        },
      ]}
      settings={settings}
      title={rate > 0 && settings.gstin ? "Tax invoice cum receipt" : "Receipt"}
      partyLabel="Received from"
      watermark={p.cancelledAt ? "cancelled" : null}
      meta={[
        ["Receipt no.", p.number],
        ["Date", formatDate(p.paidOn)],
      ]}
      paymentDetails={false}
      footer={rate > 0 ? "Amount paid includes GST. This is a computer-generated receipt." : "This is a computer-generated receipt."}
    />,
  );
  return { filename: `Receipt ${fileSafe(p.number)}.pdf`, content, contentType: "application/pdf" };
}

/** Relieving and experience letter while someone is on notice: worked out fresh and marked draft. Once they have left it is issued as an HR letter. */
export async function draftExitLetterPdf(exitId: string): Promise<Attachment | null> {
  const [exit, body, settings, signature] = await Promise.all([
    db.employeeExit.findUnique({ where: { id: exitId }, select: { stage: true, employee: { select: { firstName: true, lastName: true } } } }),
    draftRelievingBody(exitId),
    getSettings(),
    letterSignature(),
  ]);
  if (!body || exit?.stage !== "ON_NOTICE") return null;
  const content = await renderToBuffer(<LetterPdf body={body} number={null} issuedOn={new Date()} settings={settings} signatureImage={signature} watermark="draft" />);
  return { filename: `Relieving letter ${fileSafe(`${exit.employee.firstName} ${exit.employee.lastName}`.trim())} draft.pdf`, content, contentType: "application/pdf" };
}

const WATERMARK: Record<string, string | null> = { ISSUED: null, REPLACED: "replaced", CANCELLED: "cancelled" };

/** Any issued HR letter, offer letter or ID card, from the wording saved when it was issued. */
export async function letterPdf(id: string): Promise<Attachment | null> {
  const [letter, settings, signature] = await Promise.all([db.hrLetter.findUnique({ where: { id } }), getSettings(), letterSignature()]);
  if (!letter) return null;
  const body = letter.body as unknown as LetterBody;
  const watermark = WATERMARK[letter.status];
  const content = await renderToBuffer(
    letter.kind === "ID_CARD" ? (
      <IdCardPdf body={body} settings={settings} photo={letter.employeeId ? await idPhoto(letter.employeeId) : null} signatureImage={signature} watermark={watermark} />
    ) : (
      <LetterPdf body={body} number={letter.number} issuedOn={letter.issuedOn} settings={settings} signatureImage={signature} watermark={watermark} />
    ),
  );
  return { filename: `${LETTER_KINDS[letter.kind].label} ${fileSafe(letter.recipient)}${letter.number ? ` ${fileSafe(letter.number)}` : ""}.pdf`, content, contentType: "application/pdf" };
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
