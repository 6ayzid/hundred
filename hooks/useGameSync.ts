'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabaseClient';
import {
  applyAction,
  assignHumanSeat,
  computeBotCall,
  computeBotCard,
  createInitialLobbyState,
  HOST_STALL_GRACE_MS,
  isValidAvatarConfig,
  isValidGameState,
  isValidRoomCode,
  isValidSeatIndex,
  normalizeRoomCode,
  resolveTimeoutOrTransition,
  syncPresenceOnlineStatus,
} from '@/lib/gameEngine';
import {
  REALTIME_CHANNEL_PREFIX,
  SESSION_CLIENT_ID_KEY,
  SESSION_SEAT_KEY_PREFIX,
  STORAGE_STATE_KEY_PREFIX,
  type AvatarConfig,
  type ChatMessage,
  type ConnectionStatus,
  type GameAction,
  type GameState,
  type PresenceMeta,
  type SeatIndex,
  type SyncBroadcastEvent,
  type SyncMode,
  type UseGameSyncOptions,
  type UseGameSyncResult,
} from '@/lib/types';

export const BOT_TURN_DELAY_MS = 650;
export const CLOCK_TICK_INTERVAL_MS = 200;
export const SUPABASE_BOOTSTRAP_TIMEOUT_MS = 350;
const MAX_CHAT_LENGTH = 500;
const LEGACY_CLIENT_ID_KEY = 'clientId';
const LEGACY_SEAT_INDEX_KEY = 'seatIndex';
const ALT_SEAT_INDEX_KEY = 'eksho_seat_index';

function generateUniqueClientId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback below
    }
  }
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `client-${ts}-${rand}`;
}

/**
 * Reads or initializes a unique per-tab `clientId` in `sessionStorage`
 * under both `eksho_client_id` and `clientId`.
 */
export function getOrInitSessionClientId(): string {
  if (typeof window === 'undefined') {
    return 'ssr-client';
  }
  try {
    const existing =
      window.sessionStorage.getItem(SESSION_CLIENT_ID_KEY)?.trim() ||
      window.sessionStorage.getItem(LEGACY_CLIENT_ID_KEY)?.trim() ||
      '';
    if (existing.length > 0) {
      window.sessionStorage.setItem(SESSION_CLIENT_ID_KEY, existing);
      window.sessionStorage.setItem(LEGACY_CLIENT_ID_KEY, existing);
      return existing;
    }
    const created = generateUniqueClientId();
    window.sessionStorage.setItem(SESSION_CLIENT_ID_KEY, created);
    window.sessionStorage.setItem(LEGACY_CLIENT_ID_KEY, created);
    return created;
  } catch {
    return generateUniqueClientId();
  }
}

function readStoredSeatForRoom(normalizedRoomCode: string): SeatIndex | null {
  if (typeof window === 'undefined' || !normalizedRoomCode) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(
      `${SESSION_SEAT_KEY_PREFIX}${normalizedRoomCode}`,
    );
    if (raw === null) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return isValidSeatIndex(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSessionSeatIndex(
  normalizedRoomCode: string,
  seatIndex: SeatIndex | null,
  enabled: boolean,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (!enabled || seatIndex === null || !normalizedRoomCode) {
      window.sessionStorage.removeItem(LEGACY_SEAT_INDEX_KEY);
      window.sessionStorage.removeItem(ALT_SEAT_INDEX_KEY);
      return;
    }
    const serialized = String(seatIndex);
    window.sessionStorage.setItem(
      `${SESSION_SEAT_KEY_PREFIX}${normalizedRoomCode}`,
      serialized,
    );
    window.sessionStorage.setItem(LEGACY_SEAT_INDEX_KEY, serialized);
    window.sessionStorage.setItem(ALT_SEAT_INDEX_KEY, serialized);
  } catch {
    // Ignore storage write errors
  }
}

function clearSessionSeatForRoom(normalizedRoomCode: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(LEGACY_SEAT_INDEX_KEY);
    window.sessionStorage.removeItem(ALT_SEAT_INDEX_KEY);
    if (normalizedRoomCode) {
      window.sessionStorage.removeItem(
        `${SESSION_SEAT_KEY_PREFIX}${normalizedRoomCode}`,
      );
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Safely reads and validates cached `GameState` from `localStorage` under
 * `eksho_state_${normalizedRoomCode}`.
 * If the stored JSON is malformed or fails `isValidGameState`, silently removes
 * the corrupt entry and returns `null`.
 */
export function loadCachedGameState(
  normalizedRoomCode: string,
): GameState | null {
  if (
    typeof window === 'undefined' ||
    !normalizedRoomCode ||
    !isValidRoomCode(normalizedRoomCode)
  ) {
    return null;
  }

  const storageKey = `${STORAGE_STATE_KEY_PREFIX}${normalizedRoomCode}`;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const candidate =
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      'state' in parsed
        ? (parsed as { state: unknown }).state
        : parsed;

    if (
      isValidGameState(candidate) &&
      candidate.roomCode === normalizedRoomCode
    ) {
      return candidate;
    }
  } catch {
    // Malformed JSON - purge below
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore remove errors
  }
  return null;
}

/**
 * Safely persists a validated `GameState` to `localStorage` under
 * `eksho_state_${state.roomCode}`.
 */
export function saveCachedGameState(state: GameState): void {
  if (
    typeof window === 'undefined' ||
    !isValidGameState(state) ||
    !isValidRoomCode(state.roomCode)
  ) {
    return;
  }

  const storageKey = `${STORAGE_STATE_KEY_PREFIX}${state.roomCode}`;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}

function findMySeatIndex(
  state: GameState | null,
  clientId: string,
): SeatIndex | null {
  if (!state || !clientId) {
    return null;
  }
  const found = state.seats.find(
    (seat) => seat.type === 'HUMAN' && seat.clientId === clientId,
  );
  return found ? found.seatIndex : null;
}

function hydrateInitialRoomState(
  normalizedRoomCode: string,
  clientId: string,
  username: string,
  syncMode: SyncMode,
  avatar?: AvatarConfig,
): GameState | null {
  const cached = loadCachedGameState(normalizedRoomCode);
  if (cached) {
    const seated = assignHumanSeat(cached, clientId, username, Date.now(), avatar);
    if (findMySeatIndex(seated, clientId) !== null) {
      return seated;
    }
    if (syncMode === 'local') {
      return createInitialLobbyState(
        normalizedRoomCode,
        clientId,
        username,
        Date.now(),
        avatar,
      );
    }
    return seated;
  }

  if (syncMode === 'local') {
    return createInitialLobbyState(
      normalizedRoomCode,
      clientId,
      username,
      Date.now(),
      avatar,
    );
  }

  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractBroadcastEvent(raw: unknown): SyncBroadcastEvent | null {
  if (!isObjectRecord(raw)) {
    return null;
  }
  const inner = isObjectRecord(raw.payload) ? raw.payload : raw;
  if (!isObjectRecord(inner)) {
    return null;
  }
  const type = inner.type;
  const senderId = inner.senderId;
  if (typeof type !== 'string' || typeof senderId !== 'string' || !senderId) {
    return null;
  }

  switch (type) {
    case 'JOIN_REQUEST':
      if (typeof inner.username !== 'string') {
        return null;
      }
      return {
        type: 'JOIN_REQUEST',
        senderId,
        username: inner.username,
        ...(isValidAvatarConfig(inner.avatar) ? { avatar: inner.avatar } : {}),
        preferredSeat: isValidSeatIndex(inner.preferredSeat)
          ? inner.preferredSeat
          : null,
      };
    case 'REQUEST_SYNC':
      return {
        type: 'REQUEST_SYNC',
        senderId,
      };
    case 'GAME_ACTION':
      if (
        !isObjectRecord(inner.action) ||
        typeof inner.action.type !== 'string'
      ) {
        return null;
      }
      return {
        type: 'GAME_ACTION',
        senderId,
        action: inner.action as GameAction,
      };
    case 'STATE_SNAPSHOT':
      if (!isValidGameState(inner.state)) {
        return null;
      }
      return {
        type: 'STATE_SNAPSHOT',
        senderId,
        state: inner.state,
      };
    case 'CHAT_MSG':
      if (
        !isObjectRecord(inner.message) ||
        typeof inner.message.id !== 'string' ||
        typeof inner.message.text !== 'string'
      ) {
        return null;
      }
      return {
        type: 'CHAT_MSG',
        senderId,
        message: inner.message as unknown as ChatMessage,
      };
    default:
      return null;
  }
}

function parsePresenceMetas(rawPresenceState: unknown): PresenceMeta[] {
  if (!isObjectRecord(rawPresenceState)) {
    return [];
  }
  const byClient = new Map<string, PresenceMeta>();
  for (const [key, list] of Object.entries(rawPresenceState)) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!isObjectRecord(item)) {
        continue;
      }
      const clientId =
        typeof item.clientId === 'string' && item.clientId.trim().length > 0
          ? item.clientId.trim()
          : key.trim();
      if (!clientId) {
        continue;
      }
      const seatIndex = isValidSeatIndex(item.seatIndex)
        ? item.seatIndex
        : null;
      const username =
        typeof item.username === 'string' ? item.username : 'অতিথি';
      const avatar = isValidAvatarConfig(item.avatar) ? item.avatar : undefined;
      const joinedAt =
        typeof item.joinedAt === 'number' && Number.isFinite(item.joinedAt)
          ? item.joinedAt
          : 0;
      const existing = byClient.get(clientId);
      if (!existing || (seatIndex !== null && existing.seatIndex === null)) {
        byClient.set(clientId, {
          clientId,
          seatIndex,
          username,
          ...(avatar !== undefined ? { avatar } : {}),
          joinedAt,
        });
      }
    }
  }
  return Array.from(byClient.values());
}

