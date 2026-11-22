export interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  livekitUrl: string;
}

export interface LiveKitServerEnv {
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads public client-safe environment variables using direct literal dot
 * notation (`process.env.NEXT_PUBLIC_*`) so Next.js can inline them safely
 * into browser bundles when defined at build time.
 */
export function getPublicEnv(): PublicEnv {
  return {
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    livekitUrl: (process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "").trim(),
  };
}

/**
 * Returns true when both public Supabase client keys are non-empty.
 */
export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

/**
 * Client-safe check returning true when NEXT_PUBLIC_LIVEKIT_URL is configured.
 */
export function isLiveKitPublicConfigured(): boolean {
  const { livekitUrl } = getPublicEnv();
  return livekitUrl.length > 0;
}

/**
 * Server-only helper returning LiveKit signing credentials, or null when missing.
 */
export function getLiveKitServerEnv(): LiveKitServerEnv | null {
  const apiKey = (process.env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET ?? "").trim();
  if (!apiKey || !apiSecret) {
    return null;
  }
  return { apiKey, apiSecret };
}

/**
 * Server-only check verifying LIVEKIT_API_KEY and LIVEKIT_API_SECRET are both set.
 */
export function isLiveKitServerConfigured(): boolean {
  return getLiveKitServerEnv() !== null;
}

/**
 * Returns true when NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
 * are all configured. Intended to be called on the server (and in unit tests) and
 * passed down as a boolean prop to client components so SSR and hydration never diverge.
 */
export function isLiveKitConfigured(): boolean {
  return isLiveKitPublicConfigured() && isLiveKitServerConfigured();
}
