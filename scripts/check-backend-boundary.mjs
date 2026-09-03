import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['app', 'components', 'lib'];
const providerAdapterPrefix = 'lib/backend/adapters/supabase/';

const legacyDirectClientImports = new Set([
  'lib/account-deletion.ts',
  'lib/admin-reports.ts',
  'lib/admin.ts',
  'lib/analytics.ts',
  'lib/city-pulse.ts',
  'lib/dolab/index.ts',
  'lib/dolab/media-item-link.ts',
  'lib/dolab/note-media-link.ts',
  'lib/dolab/upload.ts',
  'lib/messages.ts',
  'lib/motion-video-drops.ts',
  'lib/policy-acceptance.ts',
  'lib/reports.ts',
  'lib/reviews.ts',
  'lib/stories.ts',
  'lib/story-discovery.ts',
  'lib/story-likes.ts',
  'lib/story-views.ts',
  'lib/chat/supabase-direct-chat.ts',
  'lib/contextual-conversations.ts',
]);

const legacyProviderTypeImports = new Set([
  'lib/supabase/client.ts',
]);

const legacyDirectSupabaseEnvReads = new Set([
  'lib/supabase/client.ts',
]);

const legacyDirectStorageAccess = new Set([
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

    if (relativePath === 'lib/offers.ts') {
      const forbiddenOfferLifecycleTokens = [
        ".from('offers')",
        ".from('offer_events')",
        ".from('swap_deals')",
        "rpc('mark_offer_thinking'",
        "rpc('soft_reject_offer'",
        "rpc('accept_offer'",
      ];
      for (const token of forbiddenOfferLifecycleTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: offer lifecycle provider access must stay behind OfferLifecycleContract (${token})`);
        }
      }
    }

    if (relativePath === 'lib/deals.ts') {
      const forbiddenDealLifecycleTokens = [
        ".from('swap_deals')",
        ".from('deal_confirmations')",
        ".from('deal_messages')",
        ".from('reviews')",
        "rpc('mark_deal_thread_read'",
        "rpc('complete_deal_if_ready'",
      ];
      for (const token of forbiddenDealLifecycleTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: deal lifecycle provider access must stay behind DealLifecycleContract (${token})`);
        }
      }
    }

    if (
      content.includes('postgres_changes')
      || content.includes('.channel(')
      || content.includes('removeChannel(')
    ) {
      if (!isAdapter && !relativePath.startsWith('lib/supabase/')) {
        violations.push(`${relativePath}: provider Realtime access must go through MessagingRealtimeContract`);
      }
    }

    if ([
      'lib/notifications.ts',
      'lib/notification-preferences.ts',
      'lib/push-notifications.ts',
      'lib/unread-badges.tsx',
      'lib/offers.ts',
      'lib/deals.ts',
    ].includes(relativePath)) {
      const forbiddenNotificationTokens = [
        ".from('notifications')",
        "rpc('get_my_notification_preferences'",
        "rpc('update_my_notification_preferences'",
        "rpc('set_my_notification_timezone'",
        "rpc('register_push_device'",
        "rpc('disable_my_push_device'",
        "rpc('create_notification'",
        "rpc('get_unread_deal_messages_count'",
      ];
      for (const token of forbiddenNotificationTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: notification provider access must stay behind Teswa backend contracts (${token})`);
        }
      }
    }

    if ([
      'app/(auth)/profile-setup.tsx',
      'components/profile/ProfileConnectionsScreen.tsx',
      'lib/people.ts',
      'lib/user-follows.ts',
      'lib/user-blocks.ts',
      'lib/trust-metrics.ts',
      'lib/badges.ts',
      'lib/direct-privacy.ts',
      'lib/profile-images.ts',
    ].includes(relativePath)) {
      const forbiddenProfileTokens = [
        ".from('profiles')",
        ".from('user_blocks')",
        "rpc('get_user_follow_state'",
        "rpc('follow_user'",
        "rpc('unfollow_user'",
        "rpc('get_profile_followers'",
        "rpc('get_profile_following'",
        "rpc('get_user_block_state'",
        "rpc('get_user_trust_metrics'",
        "rpc('get_my_trust_metrics'",
        "rpc('get_user_badges'",
        "rpc('get_my_badges'",
        "rpc('refresh_my_badges'",
      ];
      for (const token of forbiddenProfileTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: profile/social provider access must stay behind ProfileSocialContract (${token})`);
        }
      }
    }

    if ([
      'lib/item-likes.ts',
      'lib/my-listings.ts',
      'lib/listing-lifecycle.ts',
      'lib/edit-listing.ts',
      'lib/edit-listing-images.ts',
      'lib/publish-item.ts',
      'lib/item-videos.ts',
    ].includes(relativePath)) {
      const forbiddenMarketplaceTokens = [
        ".from('items')",
        ".from('item_images')",
        ".from('item_wanted_tags')",
        ".from('item_videos')",
        ".from('item_likes')",
        ".from('categories')",
        "rpc('archive_owned_listing_if_safe'",
        "rpc('reactivate_owned_archived_listing'",
        "rpc('delete_owned_archived_listing_if_safe'",
      ];
      for (const token of forbiddenMarketplaceTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: marketplace provider access must stay behind MarketplaceCoreContract (${token})`);
        }
      }
    }

    if ([
      'lib/exchange-item-summaries.ts',
      'lib/item-video-discovery.ts',
      'lib/item-video-presence.ts',
      'lib/motion-interest.ts',
      'lib/pulse-video-viewer.ts',
      'lib/personal-living-world.ts',
    ].includes(relativePath)) {
      const forbiddenDiscoveryTokens = [
        ".from('items')",
        ".from('item_images')",
        ".from('categories')",
        ".from('profiles')",
        ".from('item_videos')",
        ".from('marketplace_items')",
        "rpc('get_public_moving_items'",
      ];
      for (const token of forbiddenDiscoveryTokens) {
        if (content.includes(token)) {
          violations.push(`${relativePath}: marketplace discovery provider access must stay behind MarketplaceCoreContract (${token})`);
        }
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
