-- ESI rates, Kerala professional tax slabs and gratuity as editable settings. All switches stay off.
-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "esiEmployeeRate" DECIMAL(5,2) NOT NULL DEFAULT 0.75,
ADD COLUMN     "esiEmployerRate" DECIMAL(5,2) NOT NULL DEFAULT 3.25,
ADD COLUMN     "esiWageLimit" INTEGER NOT NULL DEFAULT 21000,
ADD COLUMN     "gratuityCap" INTEGER NOT NULL DEFAULT 2000000,
ADD COLUMN     "gratuityDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "gratuityDivisor" INTEGER NOT NULL DEFAULT 26,
ADD COLUMN     "gratuityEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gratuityMinYears" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "ptFirstHalfMonth" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "ptMinDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "ptSecondHalfMonth" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "ptSlabs" JSONB NOT NULL DEFAULT '[{"from":12000,"tax":120},{"from":18000,"tax":180},{"from":30000,"tax":300},{"from":45000,"tax":450},{"from":60000,"tax":600},{"from":75000,"tax":750},{"from":100000,"tax":1000},{"from":125000,"tax":1250}]';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "esiEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gratuityProvision" DECIMAL(12,2) NOT NULL DEFAULT 0;