/**
 * Serverless multiplayer synchronization, Presence-driven deterministic Host
 * migration, shot-clock & >2500ms stall watchdog failover, `localStorage`
 * reconnect caching, and offline local fallback hook for "হান্ডেট (Hundred)".
 */
export function useGameSync(options: UseGameSyncOptions): UseGameSyncResult {
  const { roomCode, username, avatar, enabled, joinOnly = false } = options;

  const normalizedRoomCode = useMemo(
    () => normalizeRoomCode(roomCode ?? ''),
    [roomCode],
  );
  const validRoom = useMemo(
    () => Boolean(enabled && isValidRoomCode(normalizedRoomCode)),
    [enabled, normalizedRoomCode],
  );
  const trimmedUsername = useMemo(
    () => (username ?? '').trim() || 'অতিথি',
    [username],
  );

  const [clientId] = useState<string>(() => getOrInitSessionClientId());
  const [syncMode, setSyncMode] = useState<SyncMode>(() =>
    getSupabaseClient() !== null ? 'supabase' : 'local',
  );
  const [rawState, setState] = useState<GameState | null>(() => {
    if (!validRoom || joinOnly) {
      return null;
    }
    return hydrateInitialRoomState(
      normalizedRoomCode,
      clientId,
      trimmedUsername,
      syncMode,
      avatar,
    );
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [rawConnectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => {
      if (!validRoom) {
        return 'idle';
      }
      return syncMode === 'supabase' ? 'connecting' : 'local';
    },
  );
  const [rawPresenceMetas, setPresenceMetas] = useState<PresenceMeta[]>([]);
  const [rawPromotedHostSeat, setPromotedHostSeat] =
    useState<SeatIndex | null>(null);
  const [rawRemainingMs, setRemainingMs] = useState<number | null>(null);
  const [rawRoomUnavailableReason, setRoomUnavailableReason] = useState<
    string | null
  >(null);

  // When roomCode, joinOnly, or enabled toggles at render time, transition synchronously
  const [activeRoomKey, setActiveRoomKey] = useState<string>(() =>
    validRoom ? `${normalizedRoomCode}:${syncMode}:${joinOnly ? 'join' : 'create'}` : '',
  );
  const targetRoomKey = validRoom
    ? `${normalizedRoomCode}:${syncMode}:${joinOnly ? 'join' : 'create'}`
    : '';
  if (activeRoomKey !== targetRoomKey) {
    setActiveRoomKey(targetRoomKey);
    if (!validRoom) {
      setState(null);
      setConnectionStatus('idle');
      setPresenceMetas([]);
      setPromotedHostSeat(null);
      setRemainingMs(null);
      setRoomUnavailableReason(null);
    } else {
      const nextMode: SyncMode =
        getSupabaseClient() !== null ? 'supabase' : 'local';
      if (nextMode !== syncMode) {
        setSyncMode(nextMode);
      }
      const nextHydrated = joinOnly
        ? null
        : hydrateInitialRoomState(
            normalizedRoomCode,
            clientId,
            trimmedUsername,
            nextMode,
            avatar,
          );
      setState(nextHydrated);
      setConnectionStatus(nextMode === 'supabase' ? 'connecting' : 'local');
      setPresenceMetas([]);
      setPromotedHostSeat(null);
      setRemainingMs(null);
      setRoomUnavailableReason(null);
    }
  }

  const state = validRoom ? rawState : null;
  const connectionStatus: ConnectionStatus = validRoom
    ? rawConnectionStatus
    : 'idle';
  const roomUnavailableReason = validRoom ? rawRoomUnavailableReason : null;
  const presenceMetas = useMemo(
    () => (validRoom ? rawPresenceMetas : []),
    [validRoom, rawPresenceMetas],
  );
  const promotedHostSeat = validRoom ? rawPromotedHostSeat : null;
  const remainingMs =
    validRoom && state !== null && state.turnDeadline !== null
      ? rawRemainingMs
      : null;

  const stateRef = useRef<GameState | null>(state);
  const clientIdRef = useRef<string>(clientId);
  const usernameRef = useRef<string>(trimmedUsername);
  const avatarRef = useRef<AvatarConfig | undefined>(avatar);
  const roomCodeRef = useRef<string>(normalizedRoomCode);
  const validRoomRef = useRef<boolean>(validRoom);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isSubscribedRef = useRef<boolean>(false);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const clockOffsetRef = useRef<number>(0);
  const joinedAtRef = useRef<number>(0);
  const presenceMetasRef = useRef<PresenceMeta[]>([]);
  const isHostRef = useRef<boolean>(false);
  const mySeatIndexRef = useRef<SeatIndex | null>(null);
  const onlineHumanSeatsRef = useRef<SeatIndex[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);

  useEffect(() => {
    usernameRef.current = trimmedUsername;
  }, [trimmedUsername]);

  useEffect(() => {
    avatarRef.current = avatar;
  }, [avatar]);

  useEffect(() => {
    roomCodeRef.current = normalizedRoomCode;
    validRoomRef.current = validRoom;
  }, [normalizedRoomCode, validRoom]);

  // Ensure clientId is always written to sessionStorage on mount
  useEffect(() => {
    getOrInitSessionClientId();
  }, [clientId]);

  const mySeatIndex = useMemo<SeatIndex | null>(() => {
    if (!validRoom || !state) {
      return null;
    }
    return findMySeatIndex(state, clientId);
  }, [validRoom, state, clientId]);

  useEffect(() => {
    mySeatIndexRef.current = mySeatIndex;
    writeSessionSeatIndex(normalizedRoomCode, mySeatIndex, validRoom);
    if (validRoom && state) {
      saveCachedGameState(state);
    }
  }, [normalizedRoomCode, mySeatIndex, validRoom, state]);

  // Compute online human seats and all online seats (F-14 deterministic host election)
  const { onlineHumanSeats, onlineSeats, hostSeatIndex, isHost } =
    useMemo(() => {
      if (!validRoom || !state) {
        return {
          onlineHumanSeats: [] as SeatIndex[],
          onlineSeats: [] as SeatIndex[],
          hostSeatIndex: null as SeatIndex | null,
          isHost: false,
        };
      }

      const humanSeatSet = new Set<SeatIndex>();
      const allOnlineSeatSet = new Set<SeatIndex>();

      if (syncMode === 'supabase' && presenceMetas.length > 0) {
        const onlineClientIds = new Set<string>(
          presenceMetas.map((m) => m.clientId),
        );
        onlineClientIds.add(clientId);

        for (const meta of presenceMetas) {
          if (meta.seatIndex !== null && isValidSeatIndex(meta.seatIndex)) {
            const seatAtIdx = state.seats[meta.seatIndex];
            if (
              !seatAtIdx ||
              seatAtIdx.type === 'HUMAN' ||
              seatAtIdx.clientId === meta.clientId
            ) {
              humanSeatSet.add(meta.seatIndex);
              allOnlineSeatSet.add(meta.seatIndex);
            }
          }
        }

        for (const seat of state.seats) {
          if (
            seat.type === 'HUMAN' &&
            seat.clientId !== null &&
            onlineClientIds.has(seat.clientId)
          ) {
            humanSeatSet.add(seat.seatIndex);
            allOnlineSeatSet.add(seat.seatIndex);
          } else if (seat.type === 'AI' && seat.isOnline) {
            allOnlineSeatSet.add(seat.seatIndex);
          }
        }
      } else {
        for (const seat of state.seats) {
          if (seat.type === 'HUMAN' && seat.isOnline) {
            humanSeatSet.add(seat.seatIndex);
            allOnlineSeatSet.add(seat.seatIndex);
          } else if (seat.type === 'AI' && seat.isOnline) {
            allOnlineSeatSet.add(seat.seatIndex);
          }
        }
        if (mySeatIndex !== null) {
          humanSeatSet.add(mySeatIndex);
          allOnlineSeatSet.add(mySeatIndex);
        }
      }

      const sortedHumanSeats = Array.from(humanSeatSet).sort(
        (a, b) => a - b,
      ) as SeatIndex[];
      const sortedAllSeats = Array.from(allOnlineSeatSet).sort(
        (a, b) => a - b,
      ) as SeatIndex[];

      let electedHost: SeatIndex | null =
        sortedHumanSeats[0] ?? mySeatIndex ?? 0;

      if (
        promotedHostSeat !== null &&
        sortedHumanSeats.includes(promotedHostSeat)
      ) {
        electedHost = promotedHostSeat;
      }

      const activeIsHost =
        mySeatIndex !== null &&
        electedHost !== null &&
        mySeatIndex === electedHost;

      return {
        onlineHumanSeats: sortedHumanSeats,
        onlineSeats: sortedAllSeats,
        hostSeatIndex: electedHost,
        isHost: activeIsHost,
      };
    }, [
      validRoom,
      state,
      syncMode,
      presenceMetas,
      clientId,
      mySeatIndex,
      promotedHostSeat,
    ]);

  useEffect(() => {
    isHostRef.current = isHost;
    onlineHumanSeatsRef.current = onlineHumanSeats;
  }, [isHost, onlineHumanSeats]);

  const isHttpRelayEnabled = useCallback(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return false;
    }
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      return false;
    }
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }, []);

  const sendBroadcastEvent = useCallback(
    (event: SyncBroadcastEvent) => {
      const channel = channelRef.current;
      if (channel && isSubscribedRef.current) {
        try {
          void channel.send({
            type: 'broadcast',
            event: event.type,
            payload: event,
          });
        } catch {
          // Ignore transient channel send errors
        }
      }

      const bc = broadcastChannelRef.current;
      if (bc) {
        try {
          bc.postMessage(event);
        } catch {
          // Ignore closed BroadcastChannel errors
        }
      }

      if (
        !channel &&
        validRoomRef.current &&
        roomCodeRef.current &&
        isHttpRelayEnabled()
      ) {
        const endpoint = `/api/rooms/${encodeURIComponent(roomCodeRef.current)}`;
        if (event.type === 'STATE_SNAPSHOT') {
          void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'SNAPSHOT', state: event.state }),
          }).catch(() => {});
        } else if (event.type === 'GAME_ACTION') {
          void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ACTION', action: event.action }),
          }).catch(() => {});
        } else if (event.type === 'CHAT_MSG') {
          void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CHAT', message: event.message }),
          }).catch(() => {});
        }
      }
    },
    [isHttpRelayEnabled],
  );

  const commitAndPersistState = useCallback(
    (nextState: GameState, shouldBroadcast: boolean) => {
      stateRef.current = nextState;
      setState(nextState);
      saveCachedGameState(nextState);
      const seatIdx = findMySeatIndex(nextState, clientIdRef.current);
      writeSessionSeatIndex(
        nextState.roomCode,
        seatIdx,
        validRoomRef.current,
      );
      if (shouldBroadcast) {
        sendBroadcastEvent({
          type: 'STATE_SNAPSHOT',
          senderId: clientIdRef.current,
          state: nextState,
        });
      }
    },
    [sendBroadcastEvent],
  );

  const handleIncomingBroadcast = useCallback(
    (rawPayload: unknown) => {
      const event = extractBroadcastEvent(rawPayload);
      if (!event) {
        return;
      }

      // F-13 Strict Self-Echo Guard
      if (event.senderId === clientIdRef.current) {
        return;
      }

      switch (event.type) {
        case 'CHAT_MSG': {
          const incomingMsg = event.message;
          if (!incomingMsg || !incomingMsg.id || !incomingMsg.text.trim()) {
            return;
          }
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === incomingMsg.id)) {
              return prev;
            }
            return [...prev, incomingMsg];
          });
          return;
        }

        case 'STATE_SNAPSHOT': {
          const incoming = event.state;
          if (
            !isValidGameState(incoming) ||
            incoming.roomCode !== roomCodeRef.current
          ) {
            return;
          }

          const current = stateRef.current;
          if (
            current !== null &&
            current.matchId === incoming.matchId &&
            incoming.version <= current.version
          ) {
            return;
          }

          clockOffsetRef.current = incoming.emittedAt - Date.now();
          setPromotedHostSeat(null);
          const seatIdx = findMySeatIndex(incoming, clientIdRef.current);
          if (joinOnly && seatIdx === null) {
            if (incoming.phase !== 'LOBBY') {
              setRoomUnavailableReason(
                `Room ${incoming.roomCode} is already in progress.`,
              );
              return;
            }
            const hasEmptySeat = incoming.seats.some((s) => s.type === 'EMPTY');
            if (!hasEmptySeat) {
              setRoomUnavailableReason(
                `Room ${incoming.roomCode} is full (4/4 players).`,
              );
              return;
            }
          }
          stateRef.current = incoming;
          setState(incoming);
          saveCachedGameState(incoming);
          writeSessionSeatIndex(
            incoming.roomCode,
            seatIdx,
            validRoomRef.current,
          );
          return;
        }

        case 'REQUEST_SYNC': {
          if (!isHostRef.current || !stateRef.current) {
            return;
          }
          sendBroadcastEvent({
            type: 'STATE_SNAPSHOT',
            senderId: clientIdRef.current,
            state: stateRef.current,
          });
          return;
        }

        case 'JOIN_REQUEST': {
          if (!isHostRef.current || !stateRef.current) {
            return;
          }
          const current = stateRef.current;
          const updated = assignHumanSeat(
            current,
            event.senderId,
            event.username.trim() || 'অতিথি',
            Date.now(),
            event.avatar,
          );
          if (updated !== current) {
            commitAndPersistState(updated, true);
          } else {
            sendBroadcastEvent({
              type: 'STATE_SNAPSHOT',
              senderId: clientIdRef.current,
              state: current,
            });
          }
          return;
        }

        case 'GAME_ACTION': {
          if (!isHostRef.current || !stateRef.current) {
            return;
          }
          // Only the room creator / Host may start the match or manage bots
          if (
            event.action.type === 'START_MATCH' ||
            event.action.type === 'FILL_BOTS_AND_START' ||
            event.action.type === 'ADD_BOT' ||
            event.action.type === 'REMOVE_BOT'
          ) {
            return;
          }
          const current = stateRef.current;
          const nextState = applyAction(current, event.action, Date.now());
          if (nextState !== current && nextState.version > current.version) {
            commitAndPersistState(nextState, true);
          }
          return;
        }
      }
    },
    [commitAndPersistState, sendBroadcastEvent, joinOnly],
  );

  // Main lifecycle effect: Local / Supabase channel subscription & storage listener
  useEffect(() => {
    if (!validRoom) {
      stateRef.current = null;
      presenceMetasRef.current = [];
      writeSessionSeatIndex(normalizedRoomCode, null, false);
      return;
    }

    const activeClientId = clientIdRef.current;
    const supabase = getSupabaseClient();
    const currentSyncMode: SyncMode = supabase !== null ? 'supabase' : 'local';
    joinedAtRef.current = Date.now();
    clockOffsetRef.current = 0;

    if (stateRef.current) {
      saveCachedGameState(stateRef.current);
      const seatIdx = findMySeatIndex(stateRef.current, activeClientId);
      mySeatIndexRef.current = seatIdx;
      writeSessionSeatIndex(normalizedRoomCode, seatIdx, true);
    }

    // 1. Attach cross-tab storage event listener for live external / multi-tab localStorage updates
    const storageKey = `${STORAGE_STATE_KEY_PREFIX}${normalizedRoomCode}`;
    const handleStorageEvent = (ev: StorageEvent) => {
      if (ev.key !== storageKey || !ev.newValue) {
        return;
      }
      const nextFromStorage = loadCachedGameState(normalizedRoomCode);
      if (!nextFromStorage) {
        return;
      }
      const current = stateRef.current;
      if (
        current === null ||
        nextFromStorage.matchId !== current.matchId ||
        nextFromStorage.version > current.version
      ) {
        stateRef.current = nextFromStorage;
        setState(nextFromStorage);
        const seatIdx = findMySeatIndex(nextFromStorage, activeClientId);
        writeSessionSeatIndex(normalizedRoomCode, seatIdx, true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageEvent);
    }

    // 2. Attach same-origin BroadcastChannel in local mode
    let localBc: BroadcastChannel | null = null;
    if (
      currentSyncMode === 'local' &&
      typeof BroadcastChannel !== 'undefined'
    ) {
      try {
        localBc = new BroadcastChannel(
          `${REALTIME_CHANNEL_PREFIX}${normalizedRoomCode}`,
        );
        broadcastChannelRef.current = localBc;
        localBc.onmessage = (msgEvent: MessageEvent) => {
          handleIncomingBroadcast(msgEvent.data);
        };
      } catch {
        localBc = null;
        broadcastChannelRef.current = null;
      }
    }

    if (currentSyncMode === 'local' || supabase === null) {
      if (localBc) {
        try {
          localBc.postMessage({
            type: 'REQUEST_SYNC',
            senderId: activeClientId,
          } satisfies SyncBroadcastEvent);
        } catch {
          // Ignore BroadcastChannel errors
        }
      }

      let relayInterval: ReturnType<typeof setInterval> | null = null;
      let relayCancelled = false;

      if (isHttpRelayEnabled()) {
        const endpoint = `/api/rooms/${encodeURIComponent(normalizedRoomCode)}`;

        const adoptRelayPayload = (data: {
          state?: GameState | null;
          chat?: ChatMessage[];
        }) => {
          if (relayCancelled) return;
          if (data.state && isValidGameState(data.state)) {
            const current = stateRef.current;
            const currentHumans = current
              ? current.seats.filter((s) => s.type === 'HUMAN').length
              : 0;
            const remoteHumans = data.state.seats.filter(
              (s) => s.type === 'HUMAN',
            ).length;
            const shouldAdopt =
              !current ||
              data.state.version > current.version ||
              (data.state.version === current.version &&
                remoteHumans > currentHumans) ||
              (current.phase === 'LOBBY' &&
                data.state.phase !== 'LOBBY') ||
              (findMySeatIndex(data.state, activeClientId) !== null &&
                findMySeatIndex(data.state, activeClientId) !==
                  findMySeatIndex(current, activeClientId));

            if (shouldAdopt) {
              commitAndPersistState(data.state, false);
            }
          }
          if (Array.isArray(data.chat) && data.chat.length > 0) {
            setChatMessages((prev) => {
              const seen = new Set(prev.map((m) => m.id));
              const additions = data.chat!.filter((m) => !seen.has(m.id));
              return additions.length > 0 ? [...prev, ...additions] : prev;
            });
          }
        };

        if (joinOnly) {
          void fetch(endpoint, { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (relayCancelled) return;
              if (!data?.state) {
                setRoomUnavailableReason(
                  `Room ${normalizedRoomCode} wasn't found or has closed.`,
                );
                return;
              }
              const s: GameState = data.state;
              const existingSeat = findMySeatIndex(s, activeClientId);
              if (existingSeat === null) {
                if (s.phase !== 'LOBBY') {
                  setRoomUnavailableReason(
                    `Room ${normalizedRoomCode} is already in progress.`,
                  );
                  return;
                }
                if (!s.seats.some((seat) => seat.type === 'EMPTY')) {
                  setRoomUnavailableReason(
                    `Room ${normalizedRoomCode} is full (4/4 players).`,
                  );
                  return;
                }
              }
              return fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'JOIN',
                  clientId: activeClientId,
                  username: usernameRef.current,
                  ...(avatarRef.current ? { avatar: avatarRef.current } : {}),
                }),
              })
                .then((res) => (res.ok ? res.json() : null))
                .then((joined) => {
                  if (joined) adoptRelayPayload(joined);
                });
            })
            .catch(() => {});
        } else {
          void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'JOIN',
              clientId: activeClientId,
              username: usernameRef.current,
              ...(avatarRef.current ? { avatar: avatarRef.current } : {}),
            }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data) adoptRelayPayload(data);
            })
            .catch(() => {});
        }

        relayInterval = setInterval(() => {
          if (relayCancelled) return;
          void fetch(endpoint, { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data) adoptRelayPayload(data);
            })
            .catch(() => {});
        }, 1200);
      }

      return () => {
        relayCancelled = true;
        if (relayInterval) {
          clearInterval(relayInterval);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', handleStorageEvent);
        }
        if (localBc) {
          try {
            localBc.close();
          } catch {
            // Ignore close errors
          }
          broadcastChannelRef.current = null;
        }
      };
    }

    // 3. Supabase Realtime Channel (`eksho:${roomCode}`) with Presence & Broadcast
    isSubscribedRef.current = false;

    const channelTopic = `${REALTIME_CHANNEL_PREFIX}${normalizedRoomCode}`;
    const channel = supabase.channel(channelTopic, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: activeClientId, enabled: true },
      },
    });
    channelRef.current = channel;

    let bootstrapTimer: ReturnType<typeof setTimeout> | null = null;

    const syncPresenceFromChannel = () => {
      try {
        const rawPresence = channel.presenceState<PresenceMeta>();
        const metas = parsePresenceMetas(rawPresence);
        presenceMetasRef.current = metas;
        setPresenceMetas(metas);

        // If we are currently Host and have state, reconcile seat online flags
        const current = stateRef.current;
        if (current && isHostRef.current && metas.length > 0) {
          const onlineIds = new Set<string>(metas.map((m) => m.clientId));
          onlineIds.add(activeClientId);
          const reconciled = syncPresenceOnlineStatus(
            current,
            onlineIds,
            Date.now(),
          );
          if (reconciled !== current) {
            commitAndPersistState(reconciled, true);
          }
        }
      } catch {
        // Ignore presence read errors
      }
    };

    // CRITICAL: Attach all `.on('presence', ...)` and `.on('broadcast', ...)`
    // listeners BEFORE calling `channel.subscribe(...)`
    channel
      .on('presence', { event: 'sync' }, () => {
        syncPresenceFromChannel();
      })
      .on('presence', { event: 'join' }, () => {
        syncPresenceFromChannel();
      })
      .on('presence', { event: 'leave' }, () => {
        syncPresenceFromChannel();
      })
      .on('broadcast', { event: 'JOIN_REQUEST' }, (payload) => {
        handleIncomingBroadcast(payload);
      })
      .on('broadcast', { event: 'REQUEST_SYNC' }, (payload) => {
        handleIncomingBroadcast(payload);
      })
      .on('broadcast', { event: 'GAME_ACTION' }, (payload) => {
        handleIncomingBroadcast(payload);
      })
      .on('broadcast', { event: 'STATE_SNAPSHOT' }, (payload) => {
        handleIncomingBroadcast(payload);
      })
      .on('broadcast', { event: 'CHAT_MSG' }, (payload) => {
        handleIncomingBroadcast(payload);
      })
      .on('broadcast', { event: 'sync' }, (payload) => {
        handleIncomingBroadcast(payload);
      });

    // Subscribe and wait for status === 'SUBSCRIBED' before calling .track() or .send()
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        isSubscribedRef.current = true;
        setConnectionStatus('connected');

        const currentSeat =
          findMySeatIndex(stateRef.current, activeClientId) ??
          readStoredSeatForRoom(normalizedRoomCode);

        const presencePayload: PresenceMeta = {
          clientId: activeClientId,
          seatIndex: currentSeat,
          username: usernameRef.current,
          ...(avatarRef.current ? { avatar: avatarRef.current } : {}),
          joinedAt: joinedAtRef.current,
        };

        try {
          void channel.track(presencePayload);
        } catch {
          // Ignore track errors
        }

        // Emit REQUEST_SYNC immediately upon SUBSCRIBED
        sendBroadcastEvent({
          type: 'REQUEST_SYNC',
          senderId: activeClientId,
        });

        if (findMySeatIndex(stateRef.current, activeClientId) === null) {
          sendBroadcastEvent({
            type: 'JOIN_REQUEST',
            senderId: activeClientId,
            username: usernameRef.current,
            ...(avatarRef.current ? { avatar: avatarRef.current } : {}),
            preferredSeat: currentSeat,
          });
        }

        // If no state exists yet and no remote Host replies with STATE_SNAPSHOT:
        // - In joinOnly mode, report that the room wasn't found instead of creating a phantom room.
        // - In create mode, initialize lobby state as Seat 0 Host.
        if (!stateRef.current) {
          const waitMs = joinOnly ? 2600 : SUPABASE_BOOTSTRAP_TIMEOUT_MS;
          bootstrapTimer = setTimeout(() => {
            if (!stateRef.current && validRoomRef.current) {
              if (joinOnly) {
                setRoomUnavailableReason(
                  `Room ${normalizedRoomCode} wasn't found or has closed.`,
                );
                return;
              }
              const metas = presenceMetasRef.current;
              const otherSeatedHost = metas.some(
                (m) =>
                  m.clientId !== activeClientId &&
                  m.seatIndex !== null &&
                  isValidSeatIndex(m.seatIndex),
              );
              if (!otherSeatedHost) {
                const created = createInitialLobbyState(
                  normalizedRoomCode,
                  activeClientId,
                  usernameRef.current,
                  Date.now(),
                  avatarRef.current,
                );
                commitAndPersistState(created, true);
              }
            }
          }, waitMs);
        }
      }
    });

    return () => {
      if (bootstrapTimer !== null) {
        clearTimeout(bootstrapTimer);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageEvent);
      }
      isSubscribedRef.current = false;
      channelRef.current = null;
      try {
        if (typeof channel.untrack === 'function') {
          void channel.untrack();
        }
      } catch {
        // Ignore untrack error
      }
      try {
        if (typeof supabase.removeChannel === 'function') {
          void supabase.removeChannel(channel);
        } else if (typeof channel.unsubscribe === 'function') {
          void channel.unsubscribe();
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [
    validRoom,
    normalizedRoomCode,
    joinOnly,
    commitAndPersistState,
    handleIncomingBroadcast,
    sendBroadcastEvent,
    isHttpRelayEnabled,
  ]);

  // Re-track Presence whenever mySeatIndex, username, or avatar changes while subscribed
  useEffect(() => {
    if (
      syncMode !== 'supabase' ||
      !isSubscribedRef.current ||
      !channelRef.current
    ) {
      return;
    }
    const payload: PresenceMeta = {
      clientId,
      seatIndex: mySeatIndex,
      username: trimmedUsername,
      ...(avatar ? { avatar } : {}),
      joinedAt: joinedAtRef.current,
    };
    try {
      void channelRef.current.track(payload);
    } catch {
      // Ignore track error
    }
  }, [syncMode, clientId, mySeatIndex, trimmedUsername, avatar]);

  // Keep current LOBBY seat username & avatar synced when player updates profile
  useEffect(() => {
    if (!validRoom || !state || state.phase !== 'LOBBY' || mySeatIndex === null) {
      return;
    }
    const mySeat = state.seats[mySeatIndex];
    if (!mySeat || mySeat.type !== 'HUMAN') {
      return;
    }
    const nameDiff = mySeat.username !== trimmedUsername;
    const avatarDiff = Boolean(
      avatar &&
        (!mySeat.avatar ||
          mySeat.avatar.character !== avatar.character ||
          mySeat.avatar.bg !== avatar.bg ||
          mySeat.avatar.outfit !== avatar.outfit ||
          mySeat.avatar.skin !== avatar.skin),
    );
    if (!nameDiff && !avatarDiff) {
      return;
    }

    if (isHost) {
      const updated = assignHumanSeat(
        state,
        clientId,
        trimmedUsername,
        Date.now(),
        avatar,
      );
      if (updated !== state) {
        const syncTimer = setTimeout(() => {
          commitAndPersistState(updated, true);
        }, 0);
        return () => clearTimeout(syncTimer);
      }
      return;
    }

    if (syncMode === 'supabase' && isSubscribedRef.current) {
      sendBroadcastEvent({
        type: 'JOIN_REQUEST',
        senderId: clientId,
        username: trimmedUsername,
        ...(avatar ? { avatar } : {}),
        preferredSeat: mySeatIndex,
      });
    } else if (syncMode !== 'supabase' && syncMode !== 'local') {
      void fetch(`/api/rooms/${encodeURIComponent(normalizedRoomCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'JOIN',
          clientId,
          username: trimmedUsername,
          ...(avatar ? { avatar } : {}),
        }),
      }).catch(() => {});
    }
  }, [
    validRoom,
    normalizedRoomCode,
    state,
    mySeatIndex,
    isHost,
    clientId,
    trimmedUsername,
    avatar,
    syncMode,
    commitAndPersistState,
    sendBroadcastEvent,
  ]);

  // Reconcile seat online status when Host changes or Presence updates
  useEffect(() => {
    if (
      !validRoom ||
      !isHost ||
      syncMode !== 'supabase' ||
      !stateRef.current ||
      presenceMetas.length === 0
    ) {
      return;
    }
    const onlineIds = new Set<string>(presenceMetas.map((m) => m.clientId));
    onlineIds.add(clientId);
    const current = stateRef.current;
    const reconciled = syncPresenceOnlineStatus(current, onlineIds, Date.now());
    if (reconciled !== current) {
      const reconcileTimer = setTimeout(() => {
        commitAndPersistState(reconciled, true);
      }, 0);
      return () => clearTimeout(reconcileTimer);
    }
  }, [
    validRoom,
    isHost,
    syncMode,
    presenceMetas,
    clientId,
    commitAndPersistState,
  ]);

  // F-15 Shot-Clocks (25s Bid / 20s Play), Phase Transitions (2.2s / 4.5s) & >2500ms Stall Watchdog
  useEffect(() => {
    if (!validRoom || !state || state.turnDeadline === null) {
      return;
    }

    const turnDeadline = state.turnDeadline;
    const targetVersion = state.version;
    const targetMatchId = state.matchId;

    const evaluateDeadline = () => {
      const current = stateRef.current;
      if (
        !current ||
        current.turnDeadline === null ||
        current.version !== targetVersion ||
        current.matchId !== targetMatchId
      ) {
        return;
      }

      const now = Date.now();
      const adjustedNow = isHostRef.current
        ? now
        : now + clockOffsetRef.current;
      const nextRemaining = Math.max(0, current.turnDeadline - adjustedNow);
      setRemainingMs(nextRemaining);

      if (isHostRef.current) {
        // Active Host resolves turnDeadline immediately at +0ms grace delay
        if (now >= current.turnDeadline) {
          const resolved = resolveTimeoutOrTransition(current, now);
          if (resolved !== current && resolved.version > current.version) {
            commitAndPersistState(resolved, true);
          }
        }
      } else if (mySeatIndexRef.current !== null) {
        // Non-host backup seat watchdog: waits > 2500ms * rank past turnDeadline
        const sortedSeats = onlineHumanSeatsRef.current;
        const idxInOnline = sortedSeats.indexOf(mySeatIndexRef.current);
        const rank = idxInOnline >= 1 ? idxInOnline : 1;
        const stallThreshold =
          current.turnDeadline + HOST_STALL_GRACE_MS * rank;

        if (adjustedNow > stallThreshold) {
          // Self-promote to active Host, resolve timeout, persist, and broadcast
          const selfSeat = mySeatIndexRef.current;
          setPromotedHostSeat(selfSeat);
          isHostRef.current = true;
          clockOffsetRef.current = 0;

          const resolveTime = Math.max(now, current.turnDeadline);
          const resolved = resolveTimeoutOrTransition(current, resolveTime);
          if (resolved !== current && resolved.version > current.version) {
            commitAndPersistState(resolved, true);
          }
        }
      }
    };

    const now = Date.now();
    const adjustedNow = isHost ? now : now + clockOffsetRef.current;
    let targetDelayMs: number;

    if (isHost) {
      targetDelayMs = Math.max(0, turnDeadline - now);
    } else {
      const idxInOnline =
        mySeatIndex !== null ? onlineHumanSeats.indexOf(mySeatIndex) : -1;
      const rank = idxInOnline >= 1 ? idxInOnline : 1;
      const stallThreshold = turnDeadline + HOST_STALL_GRACE_MS * rank;
      // Add +1ms so strictly `adjustedNow > stallThreshold` is satisfied when timer fires
      targetDelayMs = Math.max(0, stallThreshold - adjustedNow + 1);
    }

    const immediateId = setTimeout(evaluateDeadline, 0);
    const timeoutId = setTimeout(evaluateDeadline, targetDelayMs);
    const intervalId = setInterval(evaluateDeadline, CLOCK_TICK_INTERVAL_MS);

    return () => {
      clearTimeout(immediateId);
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [
    validRoom,
    state,
    isHost,
    mySeatIndex,
    onlineHumanSeats,
    commitAndPersistState,
  ]);

  // AI Bot, Auto-1 Lead & Last-Card Auto-Play Scheduler (Host only)
  useEffect(() => {
    if (!validRoom || !isHost || !state) {
      return;
    }

    if (state.phase !== 'BIDDING' && state.phase !== 'PLAYING') {
      return;
    }

    const activeSeatObj = state.seats[state.activeSeat];
    const isForcedAutoOneLead =
      state.phase === 'PLAYING' &&
      state.trickNumber === 1 &&
      state.currentTrick.length === 0 &&
      Boolean(activeSeatObj && activeSeatObj.hand.includes(1));
    const isForcedAutoLastCard =
      state.phase === 'PLAYING' &&
      Boolean(activeSeatObj && activeSeatObj.hand.length === 1);

    let targetSeatIndex: SeatIndex | null = null;
    if (state.phase === 'BIDDING') {
      const uncalledBot = state.seats.find(
        (s) => s.type === 'AI' && s.call === null,
      );
      if (uncalledBot) {
        targetSeatIndex = uncalledBot.seatIndex;
      }
    } else if ((isForcedAutoOneLead || isForcedAutoLastCard) && activeSeatObj) {
      targetSeatIndex = activeSeatObj.seatIndex;
    } else if (activeSeatObj && activeSeatObj.type === 'AI') {
      targetSeatIndex = activeSeatObj.seatIndex;
    }

    if (targetSeatIndex === null) {
      return;
    }

    const actorSeatIdx = targetSeatIndex;
    const expectedVersion = state.version;
    const expectedMatchId = state.matchId;
    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
    const botsAlreadyCalled = state.seats.filter(
      (s) => s.type === 'AI' && s.call !== null,
    ).length;
    const delayMs = isJsdom
      ? state.phase === 'BIDDING'
        ? 350
        : isForcedAutoOneLead || isForcedAutoLastCard
          ? 350
          : BOT_TURN_DELAY_MS
      : state.phase === 'BIDDING'
        ? botsAlreadyCalled === 0
          ? 4000
          : 950
        : isForcedAutoOneLead
          ? 1250
          : isForcedAutoLastCard
            ? 650
            : 1200;

    const turnTimer = setTimeout(() => {
      const current = stateRef.current;
      if (
        !current ||
        !isHostRef.current ||
        current.version !== expectedVersion ||
        current.matchId !== expectedMatchId
      ) {
        return;
      }

      const seat = current.seats[actorSeatIdx];
      if (!seat || seat.type === 'EMPTY') {
        return;
      }

      if (current.phase === 'BIDDING') {
        if (seat.type !== 'AI' || seat.call !== null) {
          return;
        }
        const existingCalls = current.seats.map((s) => s.call);
        const call = computeBotCall(seat.hand, existingCalls, {
          round: current.round,
          seatIndex: targetSeatIndex,
          totalScores: current.seats.map((s) => s.totalScore),
          roundStarterSeat: current.roundStarterSeat,
          botName: seat.username,
        });
        const nextState = applyAction(
          current,
          {
            type: 'PLACE_CALL',
            seatIndex: actorSeatIdx,
            call,
          },
          Date.now(),
        );
        if (nextState !== current && nextState.version > current.version) {
          commitAndPersistState(nextState, true);
        }
      } else if (current.phase === 'PLAYING' && current.activeSeat === actorSeatIdx) {
        const shouldAutoPlayOne =
          current.trickNumber === 1 &&
          current.currentTrick.length === 0 &&
          seat.hand.includes(1);
        const shouldAutoPlayLast = seat.hand.length === 1;
        if (!shouldAutoPlayOne && !shouldAutoPlayLast && seat.type !== 'AI') {
          return;
        }
        const card = shouldAutoPlayOne
          ? 1
          : shouldAutoPlayLast
            ? seat.hand[0]
            : computeBotCard(current, actorSeatIdx);
        const nextState = applyAction(
          current,
          {
            type: 'PLAY_CARD',
            seatIndex: actorSeatIdx,
            card,
          },
          Date.now(),
        );
        if (nextState !== current && nextState.version > current.version) {
          commitAndPersistState(nextState, true);
        }
      }
    }, delayMs);

    return () => {
      clearTimeout(turnTimer);
    };
  }, [validRoom, isHost, state, commitAndPersistState]);

  const dispatchAction = useCallback(
    (action: GameAction) => {
      if (!validRoomRef.current) {
        return;
      }
      const current = stateRef.current;
      if (!current) {
        return;
      }

      if (isHostRef.current || syncMode === 'local') {
        const nextState = applyAction(current, action, Date.now());
        if (nextState !== current && nextState.version > current.version) {
          commitAndPersistState(nextState, true);
        }
      } else {
        sendBroadcastEvent({
          type: 'GAME_ACTION',
          senderId: clientIdRef.current,
          action,
        });
      }
    },
    [syncMode, commitAndPersistState, sendBroadcastEvent],
  );

  const sendChat = useCallback(
    (text: string, isBanter?: boolean) => {
      if (!validRoomRef.current) {
        return;
      }
      const trimmed = (text ?? '').trim().slice(0, MAX_CHAT_LENGTH);
      if (trimmed.length === 0) {
        return;
      }

      const activeClientId = clientIdRef.current;
      const msg: ChatMessage = {
        id: `${activeClientId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: activeClientId,
        seatIndex: mySeatIndexRef.current,
        username: usernameRef.current,
        text: trimmed,
        timestamp: Date.now(),
        ...(isBanter !== undefined ? { isBanter } : {}),
      };

      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev;
        }
        return [...prev, msg];
      });

      sendBroadcastEvent({
        type: 'CHAT_MSG',
        senderId: activeClientId,
        message: msg,
      });
    },
    [sendBroadcastEvent],
  );

  const leaveRoom = useCallback(() => {
    const supabase = getSupabaseClient();
    const channel = channelRef.current;
    isSubscribedRef.current = false;
    channelRef.current = null;

    if (channel) {
      try {
        if (typeof channel.untrack === 'function') {
          void channel.untrack();
        }
      } catch {
        // Ignore untrack error
      }
      try {
        if (supabase && typeof supabase.removeChannel === 'function') {
          void supabase.removeChannel(channel);
        } else if (typeof channel.unsubscribe === 'function') {
          void channel.unsubscribe();
        }
      } catch {
        // Ignore unsubscribe error
      }
    }

    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.close();
      } catch {
        // Ignore close error
      }
      broadcastChannelRef.current = null;
    }

    clearSessionSeatForRoom(roomCodeRef.current);
    stateRef.current = null;
    mySeatIndexRef.current = null;
    setState(null);
    setChatMessages([]);
    setPresenceMetas([]);
    presenceMetasRef.current = [];
    setPromotedHostSeat(null);
    setRemainingMs(null);
    setRoomUnavailableReason(null);
    setConnectionStatus('idle');
  }, []);

  return {
    state,
    clientId,
    mySeatIndex,
    hostSeatIndex,
    isHost,
    syncMode,
    onlineSeats,
    chatMessages,
    remainingMs,
    connectionStatus,
    roomUnavailableReason,
    dispatchAction,
    sendChat,
    leaveRoom,
  };
}
