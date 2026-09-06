\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswapush') THEN
    CREATE ROLE teswapush LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END$$;
ALTER ROLE teswapush LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public,teswa_jobs TO teswapush;
GRANT SELECT ON public.notifications,public.notification_preferences,public.push_devices,public.profiles TO teswapush;
GRANT UPDATE ON public.push_devices TO teswapush;
GRANT SELECT,UPDATE ON teswa_jobs.push_outbox TO teswapush;

CREATE OR REPLACE FUNCTION teswa_jobs.push_worker_can_read_notification(p_notification_id uuid,p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog,teswa_jobs
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM teswa_jobs.push_outbox j
    WHERE j.notification_id=p_notification_id
      AND j.user_id=p_user_id
      AND j.status::text='processing'
  );
$$;

CREATE OR REPLACE FUNCTION teswa_jobs.push_worker_has_active_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog,teswa_jobs
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM teswa_jobs.push_outbox j
    WHERE j.user_id=p_user_id
      AND j.status::text='processing'
  );
$$;

CREATE OR REPLACE FUNCTION teswa_jobs.push_worker_can_read_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog,teswa_jobs,public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM teswa_jobs.push_outbox j
    JOIN public.notifications n ON n.id=j.notification_id
    WHERE j.status::text='processing'
      AND n.actor_user_id=p_profile_id
  );
$$;

REVOKE ALL ON FUNCTION teswa_jobs.push_worker_can_read_notification(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_jobs.push_worker_has_active_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_jobs.push_worker_can_read_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_jobs.push_worker_can_read_notification(uuid,uuid),teswa_jobs.push_worker_has_active_user(uuid),teswa_jobs.push_worker_can_read_profile(uuid) TO teswapush;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teswapush_active_notification_select ON public.notifications;
CREATE POLICY teswapush_active_notification_select ON public.notifications
FOR SELECT TO teswapush
USING (teswa_jobs.push_worker_can_read_notification(id,user_id));

DROP POLICY IF EXISTS teswapush_active_preferences_select ON public.notification_preferences;
CREATE POLICY teswapush_active_preferences_select ON public.notification_preferences
FOR SELECT TO teswapush
USING (teswa_jobs.push_worker_has_active_user(user_id));

DROP POLICY IF EXISTS teswapush_active_devices_select ON public.push_devices;
CREATE POLICY teswapush_active_devices_select ON public.push_devices
FOR SELECT TO teswapush
USING (teswa_jobs.push_worker_has_active_user(user_id));

DROP POLICY IF EXISTS teswapush_active_devices_update ON public.push_devices;
CREATE POLICY teswapush_active_devices_update ON public.push_devices
FOR UPDATE TO teswapush
USING (teswa_jobs.push_worker_has_active_user(user_id))
WITH CHECK (teswa_jobs.push_worker_has_active_user(user_id));

DROP POLICY IF EXISTS teswapush_active_actor_profile_select ON public.profiles;
CREATE POLICY teswapush_active_actor_profile_select ON public.profiles
FOR SELECT TO teswapush
USING (teswa_jobs.push_worker_can_read_profile(id));

COMMIT;
