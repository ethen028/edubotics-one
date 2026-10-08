-- CreateEnum
CREATE TYPE "ChecklistFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'SESSION');

-- CreateEnum
CREATE TYPE "ChecklistAudience" AS ENUM ('EVERYONE', 'ROLE', 'PEOPLE');

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "ChecklistFrequency" NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "dueTime" TEXT,
    "audience" "ChecklistAudience" NOT NULL DEFAULT 'PEOPLE',
    "role" "Role",
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "needsPhoto" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistAssignee" (
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ChecklistAssignee_pkey" PRIMARY KEY ("templateId","userId")
);

-- CreateTable
CREATE TABLE "ChecklistRun" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "sessionId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTick" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "note" TEXT,
    "tickedById" TEXT NOT NULL,
    "tickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPhoto" (
    "id" TEXT NOT NULL,
    "tickId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ChecklistPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_templateId_idx" ON "ChecklistItem"("templateId");

-- CreateIndex
CREATE INDEX "ChecklistRun_userId_dueDate_idx" ON "ChecklistRun"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "ChecklistRun_dueDate_idx" ON "ChecklistRun"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistRun_templateId_userId_periodKey_key" ON "ChecklistRun"("templateId", "userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTick_runId_itemId_key" ON "ChecklistTick"("runId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPhoto_tickId_key" ON "ChecklistPhoto"("tickId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAssignee" ADD CONSTRAINT "ChecklistAssignee_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAssignee" ADD CONSTRAINT "ChecklistAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ProgrammeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTick" ADD CONSTRAINT "ChecklistTick_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChecklistRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTick" ADD CONSTRAINT "ChecklistTick_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTick" ADD CONSTRAINT "ChecklistTick_tickedById_fkey" FOREIGN KEY ("tickedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPhoto" ADD CONSTRAINT "ChecklistPhoto_tickId_fkey" FOREIGN KEY ("tickId") REFERENCES "ChecklistTick"("id") ON DELETE CASCADE ON UPDATE CASCADE;
