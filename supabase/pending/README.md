# Pending database changes

Files in this directory are **not production migrations** and are never applied by `supabase db push`.

They preserve SQL that was found in source control but was not present in the production migration history. Before shipping a pending change:

1. re-review it against the current production schema;
2. create a new migration with a fresh timestamp;
3. test it on a fresh/local or preview database;
4. deploy the migration through the normal reviewed release path;
5. remove the pending copy once the new migration is authoritative.

The previously deferred performance telemetry change shipped in PR #7 and its pending copy was removed after the production migrations became authoritative.
