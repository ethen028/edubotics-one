-- Companies: Orbit can hold a group of companies. Everything already in the database belongs to the
-- first one (named after the company name in Admin > Settings), and the owner becomes the superadmin.
-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

INSERT INTO "Company" ("id", "name")
SELECT 'cmp_main', COALESCE((SELECT NULLIF(TRIM("companyName"), '') FROM "CompanySettings" ORDER BY "id" LIMIT 1), 'Edubotics Global');

-- DropIndex
DROP INDEX "Asset_code_key";

-- DropIndex
DROP INDEX "CommissionStatement_month_key";

-- DropIndex
DROP INDEX "CreditNote_fy_seq_key";

-- DropIndex
DROP INDEX "CreditNote_number_key";

-- DropIndex
DROP INDEX "Department_name_key";

-- DropIndex
DROP INDEX "Employee_code_key";

-- DropIndex
DROP INDEX "Holiday_date_key";

-- DropIndex
DROP INDEX "HrLetter_fy_seq_key";

-- DropIndex
DROP INDEX "HrLetter_number_key";

-- DropIndex
DROP INDEX "Invoice_fy_seq_key";

-- DropIndex
DROP INDEX "Invoice_number_key";

-- DropIndex
DROP INDEX "LeaveType_code_key";

-- DropIndex
DROP INDEX "PayrollRun_month_key";

-- DropIndex
DROP INDEX "PlanMonth_month_key";

-- DropIndex
DROP INDEX "Quote_fy_seq_key";

-- DropIndex
DROP INDEX "Quote_number_key";

-- DropIndex
DROP INDEX "ReviewCycle_name_key";

-- DropIndex
DROP INDEX "StockItem_sku_key";

-- DropIndex
DROP INDEX "TrainingModule_title_key";

-- DropIndex
DROP INDEX "Vendor_name_key";

-- DropIndex
DROP INDEX "WorkshopCertificate_fy_seq_key";

-- DropIndex
DROP INDEX "WorkshopCertificate_number_key";

-- DropIndex
DROP INDEX "WorkshopPayment_fy_seq_key";

-- DropIndex
DROP INDEX "WorkshopPayment_number_key";

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "AttendanceCorrection" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "AttendanceMark" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "CandidateFile" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistAssignee" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistPhoto" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistRun" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistTemplate" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ChecklistTick" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "CommissionLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "CommissionStatement" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
CREATE SEQUENCE companysettings_id_seq;
ALTER TABLE "CompanySettings" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main',
ALTER COLUMN "id" SET DEFAULT nextval('companysettings_id_seq');
ALTER SEQUENCE companysettings_id_seq OWNED BY "CompanySettings"."id";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ConversationMember" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "CreditNoteLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "EmployeeExit" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ExitTask" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ExpenseClaim" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ExpenseReceipt" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "HelpdeskAttachment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "HelpdeskComment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "HelpdeskTicket" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "HrLetter" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "NoticeAck" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "NoticeFile" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "OnboardingTask" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PerformanceReview" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PlanMetric" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PlanMonth" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PlanTask" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PlanTaskUpdate" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Programme" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProgrammeSession" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProgrammeTrainer" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProjectFile" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ProjectUpdate" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PurchaseReceipt" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "PurchaseReceiptLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Recognition" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ReviewCycle" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "ReviewGoal" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "SalaryStructure" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeCompanyId" TEXT;

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "StockRequest" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "StockRequestLine" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "TaskChecklistItem" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "TrainingAssignment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "TrainingModule" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main',
ADD COLUMN     "isSuperadmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "VendorBillFile" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "VendorPayment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "Workshop" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "WorkshopAttendance" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "WorkshopCertificate" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "WorkshopPayment" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "WorkshopRegistration" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';

-- AlterTable
ALTER TABLE "WorkshopTrainer" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'cmp_main';



-- CreateIndex
CREATE INDEX "Activity_companyId_idx" ON "Activity"("companyId");

-- CreateIndex
CREATE INDEX "ActivityLog_companyId_idx" ON "ActivityLog"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_companyId_code_key" ON "Asset"("companyId", "code");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_companyId_idx" ON "AttendanceCorrection"("companyId");

-- CreateIndex
CREATE INDEX "AttendanceMark_companyId_idx" ON "AttendanceMark"("companyId");

-- CreateIndex
CREATE INDEX "AttendanceSession_companyId_idx" ON "AttendanceSession"("companyId");

