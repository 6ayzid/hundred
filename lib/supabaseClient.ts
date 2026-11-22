import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv, isSupabaseConfigured } from '@/lib/env';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedAnonKey = '';

/**
 * Lazily creates and returns a browser-side SupabaseClient singleton when
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured.
 *
 * When unconfigured, returns `null` immediately without calling `createClient`
 * or initiating any network / WebSocket connections.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (
    cachedClient !== null &&
    cachedUrl === supabaseUrl &&
    cachedAnonKey === supabaseAnonKey
  ) {
    return cachedClient;
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
  cachedUrl = supabaseUrl;
  cachedAnonKey = supabaseAnonKey;

  return cachedClient;
}

/**
 * Alias for `getSupabaseBrowserClient()` for convenience across callers and tests.
 */
export function getSupabaseClient(): SupabaseClient | null {
  return getSupabaseBrowserClient();
}

/**
 * Resets the cached Supabase client singleton (intended for unit tests).
 */
export function resetSupabaseBrowserClientForTests(): void {
  cachedClient = null;
  cachedUrl = '';
  cachedAnonKey = '';
}

/**
 * Alias for `resetSupabaseBrowserClientForTests()`.
 */
export function resetSupabaseClientForTests(): void {
  resetSupabaseBrowserClientForTests();
}
