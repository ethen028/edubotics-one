-- This server-rendered app connects as the trusted migration/table owner. Browsers never get DB credentials.
-- Enable default-deny RLS for every application table so a non-owner direct DB role cannot read rows,
-- even if SELECT is accidentally granted later. Staff ownership remains enforced by server scope helpers.
DO $$
DECLARE relation RECORD;
BEGIN
  FOR relation IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation.tablename);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', relation.tablename);
  END LOOP;
END $$;
