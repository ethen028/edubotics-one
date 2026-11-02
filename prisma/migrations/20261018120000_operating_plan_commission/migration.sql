-- CreateEnum
CREATE TYPE "WorkshopKind" AS ENUM ('WORKSHOP', 'INTERNSHIP', 'TEACHER_TRAINING', 'BOOTCAMP');

-- CreateEnum
CREATE TYPE "PlanMetricKind" AS ENUM ('LEADS', 'MEETINGS', 'CONVERSIONS', 'WORKSHOP_STUDENTS', 'INTERNSHIP_STUDENTS', 'COLLEGE_PROJECTS', 'SCHOOL_PROPOSALS', 'INVOICED', 'RECEIVED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PlanTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Rag" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PREPARED', 'APPROVED');

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "kind" "WorkshopKind" NOT NULL DEFAULT 'WORKSHOP';

-- CreateTable
CREATE TABLE "PlanMonth" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "focus" TEXT NOT NULL,
    "activities" TEXT NOT NULL,
    "targets" TEXT,
    "leads" TEXT,
    "planningMeeting" TIMESTAMP(3),
    "review" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMetric" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "kind" "PlanMetricKind" NOT NULL,
    "label" TEXT NOT NULL,
    "target" DECIMAL(14,2) NOT NULL,
    "manualActual" DECIMAL(14,2),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTask" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "ownerId" TEXT,
    "deadline" DATE,
    "target" DECIMAL(14,2),
    "unit" TEXT,
    "actual" DECIMAL(14,2),
    "status" "PlanTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "rag" "Rag",
    "ragAt" TIMESTAMP(3),
    "recovery" TEXT,
    "notes" TEXT,
    "lastUpdateAt" TIMESTAMP(3),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTaskUpdate" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "review" BOOLEAN NOT NULL DEFAULT false,
    "actual" DECIMAL(14,2),
    "status" "PlanTaskStatus",
    "rag" "Rag",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanTaskUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionStatement" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PREPARED',
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "dealTitle" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "received" DECIMAL(14,2) NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "commission" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CommissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanMonth_month_key" ON "PlanMonth"("month");

-- CreateIndex
CREATE INDEX "PlanMetric_monthId_idx" ON "PlanMetric"("monthId");

-- CreateIndex
CREATE INDEX "PlanTask_monthId_idx" ON "PlanTask"("monthId");

-- CreateIndex
CREATE INDEX "PlanTask_ownerId_idx" ON "PlanTask"("ownerId");

-- CreateIndex
CREATE INDEX "PlanTaskUpdate_taskId_idx" ON "PlanTaskUpdate"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionStatement_month_key" ON "CommissionStatement"("month");

-- CreateIndex
CREATE INDEX "CommissionLine_statementId_idx" ON "CommissionLine"("statementId");

-- CreateIndex
CREATE INDEX "CommissionLine_userId_idx" ON "CommissionLine"("userId");

-- AddForeignKey
ALTER TABLE "PlanMetric" ADD CONSTRAINT "PlanMetric_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "PlanMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "PlanMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTaskUpdate" ADD CONSTRAINT "PlanTaskUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PlanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTaskUpdate" ADD CONSTRAINT "PlanTaskUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionStatement" ADD CONSTRAINT "CommissionStatement_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionStatement" ADD CONSTRAINT "CommissionStatement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CommissionStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Same default-deny row security as the other application tables (see 20261017133000_private_table_rls).
ALTER TABLE "PlanMonth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanTaskUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommissionStatement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommissionLine" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "PlanMonth", "PlanMetric", "PlanTask", "PlanTaskUpdate", "CommissionStatement", "CommissionLine" FROM PUBLIC;