-- CreateIndex
CREATE INDEX "Candidate_companyId_idx" ON "Candidate"("companyId");

-- CreateIndex
CREATE INDEX "CandidateFile_companyId_idx" ON "CandidateFile"("companyId");

-- CreateIndex
CREATE INDEX "ChatMessage_companyId_idx" ON "ChatMessage"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistAssignee_companyId_idx" ON "ChecklistAssignee"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistItem_companyId_idx" ON "ChecklistItem"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistPhoto_companyId_idx" ON "ChecklistPhoto"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistRun_companyId_idx" ON "ChecklistRun"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_companyId_idx" ON "ChecklistTemplate"("companyId");

-- CreateIndex
CREATE INDEX "ChecklistTick_companyId_idx" ON "ChecklistTick"("companyId");

-- CreateIndex
CREATE INDEX "CommissionLine_companyId_idx" ON "CommissionLine"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionStatement_companyId_month_key" ON "CommissionStatement"("companyId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE INDEX "Conversation_companyId_idx" ON "Conversation"("companyId");

-- CreateIndex
CREATE INDEX "ConversationMember_companyId_idx" ON "ConversationMember"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_fy_seq_key" ON "CreditNote"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_number_key" ON "CreditNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "CreditNoteLine_companyId_idx" ON "CreditNoteLine"("companyId");

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "EmailLog_companyId_idx" ON "EmailLog"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_code_key" ON "Employee"("companyId", "code");

-- CreateIndex
CREATE INDEX "EmployeeDocument_companyId_idx" ON "EmployeeDocument"("companyId");

-- CreateIndex
CREATE INDEX "EmployeeExit_companyId_idx" ON "EmployeeExit"("companyId");

-- CreateIndex
CREATE INDEX "ExitTask_companyId_idx" ON "ExitTask"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_companyId_idx" ON "ExpenseClaim"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_companyId_idx" ON "ExpenseReceipt"("companyId");

-- CreateIndex
CREATE INDEX "HelpdeskAttachment_companyId_idx" ON "HelpdeskAttachment"("companyId");

-- CreateIndex
CREATE INDEX "HelpdeskComment_companyId_idx" ON "HelpdeskComment"("companyId");

-- CreateIndex
CREATE INDEX "HelpdeskTicket_companyId_idx" ON "HelpdeskTicket"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_companyId_date_key" ON "Holiday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "HrLetter_companyId_fy_seq_key" ON "HrLetter"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "HrLetter_companyId_number_key" ON "HrLetter"("companyId", "number");

-- CreateIndex
CREATE INDEX "Interview_companyId_idx" ON "Interview"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_fy_seq_key" ON "Invoice"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_companyId_idx" ON "InvoiceLine"("companyId");

-- CreateIndex
CREATE INDEX "InvoicePayment_companyId_idx" ON "InvoicePayment"("companyId");

-- CreateIndex
CREATE INDEX "JobOpening_companyId_idx" ON "JobOpening"("companyId");

-- CreateIndex
CREATE INDEX "Lead_companyId_idx" ON "Lead"("companyId");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_idx" ON "LeaveRequest"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_companyId_code_key" ON "LeaveType"("companyId", "code");

-- CreateIndex
CREATE INDEX "Milestone_companyId_idx" ON "Milestone"("companyId");

-- CreateIndex
CREATE INDEX "Notice_companyId_idx" ON "Notice"("companyId");

-- CreateIndex
CREATE INDEX "NoticeAck_companyId_idx" ON "NoticeAck"("companyId");

-- CreateIndex
CREATE INDEX "NoticeFile_companyId_idx" ON "NoticeFile"("companyId");

-- CreateIndex
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

-- CreateIndex
CREATE INDEX "Offer_companyId_idx" ON "Offer"("companyId");

-- CreateIndex
CREATE INDEX "OnboardingTask_companyId_idx" ON "OnboardingTask"("companyId");

-- CreateIndex
CREATE INDEX "Organization_companyId_idx" ON "Organization"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_companyId_month_key" ON "PayrollRun"("companyId", "month");

-- CreateIndex
CREATE INDEX "Payslip_companyId_idx" ON "Payslip"("companyId");

-- CreateIndex
CREATE INDEX "PerformanceReview_companyId_idx" ON "PerformanceReview"("companyId");

