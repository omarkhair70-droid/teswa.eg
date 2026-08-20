# Teswa Database Source of Truth

## Authority model

Teswa database changes are versioned in `supabase/migrations/`. For migrations that have already reached production, the Git filename (`<version>_<name>.sql`) and the production row in `supabase_migrations.schema_migrations` must agree.

`supabase/PRODUCTION_MIGRATION_HISTORY.txt` is a checked-in operational snapshot of the reconciled production migration list. It is useful for review and CI drift checks, but the executable migration files remain the schema-change source of truth.

## Golden rule

Do not make production schema changes directly in the Supabase Dashboard, SQL editor, or ad-hoc scripts and then leave them untracked.

Every new production schema change must:

1. be represented by a migration file with a unique timestamp;
2. be reviewed in Git;
3. be tested before production deployment;
4. be deployed once;
5. leave the production migration-history row matching the Git filename.

If an emergency production change is unavoidable, immediately capture/reconcile it before further migrations are shipped.

## PR #4 reconciliation

The August 11 and PR #1 database changes had matching migration names/content but several production tracking timestamps differed from the filenames committed to Git. PR #4 repaired the tracking metadata so the production versions use the canonical Git timestamps. This changed migration bookkeeping only; it did not change application tables or user data.

Two migrations were present in production history but missing from Git and have been restored verbatim from the production migration records:

- `20260815131744_add_profile_official_verification_fields.sql`
- `20260815132120_add_official_seed_metadata_to_items.sql`

The historical `20260528190000_allow_performance_metric_analytics_event.sql` file was the opposite case: it existed in Git but was never recorded/applied in production. It has therefore been removed from `supabase/migrations/` and preserved under `supabase/pending/`. The Observability PR must recreate that change with a fresh timestamp and actually deploy it.

## Known bootstrap gap

The current tracked migration series starts at `20260515093000_create_marketplace_items_view.sql`. That migration assumes core objects such as `public.items`, `public.profiles`, `public.categories`, and `public.item_images` already exist.

Therefore, **a brand-new Teswa database cannot yet be truthfully reconstructed from the current migration directory alone**. Do not claim that `supabase db reset` from an empty project is supported until the baseline step below is completed.

## Required baseline completion

From a secured developer/CI environment with the Supabase CLI and production project credentials:

1. checkout the reconciled `main` branch;
2. run `supabase link --project-ref <production-project-ref>`;
3. inspect `supabase migration list` and confirm Git/remote versions agree;
4. capture the pre-May foundational schema with an authoritative `supabase db pull`/schema baseline workflow rather than hand-writing a partial approximation;
5. test the resulting history on an isolated empty/local project with `supabase db reset`;
6. compare tables, functions, policies, storage policies, indexes, types, and triggers against production;
7. only then declare fresh bootstrap supported.

Do not run a destructive reset against production.

## Pending SQL

`supabase/pending/` is an archive for reviewed-but-unapplied database SQL. Files there are deliberately outside the migration path and must never be treated as deployed. A pending change must be reissued with a fresh migration timestamp when its owning PR is ready to ship it.

## Release invariant

Before merging a database PR, the expected invariant is:

- existing applied migrations are immutable in intent;
- Git migration filename/version matches production history for already-deployed changes;
- new migrations have not been silently pre-applied outside the reviewed workflow;
- all public tables that hold application data retain intentional RLS;
- privileged `SECURITY DEFINER` functions retain explicit grants and authorization checks;
- any deployment drift is documented and reconciled before the next schema release.
