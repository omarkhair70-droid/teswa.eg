do $$
declare
  v_job_id bigint;
  v_command text;
  v_secret text;
begin
  select jobid, command
  into v_job_id, v_command
  from cron.job
  where jobname = 'teswa-smart-reengagement-hourly'
  limit 1;

  if v_job_id is null then
    raise exception 'smart_notification_cron_job_not_found';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'teswa_smart_notification_job_secret'
  ) then
    v_secret := (regexp_match(v_command, '''x-teswa-smart-job-secret''\s*,\s*''([^'']+)'''))[1];

    if v_secret is null or btrim(v_secret) = '' then
      raise exception 'smart_notification_cron_secret_not_found';
    end if;

    perform vault.create_secret(
      v_secret,
      'teswa_smart_notification_job_secret',
      'Shared secret used only by the Teswa smart notification cron job',
      null
    );
  end if;

  perform cron.alter_job(
    job_id := v_job_id,
    command := $cron$
      select net.http_post(
        url := 'https://nvgxjvbsyvnfdakqhswq.supabase.co/functions/v1/run-smart-reengagement-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-teswa-smart-job-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'teswa_smart_notification_job_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cron$
  );
end;
$$;
