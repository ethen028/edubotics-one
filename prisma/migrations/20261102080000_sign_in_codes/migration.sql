-- Optional authenticator-app codes at sign-in. Columns on an existing table (row-level security is already on).
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
