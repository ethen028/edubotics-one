-- CreateEnum
CREATE TYPE "Look" AS ENUM ('CLEAN', 'DEPTH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "look" "Look" NOT NULL DEFAULT 'CLEAN';
