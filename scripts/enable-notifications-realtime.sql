-- MIS live bell — run ONCE in the Supabase SQL editor (plain Run).
-- The bell subscribes to INSERTs on public.notifications over Supabase Realtime. Realtime only
-- streams tables in the `supabase_realtime` publication, and only rows the subscriber's RLS lets
-- it SELECT — so: publish the table, and let each signed-in user read their own rows only.
-- The app server writes through Prisma as the table owner, which RLS does not restrict.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notifications" ON public.notifications;
CREATE POLICY "own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- verify (expect one row each):
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
-- SELECT policyname FROM pg_policies WHERE tablename = 'notifications';
