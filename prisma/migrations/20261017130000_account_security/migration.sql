ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TYPE "EmailKind" ADD VALUE 'ACCOUNT_SECURITY';
CREATE TABLE "AccountToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_userId_kind_idx" ON "AccountToken"("userId", "kind");
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
