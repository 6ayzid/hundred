// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as tokenRouteModule from '@/app/api/livekit/token/route';
import { GET } from '@/app/api/livekit/token/route';

interface DecodedJwtClaims {
  sub?: string;
  name?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
  };
}

function decodeJwtPayload(token: string): DecodedJwtClaims {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(json) as DecodedJwtClaims;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app/api/livekit/token/route (F-17)', () => {
  it('complies with Next.js 16 cacheComponents: exports only GET and does not export runtime or dynamic', () => {
    const exportedKeys = Object.keys(tokenRouteModule);
    expect(exportedKeys).toEqual(['GET']);
    expect('runtime' in tokenRouteModule).toBe(false);
    expect('dynamic' in tokenRouteModule).toBe(false);
    expect('POST' in tokenRouteModule).toBe(false);
  });

  it('validates query parameters with HTTP 400 before checking server env vars', async () => {
    vi.stubEnv('LIVEKIT_API_KEY', '');
    vi.stubEnv('LIVEKIT_API_SECRET', '');

    const invalidUrls = [
      'http://localhost:3000/api/livekit/token',
      'http://localhost:3000/api/livekit/token?username=Rafi&clientId=cli-1',
      'http://localhost:3000/api/livekit/token?room=TNG-KM47&clientId=cli-1',
      'http://localhost:3000/api/livekit/token?room=TNG-KM47&username=Rafi',
      'http://localhost:3000/api/livekit/token?room=%20%20&username=Rafi&clientId=cli-1',
      'http://localhost:3000/api/livekit/token?room=TNG-KM47&username=%20&clientId=%20',
      'http://localhost:3000/api/livekit/token?room=INVALID_CODE&username=Rafi&clientId=cli-1',
      `http://localhost:3000/api/livekit/token?room=TNG-KM47&username=${'A'.repeat(65)}&clientId=cli-1`,
    ];

    for (const url of invalidUrls) {
      const req = new NextRequest(url);
      const res = await GET(req);
      expect(res.status, `Expected 400 for ${url}`).toBe(400);

      const rawText = await res.text();
      expect(rawText).not.toContain('LIVEKIT_API_SECRET');
      expect(rawText).not.toContain('LIVEKIT_API_KEY');

      const body = JSON.parse(rawText) as { error?: string };
      expect(typeof body.error).toBe('string');
      expect((body.error ?? '').length).toBeGreaterThan(0);
    }
  });

  it('returns HTTP 503 with { error, configured: false } when LIVEKIT_API_KEY or LIVEKIT_API_SECRET is unset, blank, or placeholder', async () => {
    const unconfiguredCombinations: Array<[string, string]> = [
      ['', ''],
      ['   ', '   '],
      ['devkey-only', ''],
      ['', 'devsecret-only-32-characters-long!!'],
      ['your-livekit-api-key', 'your-livekit-api-secret'],
      ['placeholder', 'placeholder_secret'],
      ['<api-key>', '<api-secret>'],
    ];

    for (const [key, secret] of unconfiguredCombinations) {
      vi.stubEnv('LIVEKIT_API_KEY', key);
      vi.stubEnv('LIVEKIT_API_SECRET', secret);

      const req = new NextRequest(
        'http://localhost:3000/api/livekit/token?room=TNG-KM47&username=Rafi&clientId=cli-1',
      );
      const res = await GET(req);
      expect(res.status).toBe(503);

      const rawText = await res.text();
      expect(rawText).not.toContain('LIVEKIT_API_SECRET');
      expect(rawText).not.toContain('LIVEKIT_API_KEY');
      if (secret.trim().length > 0) {
        expect(rawText).not.toContain(secret.trim());
      }

      const body = JSON.parse(rawText) as {
        error?: string;
        configured?: boolean;
      };
      expect(typeof body.error).toBe('string');
      expect((body.error ?? '').length).toBeGreaterThan(0);
      expect(body.configured).toBe(false);
    }
  });

  it('mints a valid LiveKit v2 JWT with HTTP 200 when LIVEKIT_API_KEY and LIVEKIT_API_SECRET are configured at request time (even without NEXT_PUBLIC_LIVEKIT_URL)', async () => {
    const apiKey = 'devkey-unit-test';
    const apiSecret = 'devsecret-unit-test-32-chars-minimum-length!';
    vi.stubEnv('NEXT_PUBLIC_LIVEKIT_URL', '');
    vi.stubEnv('LIVEKIT_API_KEY', apiKey);
    vi.stubEnv('LIVEKIT_API_SECRET', apiSecret);

    const req = new NextRequest(
      'http://localhost:3000/api/livekit/token?room=tng-100&username=%20Rafi%20&clientId=client-abc-123',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const rawText = await res.text();
    expect(rawText).not.toContain(apiSecret);
    expect(rawText).not.toContain(apiKey);
    expect(rawText).not.toContain('LIVEKIT_API_SECRET');

    const body = JSON.parse(rawText) as { token?: string };
    expect(typeof body.token).toBe('string');
    const token = body.token ?? '';
    expect(token).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);

    const claims = decodeJwtPayload(token);
    expect(claims.sub).toBe('client-abc-123');
    expect(claims.name).toBe('Rafi');
    expect(claims.iss).toBe(apiKey);
    expect(claims.video?.room).toBe('TNG-100');
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
    expect(claims.video?.canPublishData).toBe(true);
    expect(claims.exp ?? 0).toBeGreaterThan(claims.iat ?? 0);
  });
});
