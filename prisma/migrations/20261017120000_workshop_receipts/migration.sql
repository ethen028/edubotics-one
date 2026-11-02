-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'RECEIPT';

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "receiptId" TEXT;

-- AlterTable: added as optional first so payments already recorded can be given receipts below.
ALTER TABLE "WorkshopPayment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "fy" TEXT,
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "seq" INTEGER;

-- Payments recorded before receipts existed: number them in the order they were paid, each
-- financial year from 0001, with today's GST setting and the same place-of-supply rule as the app.
WITH s AS (
  SELECT COALESCE((SELECT "invoicePrefix" FROM "CompanySettings" WHERE id = 1), 'EBG') AS prefix,
         COALESCE((SELECT "companyState" FROM "CompanySettings" WHERE id = 1), 'Kerala') AS state,
         COALESCE((SELECT CASE WHEN "gstEnabled" THEN "defaultGstRate" ELSE 0 END FROM "CompanySettings" WHERE id = 1), 18) AS rate
), p AS (
  SELECT wp.id,
         EXTRACT(YEAR FROM wp."paidOn")::int - CASE WHEN EXTRACT(MONTH FROM wp."paidOn") < 4 THEN 1 ELSE 0 END AS y,
         CASE WHEN w."mode" = 'IN_PERSON' AND o."state" IS NOT NULL AND o."state" <> '' THEN o."state" END AS host_state,
         wp."paidOn", wp."createdAt"
  FROM "WorkshopPayment" wp
  JOIN "WorkshopRegistration" r ON r.id = wp."registrationId"
  JOIN "Workshop" w ON w.id = r."workshopId"
  LEFT JOIN "Organization" o ON o.id = w."organizationId"
), n AS (
  SELECT id, host_state,
         LPAD((y % 100)::text, 2, '0') || '-' || LPAD(((y + 1) % 100)::text, 2, '0') AS fy,
         ROW_NUMBER() OVER (PARTITION BY y ORDER BY "paidOn", "createdAt", id)::int AS seq
  FROM p
)
UPDATE "WorkshopPayment" wp
SET "fy" = n.fy,
    "seq" = n.seq,
    "number" = s.prefix || '/R/' || n.fy || '/' || LPAD(n.seq::text, 4, '0'),
    "gstRate" = s.rate,
    "placeOfSupply" = COALESCE(n.host_state, s.state)
FROM n, s
WHERE wp.id = n.id;

ALTER TABLE "WorkshopPayment" ALTER COLUMN "fy" SET NOT NULL,
ALTER COLUMN "seq" SET NOT NULL,
ALTER COLUMN "number" SET NOT NULL,
ALTER COLUMN "placeOfSupply" SET NOT NULL;

-- CreateIndex
CREATE INDEX "EmailLog_receiptId_idx" ON "EmailLog"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPayment_number_key" ON "WorkshopPayment"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPayment_fy_seq_key" ON "WorkshopPayment"("fy", "seq");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "WorkshopPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
