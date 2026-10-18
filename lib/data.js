import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchRows } from './supabase';
import { loadCache, saveCache } from './cache';

// Loads rows for a screen: from Supabase when it can, otherwise from the cache
// of the last successful load.
//
//   source: 'loading'      first load in progress (rows may already be the cached ones)
//           'live'         fresh from Supabase
//           'cached'       Supabase failed; rows are the last known ones (see updatedAt)
//           'error'        Supabase failed and there is nothing cached
//           'unconfigured' this build has no database set
//
// `cacheKey` must change whenever the question changes (e.g. include the date).
export function useRemote(cacheKey, query) {
  const [state, setState] = useState({ rows: null, source: 'loading', updatedAt: null, message: null });
  const [refreshing, setRefreshing] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(async () => {
    const result = await fetchRows((client) => queryRef.current(client));
    if (result.source === 'live') {
      const now = Date.now();
      saveCache(cacheKey, result.rows, now);
      setState({ rows: result.rows, source: 'live', updatedAt: now, message: null });
      return;
    }
    const cached = await loadCache(cacheKey);
    if (cached) {
      setState({ rows: cached.data, source: 'cached', updatedAt: cached.savedAt, message: result.message });
    } else {
      setState({ rows: null, source: result.source, updatedAt: null, message: result.message });
    }
  }, [cacheKey]);

  // Every time the tab is shown: show the cached rows straight away (if this is
  // the first load), then refresh from the server.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const cached = await loadCache(cacheKey);
        if (active && cached) {
          setState((prev) =>
            prev.rows ? prev : { rows: cached.data, source: 'loading', updatedAt: cached.savedAt, message: null }
          );
        }
        if (active) await load();
      })();
      return () => {
        active = false;
      };
    }, [cacheKey, load])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { ...state, refreshing, refresh };
}
