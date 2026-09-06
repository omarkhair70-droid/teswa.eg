\set ON_ERROR_STOP on

-- Teswa-owned push-notification worker substrate for OCI rehearsal.
-- Captures future notification inserts as durable jobs without storing push tokens
-- or notification bodies in the job table. No outbound push is performed here.

BEGIN;

CREATE SCHEMA IF NOT EXISTS teswa_jobs;
REVOKE ALL ON SCHEMA teswa_jobs FROM PUBLIC;

CREATE TABLE IF NOT EXISTS teswa_jobs.push_outbox (
  job_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS teswa_jobs_push_outbox_pending_idx
  ON teswa_jobs.push_outbox(status, available_at, job_id);
CREATE INDEX IF NOT EXISTS teswa_jobs_push_outbox_user_idx
  ON teswa_jobs.push_outbox(user_id, job_id);

REVOKE ALL ON TABLE teswa_jobs.push_outbox FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA teswa_jobs FROM PUBLIC;

CREATE OR REPLACE FUNCTION teswa_jobs.capture_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, teswa_jobs
AS $$
BEGIN
  INSERT INTO teswa_jobs.push_outbox(notification_id,user_id,notification_type)
  VALUES (NEW.id,NEW.user_id,NEW.type::text)
  ON CONFLICT (notification_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION teswa_jobs.capture_notification_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS teswa_push_outbox_capture ON public.notifications;
CREATE TRIGGER teswa_push_outbox_capture
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION teswa_jobs.capture_notification_insert();

COMMIT;
