-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "editedAt" TIMESTAMP(3);
