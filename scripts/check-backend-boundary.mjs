import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['app', 'components', 'lib'];
const providerAdapterPrefix = 'lib/backend/adapters/supabase/';

const legacyDirectClientImports = new Set([
  'app/(auth)/profile-setup.tsx',
  'app/(tabs)/messages.tsx',
  'app/contextual/[id].tsx',
  'app/deal/[id].tsx',
  'components/profile/ProfileConnectionsScreen.tsx',
  'lib/account-deletion.ts',
  'lib/admin-reports.ts',
  'lib/admin.ts',
  'lib/analytics.ts',
  'lib/badges.ts',
  'lib/chat/supabase-direct-chat.ts',
  'lib/city-pulse.ts',
  'lib/contextual-conversations.ts',
  'lib/deals.ts',
  'lib/direct-messages.ts',
  'lib/direct-privacy.ts',
  'lib/dolab/index.ts',
  'lib/dolab/media-item-link.ts',
  'lib/dolab/note-media-link.ts',
  'lib/dolab/upload.ts',
  'lib/edit-listing-images.ts',
  'lib/edit-listing.ts',
  'lib/exchange-item-summaries.ts',
  'lib/item-likes.ts',
  'lib/item-video-discovery.ts',
  'lib/item-video-presence.ts',
  'lib/listing-lifecycle.ts',
  'lib/marketplace-items.ts',
  'lib/messages.ts',
  'lib/motion-interest.ts',
  'lib/motion-video-drops.ts',
  'lib/my-listings.ts',
  'lib/notification-preferences.ts',
  'lib/notifications.ts',
  'lib/offers.ts',
  'lib/people.ts',
  'lib/personal-living-world.ts',
  'lib/policy-acceptance.ts',
  'lib/profile-images.ts',
  'lib/profiles.ts',
  'lib/publish-item.ts',
  'lib/pulse-video-viewer.ts',
  'lib/push-notifications.ts',
  'lib/reports.ts',
  'lib/reviews.ts',
  'lib/stories.ts',
  'lib/story-discovery.ts',
  'lib/story-likes.ts',
  'lib/story-views.ts',
  'lib/trust-metrics.ts',
  'lib/unread-badges.tsx',
  'lib/user-blocks.ts',
  'lib/user-follows.ts',
]);

const legacyProviderTypeImports = new Set([
  'lib/notification-preferences.ts',
  'lib/notifications.ts',
  'lib/supabase/client.ts',
]);

const legacyDirectSupabaseEnvReads = new Set([
  'lib/stories.ts',
  'lib/supabase/client.ts',
]);

const legacyDirectStorageAccess = new Set([
  'lib/chat/supabase-direct-chat.ts',
  'lib/contextual-conversations.ts',
  'lib/deals.ts',
  'lib/direct-messages.ts',
  'lib/dolab/index.ts',
  'lib/dolab/upload.ts',
  'lib/edit-listing-images.ts',
  'lib/item-videos.ts',
  'lib/listing-lifecycle.ts',
  'lib/publish-item.ts',
  'lib/stories.ts',
]);


function normalize(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [absolute];
  });
}

const violations = [];
let directClientImportCount = 0;

for (const sourceRoot of sourceRoots) {
  for (const absolutePath of walk(path.join(root, sourceRoot))) {
    const relativePath = normalize(path.relative(root, absolutePath));
    const content = fs.readFileSync(absolutePath, 'utf8');
    const isAdapter = relativePath.startsWith(providerAdapterPrefix);

    if (content.includes('@/lib/supabase/client')) {
      directClientImportCount += 1;
      if (!isAdapter && !legacyDirectClientImports.has(relativePath)) {
        violations.push(`${relativePath}: new direct @/lib/supabase/client dependency`);
      }
    }

    if (content.includes('@supabase/supabase-js')) {
      if (!isAdapter && !relativePath.startsWith('lib/supabase/') && !legacyProviderTypeImports.has(relativePath)) {
        violations.push(`${relativePath}: new direct @supabase/supabase-js dependency`);
      }
    }

    if (content.includes('supabase.auth.')) {
      if (!isAdapter && !relativePath.startsWith('lib/supabase/')) {
        violations.push(`${relativePath}: feature-level Supabase Auth access must go through AuthContract`);
      }
    }

    if (content.includes('supabase.storage')) {
      if (!isAdapter && !legacyDirectStorageAccess.has(relativePath)) {
        violations.push(`${relativePath}: new direct Supabase Storage access must go through MediaStorageContract`);
      }
    }

    if (content.includes('EXPO_PUBLIC_SUPABASE_URL') || content.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
      if (!isAdapter && !legacyDirectSupabaseEnvReads.has(relativePath)) {
        violations.push(`${relativePath}: new direct Supabase environment dependency`);
      }
    }
  }
}

const staleLegacyClientImports = [...legacyDirectClientImports].filter((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return true;
  return !fs.readFileSync(absolutePath, 'utf8').includes('@/lib/supabase/client');
});

if (staleLegacyClientImports.length > 0) {
  violations.push(...staleLegacyClientImports.map((relativePath) => `${relativePath}: stale legacy allowlist entry; remove it so coupling debt cannot grow back`));
}

const staleLegacyStorageAccess = [...legacyDirectStorageAccess].filter((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return true;
  return !fs.readFileSync(absolutePath, 'utf8').includes('supabase.storage');
});

if (staleLegacyStorageAccess.length > 0) {
  violations.push(...staleLegacyStorageAccess.map((relativePath) => `${relativePath}: stale Storage allowlist entry; remove it after MediaStorageContract migration`));
}

if (violations.length > 0) {
  console.error('[backend-boundary] Provider boundary violation detected:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`[backend-boundary] OK. Legacy direct client imports are ratcheted at ${directClientImportCount}; new provider coupling is blocked.`);
