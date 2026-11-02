-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "esiNumber" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "uan" TEXT;

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "applicantRetentionMonths" INTEGER NOT NULL DEFAULT 12;
