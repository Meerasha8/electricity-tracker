import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// The database is baked into the app when it is built: these two values come
// from the .env file (see .env.example) and are inlined by Expo at build time.
// The key is the public "anon / publishable" key: it can only READ the
// hourly/daily/monthly tables (row-level security enforces that).
const URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = (process.env.EXPO_PUBLIC_SUPABASE_KEY || '').trim();

const isConfigured = Boolean(URL && KEY);

let client = null;
function getClient() {
  if (!isConfigured) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      // Read-only access with a fixed key: no sessions to store or refresh.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

const TIMEOUT_MS = 10000;

// Runs `query(client)` and reports what happened. Never throws.
//   source: 'live' | 'error' | 'unconfigured'
//   rows:   the rows when source is 'live' (an empty array when there are none)
export async function fetchRows(query) {
  const supabase = getClient();
  if (!supabase) {
    return {
      source: 'unconfigured',
      message: 'This build has no database set. Add the Supabase URL and key to .env and rebuild.',
    };
  }
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('The server took too long to answer')), TIMEOUT_MS)
    );
    const { data, error } = await Promise.race([query(supabase), timeout]);
    if (error) return { source: 'error', message: error.message };
    return { source: 'live', rows: data || [] };
  } catch (e) {
    return { source: 'error', message: e?.message || String(e) };
  }
}
