import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const snapshotPath = path.join(root, 'supabase', 'PRODUCTION_MIGRATION_HISTORY.txt');

const migrationFilePattern = /^(\d{14})_(.+)\.sql$/;
const snapshotEntryPattern = /^(\d{14})_(.+)$/;

function fail(message, details = []) {
  console.error(`\n[db-history] ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exitCode = 1;
}

const filenames = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const repoEntries = [];
const repoByVersion = new Map();

for (const filename of filenames) {
  const match = filename.match(migrationFilePattern);
  if (!match) {
    fail('Migration filename must use <14-digit-version>_<name>.sql', [filename]);
    continue;
  }

  const [, version, name] = match;
  const canonical = `${version}_${name}`;
  repoEntries.push({ version, name, canonical, filename });

  const existing = repoByVersion.get(version);
  if (existing) {
    fail('Duplicate migration version', [existing.filename, filename]);
  } else {
    repoByVersion.set(version, { version, name, canonical, filename });
  }
}

const snapshotText = await readFile(snapshotPath, 'utf8');
const snapshotEntries = snapshotText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const match = line.match(snapshotEntryPattern);
    if (!match) {
      fail('Invalid production migration snapshot entry', [line]);
      return null;
    }
    const [, version, name] = match;
    return { version, name, canonical: `${version}_${name}` };
  })
  .filter(Boolean);

const snapshotByVersion = new Map();
for (const entry of snapshotEntries) {
  const existing = snapshotByVersion.get(entry.version);
  if (existing) {
    fail('Duplicate production migration version in snapshot', [existing.canonical, entry.canonical]);
  } else {
    snapshotByVersion.set(entry.version, entry);
  }
}

for (const production of snapshotEntries) {
  const repo = repoByVersion.get(production.version);
  if (!repo) {
    fail('Production migration is missing from supabase/migrations', [production.canonical]);
    continue;
  }
  if (repo.name !== production.name) {
    fail('Production migration name does not match Git', [
      `production: ${production.canonical}`,
      `git:        ${repo.canonical}`,
    ]);
  }
}

const latestProductionVersion = snapshotEntries.reduce(
  (latest, entry) => (entry.version > latest ? entry.version : latest),
  '00000000000000',
);

for (const repo of repoEntries) {
  const production = snapshotByVersion.get(repo.version);
  if (production) continue;

  if (repo.version <= latestProductionVersion) {
    fail('Unapplied migration is back-dated behind production history', [
      `${repo.canonical} <= latest production ${latestProductionVersion}`,
      'Use a fresh timestamp for new/unapplied migrations. Keep deferred SQL under supabase/pending/.',
    ]);
  }
}

if (!process.exitCode) {
  const unappliedCount = repoEntries.filter((entry) => !snapshotByVersion.has(entry.version)).length;
  console.log('[db-history] OK');
  console.log(`[db-history] production migrations: ${snapshotEntries.length}`);
  console.log(`[db-history] repository migrations: ${repoEntries.length}`);
  console.log(`[db-history] queued unapplied migrations: ${unappliedCount}`);
  console.log(`[db-history] latest production version: ${latestProductionVersion}`);
}
