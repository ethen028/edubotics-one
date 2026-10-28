-- Purchase orders, stock requests and helpdesk requests are numbered per company (PO-0001, REQ-0001, HD-001),
-- like invoices. Existing numbers stay as they are; the app now picks the next number itself.
-- DropIndex
DROP INDEX "HelpdeskTicket_number_key";

-- DropIndex
DROP INDEX "PurchaseOrder_number_key";

-- DropIndex
DROP INDEX "StockRequest_number_key";

-- AlterTable
ALTER TABLE "HelpdeskTicket" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "HelpdeskTicket_number_seq";

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "PurchaseOrder_number_seq";

-- AlterTable
ALTER TABLE "StockRequest" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "StockRequest_number_seq";

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskTicket_companyId_number_key" ON "HelpdeskTicket"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_companyId_number_key" ON "PurchaseOrder"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_companyId_number_key" ON "StockRequest"("companyId", "number");

