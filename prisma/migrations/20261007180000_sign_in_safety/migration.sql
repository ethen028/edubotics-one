-- CreateEnum
CREATE TYPE "SignInMethod" AS ENUM ('PASSWORD', 'GOOGLE');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "appAddress" TEXT,
ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecret" TEXT,
ADD COLUMN     "googleDomain" TEXT,
ADD COLUMN     "googleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loginLockMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "loginMaxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "sessionIdleHours" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "SignInMethod" NOT NULL DEFAULT 'PASSWORD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "ok" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ip" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_endedAt_idx" ON "Session"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_at_idx" ON "LoginAttempt"("email", "at");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_at_idx" ON "LoginAttempt"("ip", "at");

-- CreateIndex
CREATE INDEX "ActivityLog_at_idx" ON "ActivityLog"("at");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_at_idx" ON "ActivityLog"("userId", "at");

-- CreateIndex
CREATE INDEX "ActivityLog_area_at_idx" ON "ActivityLog"("area", "at");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

