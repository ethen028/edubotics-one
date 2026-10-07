-- CreateEnum
CREATE TYPE "ReviewCycleKind" AS ENUM ('ANNUAL', 'HALF_YEARLY');

-- CreateEnum
CREATE TYPE "ReviewCycleStage" AS ENUM ('GOAL_SETTING', 'REVIEW', 'CLOSED');

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ReviewCycleKind" NOT NULL DEFAULT 'ANNUAL',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "goalsDue" DATE,
    "selfDue" DATE,
    "managerDue" DATE,
    "stage" "ReviewCycleStage" NOT NULL DEFAULT 'GOAL_SETTING',
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "goalsAgreedAt" TIMESTAMP(3),
    "selfAchievements" TEXT,
    "selfImprove" TEXT,
    "selfSubmittedAt" TIMESTAMP(3),
    "managerRating" INTEGER,
    "managerStrengths" TEXT,
    "managerImprove" TEXT,
    "managerComment" TEXT,
    "managerSubmittedAt" TIMESTAMP(3),
    "managerSubmittedById" TEXT,
    "employeeComment" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewGoal" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "measure" TEXT,
    "weight" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "selfRating" INTEGER,
    "selfComment" TEXT,
    "managerRating" INTEGER,
    "managerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCycle_name_key" ON "ReviewCycle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key" ON "PerformanceReview"("cycleId", "employeeId");

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_managerSubmittedById_fkey" FOREIGN KEY ("managerSubmittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewGoal" ADD CONSTRAINT "ReviewGoal_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
