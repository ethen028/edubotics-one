-- Migrate only the explicitly-labelled demonstration HR account. Production
-- accounts retain their existing roles and must be changed by an administrator.
UPDATE "User"
SET "role" = 'HR'
WHERE "email" = 'demo.hr@example.invalid'
  AND "role" = 'ADMIN';
