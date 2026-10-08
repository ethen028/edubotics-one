-- CreateEnum
CREATE TYPE "ExitKind" AS ENUM ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExitStage" AS ENUM ('REQUESTED', 'ON_NOTICE', 'LEFT', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'EXIT_LETTER';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "noticePeriodDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "exitId" TEXT;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "exitRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "finalSettlement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gratuity" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "leaveEncashment" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "noticePay" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "noticeRecovery" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EmployeeExit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "ExitKind" NOT NULL DEFAULT 'RESIGNATION',
    "stage" "ExitStage" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "noticeGivenOn" DATE NOT NULL,
    "noticeDays" INTEGER NOT NULL,
    "proposedLastDay" DATE NOT NULL,
    "lastWorkingDay" DATE,
    "startedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "rehireEligible" BOOLEAN,
    "interviewReason" TEXT,
    "interviewRating" INTEGER,
    "interviewRecommend" BOOLEAN,
    "interviewLiked" TEXT,
    "interviewImprove" TEXT,
    "interviewAt" TIMESTAMP(3),
    "encashDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "noticePayDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "recoveryDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "gratuity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recoveries" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recoveriesNote" TEXT,
    "settlementNote" TEXT,
    "settlementAgreedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeExit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitTask" (
    "id" TEXT NOT NULL,
    "exitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExitTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeExit_employeeId_stage_idx" ON "EmployeeExit"("employeeId", "stage");

-- CreateIndex
CREATE INDEX "ExitTask_exitId_idx" ON "ExitTask"("exitId");

-- CreateIndex
CREATE INDEX "EmailLog_exitId_idx" ON "EmailLog"("exitId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "EmployeeExit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitTask" ADD CONSTRAINT "ExitTask_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "EmployeeExit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitTask" ADD CONSTRAINT "ExitTask_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
