-- DropForeignKey
ALTER TABLE "Candidate" DROP CONSTRAINT "Candidate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "CandidateFile" DROP CONSTRAINT "CandidateFile_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "appliedOnlineAt" TIMESTAMP(3),
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CandidateFile" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "careersContactEmail" TEXT,
ADD COLUMN     "careersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "careersIntro" TEXT;

-- AlterTable
ALTER TABLE "JobOpening" ADD COLUMN     "applyBy" DATE,
ADD COLUMN     "onCareersPage" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFile" ADD CONSTRAINT "CandidateFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
