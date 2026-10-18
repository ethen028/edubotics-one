-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "autoReminderAfterDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "autoReminderEveryDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "autoReminderLastRunOn" DATE,
ADD COLUMN     "autoReminderMaxPerInvoice" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "autoRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "sentById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoRemindersPausedAt" TIMESTAMP(3);

