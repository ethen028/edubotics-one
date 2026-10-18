-- Rewards and recognition: colleagues thank each other; managers can put one in the spotlight on Home.
CREATE TABLE "Recognition" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "featuredAt" TIMESTAMP(3),
    "featuredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recognition_toId_createdAt_idx" ON "Recognition"("toId", "createdAt");
CREATE INDEX "Recognition_createdAt_idx" ON "Recognition"("createdAt");
CREATE INDEX "Recognition_featuredAt_idx" ON "Recognition"("featuredAt");

ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_featuredById_fkey" FOREIGN KEY ("featuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
