-- The side menu opens as the slim violet icon rail for everyone, as in the reference dashboard. Anyone can widen it again.
ALTER TABLE "User" ALTER COLUMN "menuCollapsed" SET DEFAULT true;
UPDATE "User" SET "menuCollapsed" = true;
