import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const CACHE_KEY = 'REACT_QUERY_OFFLINE_CACHE';
const THROTTLE_MS = 1500;

let pending: PersistedClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const flush = async () => {
  timer = null;
  const client = pending;
  pending = null;
  if (!client) return;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(client));
  } catch (e) {
    console.warn('Failed to persist react-query cache:', e);
  }
};

/**
 * AsyncStorage persister for the query cache.
 *
 * persistQueryClient calls persistClient on every cache event (each fetch
 * start, success and observer change). The previous inline persister
 * stringified and wrote the whole cache on each of those, which blocked the JS
 * thread during sign-in and on busy queue screens. Writes are now coalesced
 * into at most one every THROTTLE_MS, always with the latest snapshot.
 */
export const queryPersister: Persister = {
  persistClient: client => {
    pending = client;
    if (!timer) {
      timer = setTimeout(flush, THROTTLE_MS);
    }
  },
  restoreClient: async () => {
    try {
      const cache = await AsyncStorage.getItem(CACHE_KEY);
      return cache ? (JSON.parse(cache) as PersistedClient) : undefined;
    } catch (e) {
      console.warn('Failed to restore react-query cache:', e);
      return undefined;
    }
  },
  removeClient: async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (e) {
      console.warn('Failed to remove react-query cache:', e);
    }
  },
};
