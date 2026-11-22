import { AccessToken } from 'livekit-server-sdk';
import { type NextRequest, NextResponse } from 'next/server';
import { getLiveKitServerEnv } from '@/lib/env';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/gameEngine';
import type {
  LiveKitTokenErrorResponse,
  LiveKitTokenResponse,
} from '@/lib/types';

const MAX_PARAM_LENGTH = 64;
const PLACEHOLDER_CREDENTIAL_PATTERN =
  /^(?:your[_-]|placeholder|changeme|example[_-]|<.*>)/i;

function isPlaceholderCredential(value: string): boolean {
  return PLACEHOLDER_CREDENTIAL_PATTERN.test(value.trim());
}

/**
 * Ensures TextEncoder.prototype.encode returns a Uint8Array from the active realm
 * so jose SignJWT inside livekit-server-sdk succeeds even when executed inside
 * Vitest's jsdom VM context.
 */
function ensureRealmSafeTextEncoder(): void {
  if (
    typeof TextEncoder !== 'undefined' &&
    !(new TextEncoder().encode('') instanceof Uint8Array)
  ) {
    const origEncode = TextEncoder.prototype.encode;
    TextEncoder.prototype.encode = function encode(
      input?: string,
    ): Uint8Array<ArrayBuffer> {
      return new Uint8Array(origEncode.call(this, input));
    };
  }
}

export async function GET(
  request: NextRequest | Request,
): Promise<NextResponse<LiveKitTokenResponse | LiveKitTokenErrorResponse>> {
  const searchParams =
    'nextUrl' in request && request.nextUrl
      ? request.nextUrl.searchParams
      : new URL(request.url).searchParams;

  const rawRoom = (searchParams.get('room') ?? '').trim();
  const username = (searchParams.get('username') ?? '').trim();
  const clientId = (searchParams.get('clientId') ?? '').trim();

  if (!rawRoom || !username || !clientId) {
    return NextResponse.json<LiveKitTokenErrorResponse>(
      {
        error:
          'Missing required query parameters: room, username, and clientId must be non-empty.',
      },
      { status: 400 },
    );
  }

  if (
    rawRoom.length > MAX_PARAM_LENGTH ||
    username.length > MAX_PARAM_LENGTH ||
    clientId.length > MAX_PARAM_LENGTH
  ) {
    return NextResponse.json<LiveKitTokenErrorResponse>(
      {
        error: 'Query parameters exceed maximum allowed length.',
      },
      { status: 400 },
    );
  }

  const normalizedRoom = normalizeRoomCode(rawRoom);
  if (!isValidRoomCode(normalizedRoom)) {
    return NextResponse.json<LiveKitTokenErrorResponse>(
      {
        error: 'Invalid room code format.',
      },
      { status: 400 },
    );
  }

  const serverEnv = getLiveKitServerEnv();
  if (
    !serverEnv ||
    isPlaceholderCredential(serverEnv.apiKey) ||
    isPlaceholderCredential(serverEnv.apiSecret)
  ) {
    return NextResponse.json<LiveKitTokenErrorResponse>(
      {
        error: 'LiveKit voice credentials are not configured on this server.',
        configured: false,
      },
      { status: 503 },
    );
  }

  try {
    ensureRealmSafeTextEncoder();

    const at = new AccessToken(serverEnv.apiKey, serverEnv.apiSecret, {
      identity: clientId,
      name: username,
      ttl: '6h',
    });

    at.addGrant({
      room: normalizedRoom,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return NextResponse.json<LiveKitTokenResponse>({ token }, { status: 200 });
  } catch {
    return NextResponse.json<LiveKitTokenErrorResponse>(
      {
        error: 'Unable to mint LiveKit voice token.',
        configured: false,
      },
      { status: 503 },
    );
  }
}
