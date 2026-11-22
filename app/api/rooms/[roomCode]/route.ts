import { NextRequest, NextResponse } from 'next/server';
import {
  applyAction,
  assignHumanSeat,
  createInitialLobbyState,
  isValidGameState,
  isValidRoomCode,
  normalizeRoomCode,
  resolveTimeoutOrTransition,
} from '@/lib/gameEngine';
import type { ChatMessage, GameAction, GameState } from '@/lib/types';

interface RoomBucket {
  state: GameState;
  chat: ChatMessage[];
  updatedAt: number;
}

const MAX_ROOMS = 250;
const MAX_CHAT = 100;
const ROOM_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours

const globalRooms = globalThis as unknown as {
  __hundredRelayRooms?: Map<string, RoomBucket>;
};

function getRoomStore(): Map<string, RoomBucket> {
  if (!globalRooms.__hundredRelayRooms) {
    globalRooms.__hundredRelayRooms = new Map<string, RoomBucket>();
  }
  const store = globalRooms.__hundredRelayRooms;
  const now = Date.now();
  if (store.size > MAX_ROOMS) {
    for (const [key, bucket] of store.entries()) {
      if (now - bucket.updatedAt > ROOM_TTL_MS) {
        store.delete(key);
      }
    }
  }
  return store;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await context.params;
  const normalized = normalizeRoomCode(roomCode ?? '');
  if (!isValidRoomCode(normalized)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 });
  }

  const store = getRoomStore();
  const bucket = store.get(normalized);
  if (!bucket) {
    return NextResponse.json({ state: null, chat: [] }, { status: 200 });
  }

  const now = Date.now();
  const resolved = resolveTimeoutOrTransition(bucket.state, now);
  if (resolved !== bucket.state) {
    bucket.state = resolved;
    bucket.updatedAt = now;
  }

  return NextResponse.json(
    { state: bucket.state, chat: bucket.chat },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

interface RelayPostBody {
  type: 'JOIN' | 'ACTION' | 'SNAPSHOT' | 'CHAT';
  clientId?: string;
  username?: string;
  action?: GameAction;
  state?: GameState;
  message?: ChatMessage;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await context.params;
  const normalized = normalizeRoomCode(roomCode ?? '');
  if (!isValidRoomCode(normalized)) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 });
  }

  let body: RelayPostBody;
  try {
    body = (await req.json()) as RelayPostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const store = getRoomStore();
  const now = Date.now();
  let bucket = store.get(normalized);

  if (body.type === 'JOIN') {
    const clientId = (body.clientId ?? '').trim();
    const username = (body.username ?? '').trim() || 'Player';
    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }
    if (!bucket) {
      const initial = createInitialLobbyState(normalized, clientId, username, now);
      bucket = { state: initial, chat: [], updatedAt: now };
      store.set(normalized, bucket);
    } else {
      const resolved = resolveTimeoutOrTransition(bucket.state, now);
      bucket.state = assignHumanSeat(resolved, clientId, username, now);
      bucket.updatedAt = now;
    }
    return NextResponse.json({ state: bucket.state, chat: bucket.chat });
  }

  if (body.type === 'ACTION' && body.action) {
    if (!bucket) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    const resolved = resolveTimeoutOrTransition(bucket.state, now);
    bucket.state = applyAction(resolved, body.action, now);
    bucket.updatedAt = now;
    return NextResponse.json({ state: bucket.state, chat: bucket.chat });
  }

  if (body.type === 'SNAPSHOT' && body.state && isValidGameState(body.state)) {
    if (body.state.roomCode !== normalized) {
      return NextResponse.json({ error: 'Room code mismatch' }, { status: 400 });
    }
    if (!bucket || body.state.version >= bucket.state.version) {
      bucket = {
        state: body.state,
        chat: bucket?.chat ?? [],
        updatedAt: now,
      };
      store.set(normalized, bucket);
    }
    return NextResponse.json({ state: bucket.state, chat: bucket.chat });
  }

  if (body.type === 'CHAT' && body.message && typeof body.message.text === 'string') {
    if (!bucket) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    const exists = bucket.chat.some((m) => m.id === body.message!.id);
    if (!exists) {
      bucket.chat = [...bucket.chat, body.message].slice(-MAX_CHAT);
      bucket.updatedAt = now;
    }
    return NextResponse.json({ state: bucket.state, chat: bucket.chat });
  }

  return NextResponse.json({ error: 'Unsupported relay payload' }, { status: 400 });
}
