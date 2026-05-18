import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { fetchMarketplaceItemsPage } from '@/lib/marketplace-items';
import { fetchMovingItems } from '@/lib/motion-interest';
import { pruneExpiredOfflineJsonCache } from '@/lib/offline-cache';
import { writeMarketplaceFirstPageCache } from '@/lib/offline-marketplace-cache';
import { writeMotionPublicFeedCache } from '@/lib/offline-motion-cache';
import { writePeopleDefaultDirectoryCache } from '@/lib/offline-people-cache';
import { fetchPeopleDirectory } from '@/lib/people';
import { fetchStoryDiscoveryItems } from '@/lib/story-discovery';

export const TESWA_BACKGROUND_MEMORY_REFRESH_TASK = 'teswa-background-memory-refresh-v1';

export async function refreshPublicOfflineMemoryInBackground(): Promise<{
  marketplaceRefreshed: boolean;
  peopleRefreshed: boolean;
  motionRefreshed: boolean;
}> {
  let marketplaceRefreshed = false;
  let peopleRefreshed = false;
  let motionRefreshed = false;

  try {
    await pruneExpiredOfflineJsonCache();
  } catch {
    // keep going; prune should not block downstream refresh attempts
  }

  try {
    const page = await fetchMarketplaceItemsPage({ offset: 0 });
    await writeMarketplaceFirstPageCache(page);
    marketplaceRefreshed = true;
  } catch {
    if (__DEV__) {
      console.warn('[background-memory-refresh] marketplace refresh failed');
    }
  }

  try {
    const entries = await fetchPeopleDirectory({ query: '' });
    await writePeopleDefaultDirectoryCache(entries);
    peopleRefreshed = true;
  } catch {
    if (__DEV__) {
      console.warn('[background-memory-refresh] people refresh failed');
    }
  }

  try {
    const [movingItems, storyItems] = await Promise.all([
      fetchMovingItems({ limit: 12 }),
      fetchStoryDiscoveryItems({ limit: 12 }),
    ]);
    await writeMotionPublicFeedCache({ movingItems, storyItems });
    motionRefreshed = true;
  } catch {
    if (__DEV__) {
      console.warn('[background-memory-refresh] motion refresh failed');
    }
  }

  return {
    marketplaceRefreshed,
    peopleRefreshed,
    motionRefreshed,
  };
}

TaskManager.defineTask(TESWA_BACKGROUND_MEMORY_REFRESH_TASK, async () => {
  try {
    await refreshPublicOfflineMemoryInBackground();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    if (__DEV__) {
      console.warn('[background-memory-refresh] task execution failed unexpectedly');
    }
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function isTeswaBackgroundMemoryRefreshRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(TESWA_BACKGROUND_MEMORY_REFRESH_TASK);
  } catch {
    return false;
  }
}

export async function ensureTeswaBackgroundMemoryRefreshRegistered(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TESWA_BACKGROUND_MEMORY_REFRESH_TASK);
    if (isRegistered) {
      return;
    }

    await BackgroundTask.registerTaskAsync(TESWA_BACKGROUND_MEMORY_REFRESH_TASK, {
      minimumInterval: 60,
    });
  } catch {
    if (__DEV__) {
      console.warn('[background-memory-refresh] registration failed');
    }
  }
}
