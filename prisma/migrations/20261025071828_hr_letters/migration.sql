-- CreateEnum
CREATE TYPE "LetterKind" AS ENUM ('OFFER', 'APPOINTMENT', 'CONFIRMATION', 'REVISION', 'EXPERIENCE', 'EMPLOYMENT', 'SALARY_CERTIFICATE', 'NOC', 'WARNING', 'SHOW_CAUSE', 'INTERNSHIP', 'TRAINING', 'RELIEVING', 'ID_CARD', 'ANNUAL_STATEMENT');

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('ISSUED', 'REPLACED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'HR_LETTER';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "companyRegNo" TEXT,
ADD COLUMN     "companyWebsite" TEXT DEFAULT 'www.eduboticsglobal.com',
ADD COLUMN     "letterSignatoryName" TEXT,
ADD COLUMN     "letterSignatoryTitle" TEXT,
ADD COLUMN     "letterSignature" BYTEA,
ADD COLUMN     "letterSignatureType" TEXT,
ADD COLUMN     "probationMonths" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "probationNoticeDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "letterId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ALTER COLUMN "probationMonths" SET DEFAULT 3;

-- CreateTable
CREATE TABLE "HrLetter" (
    "id" TEXT NOT NULL,
    "kind" "LetterKind" NOT NULL,
    "employeeId" TEXT,
    "offerId" TEXT,
    "sourceId" TEXT,
    "fy" TEXT,
    "seq" INTEGER,
    "number" TEXT,
    "issuedOn" DATE NOT NULL,
    "recipient" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "status" "LetterStatus" NOT NULL DEFAULT 'ISSUED',
    "replacedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" TEXT,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrLetter_number_key" ON "HrLetter"("number");

-- CreateIndex
CREATE UNIQUE INDEX "HrLetter_replacedById_key" ON "HrLetter"("replacedById");

-- CreateIndex
CREATE INDEX "HrLetter_employeeId_issuedOn_idx" ON "HrLetter"("employeeId", "issuedOn");

-- CreateIndex
CREATE INDEX "HrLetter_offerId_idx" ON "HrLetter"("offerId");

-- CreateIndex
CREATE INDEX "HrLetter_kind_sourceId_idx" ON "HrLetter"("kind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "HrLetter_fy_seq_key" ON "HrLetter"("fy", "seq");

-- CreateIndex
CREATE INDEX "EmailLog_letterId_idx" ON "EmailLog"("letterId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "HrLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "HrLetter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Private by default, like every other table.
ALTER TABLE "HrLetter" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "HrLetter" FROM PUBLIC;
