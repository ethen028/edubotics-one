CREATE TABLE "AccountMailJob" (
  "id" TEXT NOT NULL,
  "sealedEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  CONSTRAINT "AccountMailJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountMailJob_expiresAt_claimedAt_idx" ON "AccountMailJob"("expiresAt", "claimedAt");
ALTER TABLE "AccountMailJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AccountMailJob" FROM PUBLIC;
