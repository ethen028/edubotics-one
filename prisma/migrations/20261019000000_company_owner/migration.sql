-- The company owner is an admin with an owner mark: every admin power, plus the owner dashboard.
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- The first admin account (the one set up when the app was installed) becomes the owner.
UPDATE "User" SET "isOwner" = true
WHERE "id" = (
  SELECT "id" FROM "User"
  WHERE "role" = 'ADMIN' AND "active" = true AND "closedAt" IS NULL
  ORDER BY "createdAt" ASC, "id" ASC
  LIMIT 1
);
