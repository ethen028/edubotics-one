-- CreateEnum
CREATE TYPE "WorkshopStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkshopAudience" AS ENUM ('COLLEGE', 'PROFESSIONAL', 'SCHOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkshopMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "WorkshopFeeType" AS ENUM ('FREE', 'PER_PERSON', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'CERTIFICATE';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "certSignatoryName" TEXT,
ADD COLUMN     "certSignatoryTitle" TEXT DEFAULT 'Director',
ADD COLUMN     "certSignature" BYTEA,
ADD COLUMN     "certSignatureType" TEXT;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "certificateId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "workshopId" TEXT;

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audience" "WorkshopAudience" NOT NULL DEFAULT 'COLLEGE',
    "mode" "WorkshopMode" NOT NULL DEFAULT 'IN_PERSON',
    "venue" TEXT,
    "organizationId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "hours" DECIMAL(5,1),
    "capacity" INTEGER,
    "feeType" "WorkshopFeeType" NOT NULL DEFAULT 'PER_PERSON',
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "WorkshopStatus" NOT NULL DEFAULT 'UPCOMING',
    "coordinatorId" TEXT NOT NULL,
    "certificateTitle" TEXT NOT NULL DEFAULT 'Certificate of Participation',
    "minAttendancePct" INTEGER NOT NULL DEFAULT 75,
    "certNeedsPayment" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopTrainer" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopRegistration" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "institution" TEXT,
    "detail" TEXT,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "cancelledAt" TIMESTAMP(3),
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopPayment" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopAttendance" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "present" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopCertificate" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workshop_startDate_idx" ON "Workshop"("startDate");

-- CreateIndex
CREATE INDEX "Workshop_organizationId_idx" ON "Workshop"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopTrainer_workshopId_userId_key" ON "WorkshopTrainer"("workshopId", "userId");

-- CreateIndex
CREATE INDEX "WorkshopRegistration_workshopId_idx" ON "WorkshopRegistration"("workshopId");

-- CreateIndex
CREATE INDEX "WorkshopPayment_paidOn_idx" ON "WorkshopPayment"("paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAttendance_registrationId_date_key" ON "WorkshopAttendance"("registrationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCertificate_registrationId_key" ON "WorkshopCertificate"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCertificate_number_key" ON "WorkshopCertificate"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCertificate_fy_seq_key" ON "WorkshopCertificate"("fy", "seq");

-- CreateIndex
CREATE INDEX "EmailLog_certificateId_idx" ON "EmailLog"("certificateId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "WorkshopCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopTrainer" ADD CONSTRAINT "WorkshopTrainer_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopTrainer" ADD CONSTRAINT "WorkshopTrainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRegistration" ADD CONSTRAINT "WorkshopRegistration_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRegistration" ADD CONSTRAINT "WorkshopRegistration_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPayment" ADD CONSTRAINT "WorkshopPayment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "WorkshopRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPayment" ADD CONSTRAINT "WorkshopPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAttendance" ADD CONSTRAINT "WorkshopAttendance_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "WorkshopRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCertificate" ADD CONSTRAINT "WorkshopCertificate_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "WorkshopRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCertificate" ADD CONSTRAINT "WorkshopCertificate_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
