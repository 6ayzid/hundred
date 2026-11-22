import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLiveKitServerEnv,
  getPublicEnv,
  isLiveKitConfigured,
  isLiveKitPublicConfigured,
  isLiveKitServerConfigured,
  isSupabaseConfigured,
} from "@/lib/env";

const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/env", () => {
  it("returns empty strings, null server env, and false flags when all env vars are unset", () => {
    for (const key of REQUIRED_ENV_KEYS) {
      vi.stubEnv(key, "");
    }

    expect(getPublicEnv()).toEqual({
      supabaseUrl: "",
      supabaseAnonKey: "",
      livekitUrl: "",
    });
    expect(isSupabaseConfigured()).toBe(false);
    expect(isLiveKitPublicConfigured()).toBe(false);
    expect(isLiveKitServerConfigured()).toBe(false);
    expect(isLiveKitConfigured()).toBe(false);
    expect(getLiveKitServerEnv()).toBeNull();
  });

  it("treats whitespace-only env vars as unconfigured and trims valid values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "   \t  ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "  anon-key  ");
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "  wss://hundred.livekit.cloud  ");
    vi.stubEnv("LIVEKIT_API_KEY", "  lk_key_123 ");
    vi.stubEnv("LIVEKIT_API_SECRET", "   ");

    expect(getPublicEnv()).toEqual({
      supabaseUrl: "",
      supabaseAnonKey: "anon-key",
      livekitUrl: "wss://hundred.livekit.cloud",
    });
    expect(isSupabaseConfigured()).toBe(false);
    expect(isLiveKitPublicConfigured()).toBe(true);
    expect(isLiveKitServerConfigured()).toBe(false);
    expect(isLiveKitConfigured()).toBe(false);
    expect(getLiveKitServerEnv()).toBeNull();
  });

  it("requires both Supabase URL and anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isSupabaseConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_123");
    expect(isSupabaseConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "  https://example.supabase.co  ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "  sb_publishable_123 ");
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("requires public URL AND both server credentials for isLiveKitConfigured()", () => {
    // Public URL only
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "wss://hundred.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "");
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    expect(isLiveKitPublicConfigured()).toBe(true);
    expect(isLiveKitServerConfigured()).toBe(false);
    expect(isLiveKitConfigured()).toBe(false);

    // Server credentials only (without public URL)
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "");
    vi.stubEnv("LIVEKIT_API_KEY", "  devkey ");
    vi.stubEnv("LIVEKIT_API_SECRET", " devsecret ");
    expect(isLiveKitPublicConfigured()).toBe(false);
    expect(isLiveKitServerConfigured()).toBe(true);
    expect(isLiveKitConfigured()).toBe(false);
    expect(getLiveKitServerEnv()).toEqual({
      apiKey: "devkey",
      apiSecret: "devsecret",
    });

    // Partial server credentials (missing secret)
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "wss://hundred.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "devkey");
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    expect(isLiveKitServerConfigured()).toBe(false);
    expect(isLiveKitConfigured()).toBe(false);
    expect(getLiveKitServerEnv()).toBeNull();

    // All three present
    vi.stubEnv("LIVEKIT_API_SECRET", "devsecret");
    expect(isLiveKitPublicConfigured()).toBe(true);
    expect(isLiveKitServerConfigured()).toBe(true);
    expect(isLiveKitConfigured()).toBe(true);
  });
});

describe(".env.example and README.md contracts", () => {
  it("defines all 5 required keys with empty default values in .env.example", () => {
    const envExamplePath = path.resolve(process.cwd(), ".env.example");
    const contents = fs.readFileSync(envExamplePath, "utf8");
    const lines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    for (const key of REQUIRED_ENV_KEYS) {
      expect(lines).toContain(`${key}=`);
    }

    expect(lines).toHaveLength(REQUIRED_ENV_KEYS.length);
    expect(contents).not.toContain("একশো");
    expect(contents).not.toContain("Tangail Hundred");
  });

  it("enforces হান্ডেট (Hundred) branding and preserved protocol keys in README.md", () => {
    const readmePath = path.resolve(process.cwd(), "README.md");
    const contents = fs.readFileSync(readmePath, "utf8");

    expect(contents).toContain("# হান্ড্রেট HUNDRED");
    expect(contents).toContain("হান্ড্রেট");
    expect(contents).toContain("HUNDRED");
    expect(contents).toContain("eksho:${roomCode}");
    expect(contents).toContain("eksho_state_${roomCode}");

    for (const key of REQUIRED_ENV_KEYS) {
      expect(contents).toContain(key);
    }

    expect(contents).not.toContain("একশো");
    expect(contents).not.toContain("Tangail Hundred");
  });
});
