-- CreateEnum
CREATE TYPE "ProgrammeStatus" AS ENUM ('PLANNED', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "academicYear" TEXT,
    "grades" TEXT,
    "students" INTEGER,
    "sessionsPlanned" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "status" "ProgrammeStatus" NOT NULL DEFAULT 'PLANNED',
    "coordinatorId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeTrainer" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgrammeTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeSession" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 60,
    "classGroup" TEXT,
    "topic" TEXT,
    "trainerId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "studentsPresent" INTEGER,
    "covered" TEXT,
    "notes" TEXT,
    "issues" TEXT,
    "loggedById" TEXT,
    "loggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Programme_organizationId_idx" ON "Programme"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeTrainer_programmeId_userId_key" ON "ProgrammeTrainer"("programmeId", "userId");

-- CreateIndex
CREATE INDEX "ProgrammeSession_programmeId_date_idx" ON "ProgrammeSession"("programmeId", "date");

-- CreateIndex
CREATE INDEX "ProgrammeSession_trainerId_date_idx" ON "ProgrammeSession"("trainerId", "date");

-- CreateIndex
CREATE INDEX "ProgrammeSession_date_idx" ON "ProgrammeSession"("date");

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeTrainer" ADD CONSTRAINT "ProgrammeTrainer_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeTrainer" ADD CONSTRAINT "ProgrammeTrainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSession" ADD CONSTRAINT "ProgrammeSession_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSession" ADD CONSTRAINT "ProgrammeSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSession" ADD CONSTRAINT "ProgrammeSession_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
