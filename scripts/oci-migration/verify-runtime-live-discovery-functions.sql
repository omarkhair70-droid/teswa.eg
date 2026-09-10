\set ON_ERROR_STOP on

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_public_moving_items(integer)'::regprocedure,
    'public.get_public_city_pulse_moving_items(text[],integer)'::regprocedure,
    'public.get_nearby_marketplace_items(double precision,double precision,double precision,integer,integer)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      WHERE p.oid = fn
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=public']::text[]
    ) THEN
      RAISE EXCEPTION 'function % is not SECURITY DEFINER with search_path=public', fn;
    END IF;
    IF has_function_privilege('public', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC retains EXECUTE on %', fn;
    END IF;
    IF NOT has_function_privilege('teswa_app_authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'teswa_app_authenticated lacks EXECUTE on %', fn;
    END IF;
  END LOOP;
END
$$;

SET ROLE teswa_app_authenticated;
SELECT count(*) AS moving_probe_rows FROM public.get_public_moving_items(1);
SELECT count(*) AS city_pulse_probe_rows FROM public.get_public_city_pulse_moving_items(ARRAY['beni suef']::text[], 1);
SELECT count(*) AS nearby_probe_rows FROM public.get_nearby_marketplace_items(30.0, 31.0, 0.1, 1, 0);
RESET ROLE;

SELECT 'runtime_live_discovery_functions=PASS' AS result;
