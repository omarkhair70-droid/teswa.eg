\set ON_ERROR_STOP on

-- Teswa-owned durable realtime substrate for OCI rehearsal.
-- Mirrors the six current Supabase realtime publication tables without carrying
-- row payloads. Clients refetch authoritative state through Teswa-owned APIs.

BEGIN;

CREATE SCHEMA IF NOT EXISTS teswa_realtime;
REVOKE ALL ON SCHEMA teswa_realtime FROM PUBLIC;

CREATE TABLE IF NOT EXISTS teswa_realtime.events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL CHECK (source_table IN (
    'deal_message_reads','deal_messages','direct_message_attachments',
    'direct_message_reactions','direct_messages','direct_typing_state'
  )),
  event_type text NOT NULL CHECK (event_type IN ('INSERT','UPDATE','DELETE')),
  aggregate_kind text NOT NULL CHECK (aggregate_kind IN ('deal','direct')),
  aggregate_id uuid NOT NULL,
  row_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS teswa_realtime_events_aggregate_idx
  ON teswa_realtime.events(aggregate_kind, aggregate_id, event_id);
CREATE INDEX IF NOT EXISTS teswa_realtime_events_created_idx
  ON teswa_realtime.events(created_at, event_id);

REVOKE ALL ON TABLE teswa_realtime.events FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA teswa_realtime FROM PUBLIC;

CREATE OR REPLACE FUNCTION teswa_realtime.capture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, teswa_realtime
AS $$
DECLARE
  rowj jsonb;
  kind text;
  aggregate_id uuid;
  row_id uuid;
BEGIN
  rowj := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  IF TG_TABLE_NAME IN ('direct_message_attachments','direct_message_reactions','direct_messages','direct_typing_state') THEN
    kind := 'direct';
    aggregate_id := NULLIF(rowj->>'conversation_id','')::uuid;
  ELSIF TG_TABLE_NAME IN ('deal_message_reads','deal_messages') THEN
    kind := 'deal';
    aggregate_id := NULLIF(rowj->>'deal_id','')::uuid;
  ELSE
    RAISE EXCEPTION 'unsupported realtime source table: %', TG_TABLE_NAME;
  END IF;

  row_id := COALESCE(NULLIF(rowj->>'id',''), NULLIF(rowj->>'user_id',''))::uuid;
  IF aggregate_id IS NULL THEN
    RAISE EXCEPTION 'realtime aggregate id missing for %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  INSERT INTO teswa_realtime.events(source_table,event_type,aggregate_kind,aggregate_id,row_id)
  VALUES (TG_TABLE_NAME,TG_OP,kind,aggregate_id,row_id);

  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION teswa_realtime.capture_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.deal_message_reads;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.deal_message_reads
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.deal_messages;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.deal_messages
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.direct_message_attachments;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.direct_message_attachments
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.direct_message_reactions;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.direct_message_reactions
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.direct_messages;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

DROP TRIGGER IF EXISTS teswa_realtime_capture_change ON public.direct_typing_state;
CREATE TRIGGER teswa_realtime_capture_change AFTER INSERT OR UPDATE OR DELETE ON public.direct_typing_state
FOR EACH ROW EXECUTE FUNCTION teswa_realtime.capture_change();

CREATE OR REPLACE FUNCTION teswa_realtime.read_events(
  p_after_id bigint DEFAULT 0,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  event_id bigint,
  source_table text,
  event_type text,
  aggregate_kind text,
  aggregate_id uuid,
  row_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, teswa_runtime, teswa_realtime
AS $$
  WITH ctx AS (
    SELECT teswa_runtime.current_user_id() AS uid
  )
  SELECT e.event_id,e.source_table,e.event_type,e.aggregate_kind,e.aggregate_id,e.row_id,e.created_at
  FROM teswa_realtime.events e, ctx
  WHERE e.event_id > GREATEST(COALESCE(p_after_id,0),0)
    AND ctx.uid IS NOT NULL
    AND (
      (e.aggregate_kind='direct' AND EXISTS (
        SELECT 1 FROM public.direct_conversations c
        WHERE c.id=e.aggregate_id AND ctx.uid IN (c.participant_a,c.participant_b)
      ))
      OR
      (e.aggregate_kind='deal' AND EXISTS (
        SELECT 1 FROM public.swap_deals d
        WHERE d.id=e.aggregate_id AND ctx.uid IN (d.requester_id,d.offerer_id)
      ))
    )
  ORDER BY e.event_id
  LIMIT GREATEST(1,LEAST(COALESCE(p_limit,200),500));
$$;

REVOKE ALL ON FUNCTION teswa_realtime.read_events(bigint,integer) FROM PUBLIC;
GRANT USAGE ON SCHEMA teswa_realtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_realtime.read_events(bigint,integer) TO teswa_app_authenticated;

COMMIT;