-- CreateIndex
CREATE INDEX "PlanMetric_companyId_idx" ON "PlanMetric"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMonth_companyId_month_key" ON "PlanMonth"("companyId", "month");

-- CreateIndex
CREATE INDEX "PlanTask_companyId_idx" ON "PlanTask"("companyId");

-- CreateIndex
CREATE INDEX "PlanTaskUpdate_companyId_idx" ON "PlanTaskUpdate"("companyId");

-- CreateIndex
CREATE INDEX "Programme_companyId_idx" ON "Programme"("companyId");

-- CreateIndex
CREATE INDEX "ProgrammeSession_companyId_idx" ON "ProgrammeSession"("companyId");

-- CreateIndex
CREATE INDEX "ProgrammeTrainer_companyId_idx" ON "ProgrammeTrainer"("companyId");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE INDEX "ProjectFile_companyId_idx" ON "ProjectFile"("companyId");

-- CreateIndex
CREATE INDEX "ProjectMember_companyId_idx" ON "ProjectMember"("companyId");

-- CreateIndex
CREATE INDEX "ProjectTask_companyId_idx" ON "ProjectTask"("companyId");

-- CreateIndex
CREATE INDEX "ProjectUpdate_companyId_idx" ON "ProjectUpdate"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_idx" ON "PurchaseOrder"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_companyId_idx" ON "PurchaseOrderLine"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_companyId_idx" ON "PurchaseReceipt"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptLine_companyId_idx" ON "PurchaseReceiptLine"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_companyId_fy_seq_key" ON "Quote"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_companyId_number_key" ON "Quote"("companyId", "number");

-- CreateIndex
CREATE INDEX "QuoteLine_companyId_idx" ON "QuoteLine"("companyId");

-- CreateIndex
CREATE INDEX "Recognition_companyId_idx" ON "Recognition"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCycle_companyId_name_key" ON "ReviewCycle"("companyId", "name");

-- CreateIndex
CREATE INDEX "ReviewGoal_companyId_idx" ON "ReviewGoal"("companyId");

-- CreateIndex
CREATE INDEX "SalaryStructure_companyId_idx" ON "SalaryStructure"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_companyId_sku_key" ON "StockItem"("companyId", "sku");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_idx" ON "StockMovement"("companyId");

-- CreateIndex
CREATE INDEX "StockRequest_companyId_idx" ON "StockRequest"("companyId");

-- CreateIndex
CREATE INDEX "StockRequestLine_companyId_idx" ON "StockRequestLine"("companyId");

-- CreateIndex
CREATE INDEX "TaskChecklistItem_companyId_idx" ON "TaskChecklistItem"("companyId");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_idx" ON "TimeEntry"("companyId");

-- CreateIndex
CREATE INDEX "Timesheet_companyId_idx" ON "Timesheet"("companyId");

-- CreateIndex
CREATE INDEX "TrainingAssignment_companyId_idx" ON "TrainingAssignment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_companyId_title_key" ON "TrainingModule"("companyId", "title");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");

-- CreateIndex
CREATE INDEX "VendorBill_companyId_idx" ON "VendorBill"("companyId");

-- CreateIndex
CREATE INDEX "VendorBillFile_companyId_idx" ON "VendorBillFile"("companyId");

-- CreateIndex
CREATE INDEX "VendorPayment_companyId_idx" ON "VendorPayment"("companyId");

-- CreateIndex
CREATE INDEX "Workshop_companyId_idx" ON "Workshop"("companyId");

