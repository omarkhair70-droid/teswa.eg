import type {
  DetailedProfileBadge,
  DetailedTrustMetrics,
  DirectMessagePrivacy,
  ProfileSocialContract,
  TeswaProfile,
  TrustLevelKey,
} from '@/lib/backend/contracts/profile';
import { supabase } from '@/lib/supabase/client';

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city: string | null;
  area: string | null;
  profile_tagline: string | null;
  successful_swaps_count: number | null;
  response_rate: number | null;
  created_at: string | null;
};

const PROFILE_SELECT =
  'id, display_name, username, bio, avatar_url, cover_url, city, area, profile_tagline, successful_swaps_count, response_rate, created_at';

function mapProfile(row: ProfileRow): TeswaProfile {
  return {
    id: row.id,
    displayName: row.display_name ?? null,
    username: row.username ?? null,
    bio: row.bio ?? null,
    avatarUrl: row.avatar_url ?? null,
    coverUrl: row.cover_url ?? null,
    city: row.city ?? null,
    area: row.area ?? null,
    profileTagline: row.profile_tagline ?? null,
    successfulSwapsCount: row.successful_swaps_count ?? null,
    responseRate: row.response_rate ?? null,
    createdAt: row.created_at ?? null,
  };
}

async function getProfile(profileId: string): Promise<TeswaProfile | null> {
  const normalizedId = profileId.trim();
  if (!normalizedId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

function normalizeTrustLevelKey(value: unknown): TrustLevelKey {
  if (
    value === 'rising_swapper'
    || value === 'reliable_swapper'
    || value === 'trusted_swapper'
  ) {
    return value;
  }
  return 'new_swapper';
}

function mapTrustMetrics(row: any): DetailedTrustMetrics {
  return {
    userId: row.user_id as string,
    successfulSwapsCount: Number(row.successful_swaps_count ?? 0),
    completedDealsCount: Number(row.completed_deals_count ?? 0),
    cancelledDealsCount: Number(row.cancelled_deals_count ?? 0),
    totalReviewsReceived: Number(row.total_reviews_received ?? 0),
    averageRating: typeof row.average_rating === 'number' ? row.average_rating : null,
    clearDescriptionCount: Number(row.clear_description_count ?? 0),
    goodCommunicationCount: Number(row.good_communication_count ?? 0),
    onTimeCount: Number(row.on_time_count ?? 0),
    respectfulSwapperCount: Number(row.respectful_swapper_count ?? 0),
    responseRate: typeof row.response_rate === 'number' ? row.response_rate : null,
    avgResponseTimeMinutes:
      typeof row.avg_response_time_minutes === 'number'
        ? row.avg_response_time_minutes
        : null,
    trustLevelKey: normalizeTrustLevelKey(row.trust_level_key),
    trustScore: Number(row.trust_score ?? 0),
  };
}

function mapDetailedBadge(row: any): DetailedProfileBadge {
  return {
    badgeKey: row.badge_key as string,
    labelAr: row.label_ar as string,
    descriptionAr: row.description_ar as string,
    category: row.category as string,
    iconName: (row.icon_name as string | null) ?? null,
    priority: Number(row.priority ?? 100),
    awardedAt: row.awarded_at as string,
  };
}

export function createSupabaseProfileAdapter(): ProfileSocialContract {
  return {
    getMine: getProfile,
    getPublic: getProfile,

    async setupMine(input) {
      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: input.userId,
            display_name: input.displayName,
            username: input.username,
          },
          { onConflict: 'id' },
        );

      if (error?.code === '23505') {
        return {
          ok: false,
          reason: 'username_taken',
          message: 'Username is already in use.',
          cause: error,
        };
      }
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async getDirectMessagePrivacy(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('direct_message_privacy')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      const value = data?.direct_message_privacy;
      if (value === 'followers_only' || value === 'no_one') return value;
      return 'everyone' satisfies DirectMessagePrivacy;
    },

    async updateDirectMessagePrivacy(userId, value) {
      const { error } = await supabase
        .from('profiles')
        .update({ direct_message_privacy: value })
        .eq('id', userId);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: undefined };
    },

    async setProfileImageUrl(userId, kind, imageUrl) {
      const payload = kind === 'avatar'
        ? { avatar_url: imageUrl, updated_at: new Date().toISOString() }
        : { cover_url: imageUrl, updated_at: new Date().toISOString() };

      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      if (!data) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Profile was not found or is not writable.',
        };
      }
      return { ok: true, data: undefined };
    },

    async updateMine(input) {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: input.displayName,
          username: input.username,
          profile_tagline: input.profileTagline ?? null,
          city: input.city ?? null,
          area: input.area ?? null,
          bio: input.bio ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.userId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error?.code === '23505') {
        return {
          ok: false,
          reason: 'username_taken',
          message: 'Username is already in use.',
          cause: error,
        };
      }

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      if (!data) {
        return {
          ok: false,
          reason: 'not_found',
          message: 'Profile was not found or is not writable.',
        };
      }

      return { ok: true, data: mapProfile(data as ProfileRow) };
    },

    async listPeople(input) {
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.max(1, Math.floor(input.pageSize));
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      const query = (input.query ?? '').trim();

      let profilesQuery = supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, cover_url, profile_tagline, bio, city, area, successful_swaps_count, response_rate, created_at')
        .not('username', 'is', null)
        .order('successful_swaps_count', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to);

      if (query) {
        const pattern = `%${query}%`;
        profilesQuery = profilesQuery.or(
          `display_name.ilike.${pattern},username.ilike.${pattern},city.ilike.${pattern},area.ilike.${pattern}`,
        );
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;
      if (!profiles?.length) return { entries: [], hasMore: false };

      const hasMore = profiles.length > pageSize;
      const visibleProfiles = profiles.slice(0, pageSize);
      const profileIds = visibleProfiles.map((profile) => profile.id as string);

      const { data: activeItems, error: activeItemsError } = await supabase
        .from('items')
        .select('owner_id,id')
        .eq('status', 'active')
        .in('owner_id', profileIds);

      if (activeItemsError && __DEV__) {
        console.warn('[profile-adapter] people active item count failed', activeItemsError);
      }

      const activeCountByOwner = new Map<string, number>();
      for (const item of activeItems ?? []) {
        const ownerId = item.owner_id as string | null;
        if (!ownerId) continue;
        activeCountByOwner.set(ownerId, (activeCountByOwner.get(ownerId) ?? 0) + 1);
      }

      const normalize = (value: unknown) => {
        const clean = typeof value === 'string' ? value.trim() : '';
        return clean || null;
      };

      return {
        entries: visibleProfiles.map((profile) => {
          const username = normalize(profile.username) ?? '';
          const displayName = (normalize(profile.display_name) ?? username) || 'مستخدم';
          return {
            id: profile.id as string,
            displayName,
            username,
            avatarUrl: normalize(profile.avatar_url),
            coverUrl: normalize(profile.cover_url),
            profileTagline: normalize(profile.profile_tagline),
            bio: normalize(profile.bio),
            city: normalize(profile.city),
            area: normalize(profile.area),
            successfulSwapsCount: Number(profile.successful_swaps_count ?? 0),
            responseRate:
              typeof profile.response_rate === 'number'
                ? profile.response_rate
                : null,
            activeItemsCount: activeCountByOwner.get(profile.id as string) ?? 0,
            createdAt: (profile.created_at as string | null) ?? null,
          };
        }),
        hasMore,
      };
    },

    async getFollowState(_viewerId, profileId) {
      const { data, error } = await supabase.rpc('get_user_follow_state', {
        p_target_user_id: profileId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return {
        followingByMe: Boolean(row?.following_by_me),
        followsMe: Boolean(row?.follows_me),
        mutual: Boolean(row?.mutual),
        followerCount: Number(row?.follower_count ?? 0),
        followingCount: Number(row?.following_count ?? 0),
      };
    },

    async follow(_viewerId, profileId) {
      const { data, error } = await supabase.rpc('follow_user', {
        p_followed_user_id: profileId,
      });
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.ok) {
        return {
          ok: false,
          reason: 'unknown',
          message: row?.message ?? 'Follow failed.',
          cause: row,
        };
      }
      return {
        ok: true,
        data: {
          message: row.message ?? 'Followed.',
          code: typeof row.code === 'string' ? row.code : null,
        },
      };
    },

    async unfollow(_viewerId, profileId) {
      const { data, error } = await supabase.rpc('unfollow_user', {
        p_followed_user_id: profileId,
      });
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.ok) {
        return {
          ok: false,
          reason: 'unknown',
          message: row?.message ?? 'Unfollow failed.',
          cause: row,
        };
      }
      return {
        ok: true,
        data: {
          message: row.message ?? 'Unfollowed.',
          code: typeof row.code === 'string' ? row.code : null,
        },
      };
    },

    async listConnections(profileId, mode, limit = 50) {
      const rpcName = mode === 'followers'
        ? 'get_profile_followers'
        : 'get_profile_following';
      const { data, error } = await supabase.rpc(rpcName, {
        p_profile_user_id: profileId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        profileId: row.profile_id as string,
        displayName: (row.display_name as string | null) ?? null,
        username: (row.username as string | null) ?? null,
        avatarUrl: (row.avatar_url as string | null) ?? null,
        city: (row.city as string | null) ?? null,
        area: (row.area as string | null) ?? null,
      }));
    },

    async getBlockState(viewerId, profileId) {
      if (viewerId === profileId) {
        return {
          blockedByMe: false,
          blockedMe: false,
          isBlockedEitherDirection: false,
        };
      }
      const { data, error } = await supabase.rpc('get_user_block_state', {
        p_target_user_id: profileId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return {
        blockedByMe: Boolean(row?.blocked_by_me),
        blockedMe: Boolean(row?.blocked_me),
        isBlockedEitherDirection: Boolean(row?.is_blocked_either_direction),
      };
    },

    async listBlocked(viewerId) {
      const { data: rows, error: blockError } = await supabase
        .from('user_blocks')
        .select('blocked_user_id,created_at')
        .eq('blocker_id', viewerId)
        .order('created_at', { ascending: false });
      if (blockError) throw blockError;
      if (!rows?.length) return [];

      const ids = rows.map((row) => row.blocked_user_id as string).filter(Boolean);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .in('id', ids);
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
      return rows.map((row) => {
        const id = row.blocked_user_id as string;
        const profile = profileMap.get(id);
        return {
          id,
          displayName: (profile?.display_name as string | null | undefined) ?? null,
          username: (profile?.username as string | null | undefined) ?? null,
          avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
          blockedAt: (row.created_at as string | null | undefined) ?? null,
        };
      });
    },

    async block(viewerId, profileId) {
      const { error } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: viewerId, blocked_user_id: profileId });
      if (error?.code === '23505') {
        return {
          ok: true,
          data: { message: 'Already blocked.', code: 'already_blocked' },
        };
      }
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return { ok: true, data: { message: 'Blocked.', code: null } };
    },

    async unblock(viewerId, profileId) {
      const { error, count } = await supabase
        .from('user_blocks')
        .delete({ count: 'exact' })
        .eq('blocker_id', viewerId)
        .eq('blocked_user_id', profileId);
      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }
      return {
        ok: true,
        data: {
          message: count ? 'Unblocked.' : 'Not blocked.',
          code: count ? null : 'not_blocked',
        },
      };
    },

    async getTrustMetrics(profileId) {
      const { data, error } = await supabase.rpc('get_user_trust_metrics', {
        p_user_id: profileId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return row ? mapTrustMetrics(row) : null;
    },

    async getMyTrustMetrics() {
      const { data, error } = await supabase.rpc('get_my_trust_metrics');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return row ? mapTrustMetrics(row) : null;
    },

    async getBadges(profileId) {
      const { data, error } = await supabase.rpc('get_user_badges', {
        p_user_id: profileId,
      });
      if (error) throw error;
      return Array.isArray(data) ? data.map(mapDetailedBadge) : [];
    },

    async getMyBadges() {
      const { data, error } = await supabase.rpc('get_my_badges');
      if (error) throw error;
      return Array.isArray(data) ? data.map(mapDetailedBadge) : [];
    },

    async refreshMyBadges() {
      const { data, error } = await supabase.rpc('refresh_my_badges');
      if (error) throw error;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
      const awarded = (data as { awarded_badges?: unknown }).awarded_badges;
      return Array.isArray(awarded)
        ? awarded.filter((value): value is string => typeof value === 'string')
        : [];
},
  };
}
