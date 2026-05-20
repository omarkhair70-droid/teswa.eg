type MemoryStore = Map<string, string>;

const memoryStore: MemoryStore = new Map();

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const supabaseAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const storage = getWebStorage();
    if (!storage) {
      return memoryStore.get(key) ?? null;
    }

    try {
      return storage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);

    const storage = getWebStorage();
    if (!storage) return;

    try {
      storage.setItem(key, value);
    } catch {
      // no-op fallback to in-memory store
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);

    const storage = getWebStorage();
    if (!storage) return;

    try {
      storage.removeItem(key);
    } catch {
      // no-op fallback when localStorage is unavailable
    }
  },
};