-- CreateIndex
CREATE INDEX "WorkshopAttendance_companyId_idx" ON "WorkshopAttendance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCertificate_companyId_fy_seq_key" ON "WorkshopCertificate"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopCertificate_companyId_number_key" ON "WorkshopCertificate"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPayment_companyId_fy_seq_key" ON "WorkshopPayment"("companyId", "fy", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopPayment_companyId_number_key" ON "WorkshopPayment"("companyId", "number");

-- CreateIndex
CREATE INDEX "WorkshopRegistration_companyId_idx" ON "WorkshopRegistration"("companyId");

-- CreateIndex
CREATE INDEX "WorkshopTrainer_companyId_idx" ON "WorkshopTrainer"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingModule" ADD CONSTRAINT "TrainingModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequestLine" ADD CONSTRAINT "StockRequestLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeTrainer" ADD CONSTRAINT "ProgrammeTrainer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeSession" ADD CONSTRAINT "ProgrammeSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteLine" ADD CONSTRAINT "CreditNoteLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorBillFile" ADD CONSTRAINT "VendorBillFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFile" ADD CONSTRAINT "CandidateFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeFile" ADD CONSTRAINT "NoticeFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeAck" ADD CONSTRAINT "NoticeAck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskTicket" ADD CONSTRAINT "HelpdeskTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskComment" ADD CONSTRAINT "HelpdeskComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpdeskAttachment" ADD CONSTRAINT "HelpdeskAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopTrainer" ADD CONSTRAINT "WorkshopTrainer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopRegistration" ADD CONSTRAINT "WorkshopRegistration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopPayment" ADD CONSTRAINT "WorkshopPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAttendance" ADD CONSTRAINT "WorkshopAttendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCertificate" ADD CONSTRAINT "WorkshopCertificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewGoal" ADD CONSTRAINT "ReviewGoal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeExit" ADD CONSTRAINT "EmployeeExit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitTask" ADD CONSTRAINT "ExitTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeCompanyId_fkey" FOREIGN KEY ("activeCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistAssignee" ADD CONSTRAINT "ChecklistAssignee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistRun" ADD CONSTRAINT "ChecklistRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTick" ADD CONSTRAINT "ChecklistTick_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPhoto" ADD CONSTRAINT "ChecklistPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMonth" ADD CONSTRAINT "PlanMonth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMetric" ADD CONSTRAINT "PlanMetric_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTaskUpdate" ADD CONSTRAINT "PlanTaskUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionStatement" ADD CONSTRAINT "CommissionStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrLetter" ADD CONSTRAINT "HrLetter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- New rows always name their company (src/lib/company-scope.ts fills it in). The default left behind fails
-- loudly ("unrecognized configuration parameter") if one ever doesn't, instead of filing it under the first company.
ALTER TABLE "Activity" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ActivityLog" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Asset" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "AttendanceCorrection" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "AttendanceMark" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "AttendanceSession" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Candidate" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CandidateFile" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChatMessage" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistAssignee" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistItem" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistPhoto" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistRun" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistTemplate" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ChecklistTick" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CommissionLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CommissionStatement" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CompanySettings" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Contact" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Conversation" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ConversationMember" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CreditNote" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "CreditNoteLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Deal" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Department" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "EmailLog" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Employee" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "EmployeeDocument" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "EmployeeExit" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ExitTask" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ExpenseClaim" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ExpenseReceipt" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "HelpdeskAttachment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "HelpdeskComment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "HelpdeskTicket" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Holiday" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "HrLetter" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Interview" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Invoice" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "InvoiceLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "InvoicePayment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "JobOpening" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Lead" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "LeaveRequest" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "LeaveType" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Milestone" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Notice" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "NoticeAck" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "NoticeFile" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Notification" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Offer" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "OnboardingTask" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Organization" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PayrollRun" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Payslip" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PerformanceReview" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PlanMetric" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PlanMonth" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PlanTask" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PlanTaskUpdate" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Programme" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProgrammeSession" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProgrammeTrainer" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Project" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProjectFile" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProjectMember" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProjectTask" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ProjectUpdate" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PurchaseOrder" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PurchaseReceipt" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "PurchaseReceiptLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Quote" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "QuoteLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Recognition" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ReviewCycle" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "ReviewGoal" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "SalaryStructure" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "StockItem" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "StockMovement" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "StockRequest" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "StockRequestLine" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "TaskChecklistItem" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "TimeEntry" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Timesheet" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "TrainingAssignment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "TrainingModule" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "User" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Vendor" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "VendorBill" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "VendorBillFile" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "VendorPayment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "Workshop" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "WorkshopAttendance" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "WorkshopCertificate" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "WorkshopPayment" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "WorkshopRegistration" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);
ALTER TABLE "WorkshopTrainer" ALTER COLUMN "companyId" SET DEFAULT current_setting('orbit.company_id'::text);

SELECT setval('companysettings_id_seq', GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "CompanySettings"), 1));

-- The superadmin is the owner (or, on a copy without one, the first active admin).
UPDATE "User" SET "isSuperadmin" = true WHERE "id" = COALESCE(
  (SELECT "id" FROM "User" WHERE "isOwner" ORDER BY "createdAt" LIMIT 1),
  (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' AND "active" AND "closedAt" IS NULL ORDER BY "createdAt" LIMIT 1)
);

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Company" FROM PUBLIC;
