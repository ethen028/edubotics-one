-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('TEST', 'INVOICE', 'PAYMENT_REMINDER', 'QUOTE', 'PAYSLIP', 'INTERVIEW_INVITE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "mailBccSelf" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mailFromAddress" TEXT,
ADD COLUMN     "mailFromName" TEXT,
ADD COLUMN     "mailReplyTo" TEXT,
ADD COLUMN     "mailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER NOT NULL DEFAULT 587,
ADD COLUMN     "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smtpUser" TEXT;

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "attachments" TEXT[],
    "error" TEXT,
    "quoteId" TEXT,
    "payslipId" TEXT,
    "interviewId" TEXT,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EmailLogToInvoice" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmailLogToInvoice_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "EmailLog_kind_createdAt_idx" ON "EmailLog"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_quoteId_idx" ON "EmailLog"("quoteId");

-- CreateIndex
CREATE INDEX "EmailLog_payslipId_idx" ON "EmailLog"("payslipId");

-- CreateIndex
CREATE INDEX "EmailLog_interviewId_idx" ON "EmailLog"("interviewId");

-- CreateIndex
CREATE INDEX "_EmailLogToInvoice_B_index" ON "_EmailLogToInvoice"("B");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmailLogToInvoice" ADD CONSTRAINT "_EmailLogToInvoice_A_fkey" FOREIGN KEY ("A") REFERENCES "EmailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EmailLogToInvoice" ADD CONSTRAINT "_EmailLogToInvoice_B_fkey" FOREIGN KEY ("B") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
