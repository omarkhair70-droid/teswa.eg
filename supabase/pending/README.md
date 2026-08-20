# Pending database changes

Files in this directory are **not production migrations** and are never applied by `supabase db push`.

They preserve SQL that was found in source control but was not present in the production migration history. Before shipping a pending change:

1. re-review it against the current production schema;
2. create a new migration with a fresh timestamp;
3. test it on a fresh/local or preview database;
4. deploy the migration through the normal reviewed release path;
5. remove the pending copy once the new migration is authoritative.

`allow_performance_metric_analytics_event.sql` is intentionally deferred to the Observability PR. Production currently does not accept the `performance_metric` analytics event, so the repository must not pretend that historical migration was already deployed.
