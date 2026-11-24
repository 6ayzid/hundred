import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAction,
  assignHumanSeat,
  BID_TIMEOUT_MS,
  createInitialLobbyState,
  HOST_STALL_GRACE_MS,
  ROUND_SUMMARY_MS,
} from '@/lib/gameEngine';
import {
  getSupabaseBrowserClient,
  getSupabaseClient,
  resetSupabaseBrowserClientForTests,
  resetSupabaseClientForTests,
} from '@/lib/supabaseClient';
import {
  BOT_TURN_DELAY_MS,
  loadCachedGameState,
  SUPABASE_BOOTSTRAP_TIMEOUT_MS,
  useGameSync,
} from '@/hooks/useGameSync';
import type {
  ChatMessage,
  GameState,
  PresenceMeta,
  SyncBroadcastEvent,
} from '@/lib/types';

const mockCreateClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

interface MockChannelInstance {
  topic: string;
  options: Record<string, unknown>;
  callLog: string[];
  presenceListeners: Map<string, Array<(payload?: unknown) => void>>;
  broadcastListeners: Map<string, Array<(payload: unknown) => void>>;
  subscribeCallback: ((status: string) => void) | null;
  presenceMap: Record<string, PresenceMeta[]>;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  triggerSubscribe: (status?: string) => void;
  triggerPresence: (
    event: 'sync' | 'join' | 'leave',
    newMap?: Record<string, PresenceMeta[]>,
  ) => void;
  triggerBroadcast: (event: string, payload: SyncBroadcastEvent) => void;
}

function createMockSupabaseEnvironment() {
  const channels: MockChannelInstance[] = [];

  const createMockChannel = (
    topic: string,
    options: Record<string, unknown> = {},
  ): MockChannelInstance => {
    const callLog: string[] = [];
    const presenceListeners = new Map<
      string,
      Array<(payload?: unknown) => void>
    >();
    const broadcastListeners = new Map<
      string,
      Array<(payload: unknown) => void>
    >();

    const instance: MockChannelInstance = {
      topic,
      options,
      callLog,
      presenceListeners,
      broadcastListeners,
      subscribeCallback: null,
      presenceMap: {},
      on: vi.fn(
        (
          type: string,
          filter: { event: string },
          callback: (payload: unknown) => void,
        ) => {
          callLog.push(`on:${type}:${filter.event}`);
          if (type === 'presence') {
            const list = presenceListeners.get(filter.event) ?? [];
            list.push(callback);
            presenceListeners.set(filter.event, list);
          } else if (type === 'broadcast') {
            const list = broadcastListeners.get(filter.event) ?? [];
            list.push(callback);
            broadcastListeners.set(filter.event, list);
          }
          return instance;
        },
      ),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        callLog.push('subscribe');
        if (cb) {
          instance.subscribeCallback = cb;
        }
        return instance;
      }),
      track: vi.fn(async (meta: PresenceMeta) => {
        callLog.push('track');
        instance.presenceMap[meta.clientId] = [meta];
        return 'ok';
      }),
      untrack: vi.fn(async () => {
        callLog.push('untrack');
        return 'ok';
      }),
      send: vi.fn(async (envelope: { event: string; payload: unknown }) => {
        callLog.push(`send:${envelope.event}`);
        return 'ok';
      }),
      unsubscribe: vi.fn(async () => {
        callLog.push('unsubscribe');
        return 'ok';
      }),
      presenceState: vi.fn(() => instance.presenceMap),
      triggerSubscribe(status = 'SUBSCRIBED') {
        instance.subscribeCallback?.(status);
      },
      triggerPresence(
        event: 'sync' | 'join' | 'leave',
        newMap?: Record<string, PresenceMeta[]>,
      ) {
        if (newMap) {
          instance.presenceMap = newMap;
        }
        const handlers = presenceListeners.get(event) ?? [];
        for (const fn of handlers) {
          fn();
        }
      },
      triggerBroadcast(event: string, payload: SyncBroadcastEvent) {
        const handlers = broadcastListeners.get(event) ?? [];
        for (const fn of handlers) {
          fn({ type: 'broadcast', event, payload });
        }
      },
    };

    channels.push(instance);
    return instance;
  };

  const mockSupabaseClient = {
    channel: vi.fn(
      (topic: string, options?: Record<string, unknown>) =>
        createMockChannel(topic, options),
    ),
    removeChannel: vi.fn(async () => 'ok'),
  };

  return { mockSupabaseClient, channels };
}

describe('Milestone 3: lib/supabaseClient.ts & hooks/useGameSync.ts', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T10:00:00.000Z'));
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockCreateClient.mockReset();
    resetSupabaseBrowserClientForTests();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSupabaseClientForTests();
    if (originalUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
    if (originalKey !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  describe('1. lib/supabaseClient.ts Lazy Factory & Unconfigured Null Guard', () => {
    it('returns null immediately without calling createClient when env keys are missing or blank', () => {
      expect(getSupabaseBrowserClient()).toBeNull();
      expect(getSupabaseClient()).toBeNull();
      expect(mockCreateClient).not.toHaveBeenCalled();

      process.env.NEXT_PUBLIC_SUPABASE_URL = '   ';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
      expect(getSupabaseClient()).toBeNull();
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it('lazily constructs and caches a singleton SupabaseClient when configured', () => {
      const fakeInstance = { channel: vi.fn() };
      mockCreateClient.mockReturnValue(fakeInstance);

      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tangail.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-public-key-123';

      const client1 = getSupabaseBrowserClient();
      const client2 = getSupabaseClient();

      expect(client1).toBe(fakeInstance);
      expect(client2).toBe(fakeInstance);
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://tangail.supabase.co',
        'anon-public-key-123',
        expect.objectContaining({
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 20 } },
        }),
      );
    });
  });

  describe('2. Local Fallback Mode, Session Identity (F-13) & Invalid Room Guard', () => {
    it('initializes clientId in sessionStorage even when enabled is false, while keeping seatIndex null and writing zero localStorage state keys', () => {
      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-KM47',
          username: 'Rafi',
          enabled: false,
        }),
      );

      expect(result.current.clientId.length).toBeGreaterThan(0);
      expect(window.sessionStorage.getItem('eksho_client_id')).toBe(
        result.current.clientId,
      );
      expect(window.sessionStorage.getItem('clientId')).toBe(
        result.current.clientId,
      );
      expect(window.sessionStorage.getItem('seatIndex')).toBeNull();
      expect(window.sessionStorage.getItem('eksho_seat_index')).toBeNull();
      expect(window.localStorage.getItem('eksho_state_TNG-KM47')).toBeNull();
      expect(result.current.state).toBeNull();
      expect(result.current.mySeatIndex).toBeNull();
      expect(result.current.connectionStatus).toBe('idle');
    });

    it('rejects invalid room codes without writing eksho_state_* keys to localStorage', () => {
      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'INVALID-CODE-999',
          username: 'Rafi',
          enabled: true,
        }),
      );

      expect(result.current.state).toBeNull();
      expect(result.current.connectionStatus).toBe('idle');
      expect(window.localStorage.length).toBe(0);
    });

    it('hydrates immediately in local mode at Seat 0, persists sessionStorage seatIndex and localStorage eksho_state_${roomCode}, and clears seatIndex on leaveRoom()', () => {
      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'tng-km47',
          username: 'Rafi',
          enabled: true,
        }),
      );

      expect(result.current.syncMode).toBe('local');
      expect(result.current.connectionStatus).toBe('local');
      expect(result.current.state).not.toBeNull();
      expect(result.current.state?.roomCode).toBe('TNG-KM47');
      expect(result.current.state?.phase).toBe('LOBBY');
      expect(result.current.mySeatIndex).toBe(0);
      expect(result.current.hostSeatIndex).toBe(0);
      expect(result.current.isHost).toBe(true);

      expect(window.sessionStorage.getItem('eksho_seat_TNG-KM47')).toBe('0');
      expect(window.sessionStorage.getItem('seatIndex')).toBe('0');
      expect(window.sessionStorage.getItem('eksho_seat_index')).toBe('0');

      const cached = loadCachedGameState('TNG-KM47');
      expect(cached).not.toBeNull();
      expect(cached?.seats[0].username).toBe('Rafi');
      expect(cached?.seats[0].clientId).toBe(result.current.clientId);

      act(() => {
        result.current.leaveRoom();
      });

      expect(result.current.state).toBeNull();
      expect(result.current.mySeatIndex).toBeNull();
      expect(result.current.connectionStatus).toBe('idle');
      expect(window.sessionStorage.getItem('seatIndex')).toBeNull();
      expect(window.sessionStorage.getItem('eksho_seat_index')).toBeNull();
      expect(window.sessionStorage.getItem('eksho_seat_TNG-KM47')).toBeNull();
    });
  });

  describe('3. Corrupt Storage Recovery & Mid-Match Snapshot Restoration (F-16)', () => {
    it('recovers cleanly from malformed JSON or invalid schema in localStorage without crashing', () => {
      window.localStorage.setItem('eksho_state_TNG-KM47', '{not-valid-json!!!');

      const { result, unmount } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-KM47',
          username: 'RecoveredHost',
          enabled: true,
        }),
      );

      expect(result.current.state?.phase).toBe('LOBBY');
      expect(result.current.mySeatIndex).toBe(0);
      expect(result.current.state?.seats[0].username).toBe('RecoveredHost');
      unmount();

      // Now inject schema-invalid JSON
      window.localStorage.setItem(
        'eksho_state_TNG-KM47',
        JSON.stringify({ corrupt: true, seats: 'bad', round: -99 }),
      );

      const { result: result2 } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-KM47',
          username: 'RecoveredHost2',
          enabled: true,
        }),
      );

      expect(result2.current.state?.phase).toBe('LOBBY');
      expect(result2.current.state?.seats[0].username).toBe('RecoveredHost2');
    });

    it('restores mid-match high-version state from localStorage across page reloads without resetting to LOBBY', () => {
      const existingClientId = 'tab-1-persistent-client';
      window.sessionStorage.setItem('eksho_client_id', existingClientId);
      window.sessionStorage.setItem('clientId', existingClientId);

      let state = createInitialLobbyState(
        'TNG-BD71',
        existingClientId,
        'Shakib',
        Date.now(),
      );
      state = applyAction(state, { type: 'FILL_BOTS_AND_START' }, Date.now());
      for (let i = 0; i < 4; i += 1) {
        const s = state.activeSeat;
        state = applyAction(
          state,
          { type: 'PLACE_CALL', seatIndex: s, call: s === 0 ? 150 : 100 },
          Date.now(),
        );
      }

      const highVersionMidMatch: GameState = {
        ...state,
        version: state.version + 20,
        phase: 'PLAYING',
        trickNumber: 5,
      };
      window.localStorage.setItem(
        'eksho_state_TNG-BD71',
        JSON.stringify(highVersionMidMatch),
      );

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-BD71',
          username: 'Shakib',
          enabled: true,
        }),
      );

      expect(result.current.clientId).toBe(existingClientId);
      expect(result.current.mySeatIndex).toBe(0);
      expect(result.current.state?.phase).toBe('PLAYING');
      expect(result.current.state?.round).toBe(1);
      expect(result.current.state?.trickNumber).toBe(5);
      expect(result.current.state?.seats[0].call).toBe(150);
      expect(result.current.state?.version).toBe(highVersionMidMatch.version);
    });
  });

  describe('4. Supabase Realtime Channel Protocol, Listener Ordering & Self-Echo Guard (F-12, F-13, F-14)', () => {
    it('attaches presence and broadcast listeners BEFORE calling .subscribe() and waits for SUBSCRIBED before calling .track() or .send()', () => {
      const { mockSupabaseClient, channels } = createMockSupabaseEnvironment();
      mockCreateClient.mockReturnValue(mockSupabaseClient);
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tangail.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123';

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-RT12',
          username: 'HostPlayer',
          enabled: true,
        }),
      );

      expect(result.current.syncMode).toBe('supabase');
      expect(result.current.connectionStatus).toBe('connecting');
      expect(channels).toHaveLength(1);

      const channel = channels[0];
      expect(channel.topic).toBe('eksho:TNG-RT12');
      expect(channel.options).toEqual({
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: result.current.clientId, enabled: true },
        },
      });

      // Verify all .on() listeners were registered strictly before .subscribe()
      const subscribeIdx = channel.callLog.indexOf('subscribe');
      expect(subscribeIdx).toBeGreaterThan(0);
      const preSubscribeCalls = channel.callLog.slice(0, subscribeIdx);
      expect(preSubscribeCalls).toContain('on:presence:sync');
      expect(preSubscribeCalls).toContain('on:presence:join');
      expect(preSubscribeCalls).toContain('on:presence:leave');
      expect(preSubscribeCalls).toContain('on:broadcast:JOIN_REQUEST');
      expect(preSubscribeCalls).toContain('on:broadcast:REQUEST_SYNC');
      expect(preSubscribeCalls).toContain('on:broadcast:GAME_ACTION');
      expect(preSubscribeCalls).toContain('on:broadcast:STATE_SNAPSHOT');
      expect(preSubscribeCalls).toContain('on:broadcast:CHAT_MSG');

      // Before SUBSCRIBED, neither track() nor send() may be called
      expect(channel.track).not.toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();

      // Trigger SUBSCRIBED
      act(() => {
        channel.triggerSubscribe('SUBSCRIBED');
      });

      expect(result.current.connectionStatus).toBe('connected');
      expect(channel.track).toHaveBeenCalledTimes(1);
      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'REQUEST_SYNC',
          payload: {
            type: 'REQUEST_SYNC',
            senderId: result.current.clientId,
          },
        }),
      );

      // Advance past bootstrap window so solo client initializes Seat 0 Host state
      act(() => {
        vi.advanceTimersByTime(SUPABASE_BOOTSTRAP_TIMEOUT_MS + 50);
      });

      expect(result.current.state).not.toBeNull();
      expect(result.current.mySeatIndex).toBe(0);
      expect(result.current.isHost).toBe(true);
    });

    it('handles JOIN_REQUEST and REQUEST_SYNC on the Host, rejects stale STATE_SNAPSHOT versions, and prevents self-echo duplicates', () => {
      const { mockSupabaseClient, channels } = createMockSupabaseEnvironment();
      mockCreateClient.mockReturnValue(mockSupabaseClient);
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tangail.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123';

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-JN10',
          username: 'HostZero',
          enabled: true,
        }),
      );

      const channel = channels[0];
      act(() => {
        channel.triggerSubscribe('SUBSCRIBED');
        vi.advanceTimersByTime(SUPABASE_BOOTSTRAP_TIMEOUT_MS + 50);
      });

      const hostClientId = result.current.clientId;
      expect(result.current.mySeatIndex).toBe(0);
      expect(result.current.isHost).toBe(true);
      const initialVersion = result.current.state!.version;

      // Peer 1 sends JOIN_REQUEST
      act(() => {
        channel.triggerBroadcast('JOIN_REQUEST', {
          type: 'JOIN_REQUEST',
          senderId: 'peer-client-1',
          username: 'Nadia',
        });
      });

      expect(result.current.state?.seats[1].type).toBe('HUMAN');
      expect(result.current.state?.seats[1].clientId).toBe('peer-client-1');
      expect(result.current.state?.seats[1].username).toBe('Nadia');
      expect(result.current.state!.version).toBeGreaterThan(initialVersion);

      const afterJoinVersion = result.current.state!.version;

      // Incoming stale STATE_SNAPSHOT with version <= current.version must be ignored
      const staleSnapshot: GameState = {
        ...result.current.state!,
        version: afterJoinVersion - 1,
        round: 9,
      };
      act(() => {
        channel.triggerBroadcast('STATE_SNAPSHOT', {
          type: 'STATE_SNAPSHOT',
          senderId: 'peer-client-1',
          state: staleSnapshot,
        });
      });
      expect(result.current.state?.version).toBe(afterJoinVersion);
      expect(result.current.state?.round).toBe(0);

      // Incoming self-echo STATE_SNAPSHOT (with senderId === hostClientId) must be ignored even if version is higher
      const selfEchoSnapshot: GameState = {
        ...result.current.state!,
        version: afterJoinVersion + 99,
      };
      act(() => {
        channel.triggerBroadcast('STATE_SNAPSHOT', {
          type: 'STATE_SNAPSHOT',
          senderId: hostClientId,
          state: selfEchoSnapshot,
        });
      });
      expect(result.current.state?.version).toBe(afterJoinVersion);

      // Blank chat is ignored; valid chat appears once and ignores self-echo broadcast
      act(() => {
        result.current.sendChat('   ');
      });
      expect(result.current.chatMessages).toHaveLength(0);

      act(() => {
        result.current.sendChat('100 charlam!', true);
      });
      expect(result.current.chatMessages).toHaveLength(1);
      const sentMsg: ChatMessage = result.current.chatMessages[0];

      // Simulate self-echo and duplicate ID from peer
      act(() => {
        channel.triggerBroadcast('CHAT_MSG', {
          type: 'CHAT_MSG',
          senderId: hostClientId,
          message: { ...sentMsg, id: 'different-id' },
        });
        channel.triggerBroadcast('CHAT_MSG', {
          type: 'CHAT_MSG',
          senderId: 'peer-client-1',
          message: sentMsg,
        });
      });
      expect(result.current.chatMessages).toHaveLength(1);

      // Genuine message from peer-client-1 is appended
      act(() => {
        channel.triggerBroadcast('CHAT_MSG', {
          type: 'CHAT_MSG',
          senderId: 'peer-client-1',
          message: {
            id: 'peer-msg-1',
            senderId: 'peer-client-1',
            seatIndex: 1,
            username: 'Nadia',
            text: 'Call koto?',
            timestamp: Date.now(),
            isBanter: true,
          },
        });
      });
      expect(result.current.chatMessages).toHaveLength(2);
    });

    it('deterministically elects the lowest online seatIndex as Host and migrates Host when Seat 0 disconnects from Presence (F-14)', () => {
      const { mockSupabaseClient, channels } = createMockSupabaseEnvironment();
      mockCreateClient.mockReturnValue(mockSupabaseClient);
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tangail.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123';

      window.sessionStorage.setItem('eksho_client_id', 'client-seat-1');
      window.sessionStorage.setItem('clientId', 'client-seat-1');

      // Seed state with Seat 0 (client-seat-0) and Seat 1 (client-seat-1)
      let seeded = createInitialLobbyState(
        'TNG-HM44',
        'client-seat-0',
        'PlayerZero',
        Date.now(),
      );
      seeded = assignHumanSeat(
        seeded,
        'client-seat-1',
        'PlayerOne',
        Date.now(),
      );
      window.localStorage.setItem(
        'eksho_state_TNG-HM44',
        JSON.stringify(seeded),
      );

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-HM44',
          username: 'PlayerOne',
          enabled: true,
        }),
      );

      const channel = channels[0];
      act(() => {
        channel.triggerSubscribe('SUBSCRIBED');
        // Both Seat 0 and Seat 1 are online in Presence
        channel.triggerPresence('sync', {
          'client-seat-0': [
            {
              clientId: 'client-seat-0',
              seatIndex: 0,
              username: 'PlayerZero',
              joinedAt: 1000,
            },
          ],
          'client-seat-1': [
            {
              clientId: 'client-seat-1',
              seatIndex: 1,
              username: 'PlayerOne',
              joinedAt: 1005,
            },
          ],
        });
      });

      expect(result.current.mySeatIndex).toBe(1);
      expect(result.current.hostSeatIndex).toBe(0);
      expect(result.current.isHost).toBe(false);
      expect(result.current.onlineSeats).toEqual([0, 1]);

      // Seat 0 disconnects from Presence -> Seat 1 deterministically becomes Host
      act(() => {
        channel.triggerPresence('leave', {
          'client-seat-1': [
            {
              clientId: 'client-seat-1',
              seatIndex: 1,
              username: 'PlayerOne',
              joinedAt: 1005,
            },
          ],
        });
      });

      expect(result.current.hostSeatIndex).toBe(1);
      expect(result.current.isHost).toBe(true);
      expect(result.current.onlineSeats).toEqual([1]);
    });
  });

  describe('5. Shot-Clocks (25s Bid / 20s Play), Phase Transitions (2.2s / 4.5s), Bots & >2500ms Stall Watchdog (F-15)', () => {
    it('enforces 25s bidding timeout (auto-calls 50), 650ms AI bot turns, and 20s card play timeout (auto-plays lowest card)', () => {
      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-CK25',
          username: 'HostHuman',
          enabled: true,
        }),
      );

      // Start match with 3 AI bots (Siam, Apon, Nabil)
      act(() => {
        result.current.dispatchAction({ type: 'FILL_BOTS_AND_START' });
      });

      expect(result.current.state?.phase).toBe('BIDDING');
      // AI bots lock in simultaneously while Seat 0 hasn't called yet
      for (let guard = 0; guard < 3; guard += 1) {
        act(() => {
          vi.advanceTimersByTime(400);
        });
      }
      expect(result.current.state?.phase).toBe('BIDDING');
      expect(result.current.state?.seats[0].call).toBeNull();
      expect(result.current.state?.seats[1].call).not.toBeNull();
      expect(result.current.state?.seats[2].call).not.toBeNull();
      expect(result.current.state?.seats[3].call).not.toBeNull();

      // Advance 20s (< 25s total): Seat 0 still hasn't timed out
      act(() => {
        vi.advanceTimersByTime(18_000);
      });
      expect(result.current.state?.seats[0].call).toBeNull();

      // Advance remaining ~6s (past 25_000ms deadline): Seat 0 auto-calls 50 & transitions to PLAYING
      act(() => {
        vi.advanceTimersByTime(6_500);
      });
      expect(result.current.state?.seats[0].call).toBe(50);
      expect(result.current.state?.phase).toBe('PLAYING');

      // If Seat 0 happens to hold 1 on Trick 1 lead, Host auto-plays 1 first (350ms in jsdom)
      if (
        result.current.state?.activeSeat === 0 &&
        result.current.state.trickNumber === 1 &&
        result.current.state.currentTrick.length === 0 &&
        result.current.state.seats[0].hand.includes(1)
      ) {
        act(() => {
          vi.advanceTimersByTime(BOT_TURN_DELAY_MS + 50);
        });
        expect(result.current.state?.currentTrick).toContainEqual({
          seatIndex: 0,
          card: 1,
        });
        // Complete Trick 1 and transition past TRICK_COMPLETE_MS so Seat 0 tests 20s timeout on Trick 2
        for (
          let botStep = 0;
          botStep < 3 && result.current.state?.phase === 'PLAYING';
          botStep += 1
        ) {
          act(() => {
            vi.advanceTimersByTime(BOT_TURN_DELAY_MS + 50);
          });
        }
        act(() => {
          vi.advanceTimersByTime(3_000);
        });
      }

      // Let any AI bots leading before Seat 0 play first
      for (let guard = 0; guard < 3 && result.current.state?.activeSeat !== 0; guard += 1) {
        act(() => {
          vi.advanceTimersByTime(BOT_TURN_DELAY_MS + 50);
        });
      }
      expect(result.current.state?.activeSeat).toBe(0);
      const initialHand = [...result.current.state!.seats[0].hand];
      const expectedBeforeCount = initialHand.length;
      const lowestCard = Math.min(...initialHand);
      expect(expectedBeforeCount).toBeGreaterThanOrEqual(4);

      // Advance 15s (< 20s): Seat 0 hand still has same cards
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(result.current.state?.seats[0].hand).toHaveLength(expectedBeforeCount);

      // Advance remaining 5.1s (total 20.1s): Seat 0 auto-plays lowestCard
      act(() => {
        vi.advanceTimersByTime(5_100);
      });
      expect(result.current.state?.seats[0].hand).toHaveLength(expectedBeforeCount - 1);
      expect(result.current.state?.seats[0].hand).not.toContain(lowestCard);
      expect(result.current.state?.currentTrick).toContainEqual({
        seatIndex: 0,
        card: lowestCard,
      });

      // Let remaining AI bots play their trick cards until TRICK_COMPLETE
      for (let botStep = 0; botStep < 3 && result.current.state?.phase === 'PLAYING'; botStep += 1) {
        act(() => {
          vi.advanceTimersByTime(BOT_TURN_DELAY_MS + 50);
        });
      }

      // Phase is now TRICK_COMPLETE with 4 cards visible
      expect(result.current.state?.phase).toBe('TRICK_COMPLETE');
      expect(result.current.state?.currentTrick).toHaveLength(4);
      const expectedNextTrick = result.current.state!.trickNumber + 1;

      // At +1200ms (< 2900ms), still in TRICK_COMPLETE
      act(() => {
        vi.advanceTimersByTime(1_200);
      });
      expect(result.current.state?.phase).toBe('TRICK_COMPLETE');

      // At +1800ms more (total 3000ms >= 2900ms TRICK_COMPLETE_MS), transitions to next trick PLAYING
      act(() => {
        vi.advanceTimersByTime(1_800);
      });
      expect(result.current.state?.phase).toBe('PLAYING');
      expect(result.current.state?.trickNumber).toBe(expectedNextTrick);
    });

    it('auto-transitions ROUND_SUMMARY after 6500ms (ROUND_SUMMARY_MS) to the next round', () => {
      const clientId = 'summary-host-id';
      window.sessionStorage.setItem('eksho_client_id', clientId);
      window.sessionStorage.setItem('clientId', clientId);

      const now = Date.now();
      let base = createInitialLobbyState('TNG-RS45', clientId, 'Host', now);
      base = applyAction(base, { type: 'FILL_BOTS_AND_START' }, now);

      const summaryState: GameState = {
        ...base,
        version: 30,
        phase: 'ROUND_SUMMARY',
        round: 1,
        turnDeadline: now + ROUND_SUMMARY_MS,
        emittedAt: now,
        roundHistory: [
          {
            round: 1,
            entries: [0, 1, 2, 3].map((idx) => ({
              seatIndex: idx as 0 | 1 | 2 | 3,
              username: base.seats[idx].username,
              call: 100,
              capturedPoints: 100,
              pointsAwarded: 100,
              totalAfter: 100,
            })),
          },
        ],
      };
      window.localStorage.setItem(
        'eksho_state_TNG-RS45',
        JSON.stringify(summaryState),
      );

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-RS45',
          username: 'Host',
          enabled: true,
        }),
      );

      expect(result.current.state?.phase).toBe('ROUND_SUMMARY');
      expect(result.current.state?.round).toBe(1);

      act(() => {
        vi.advanceTimersByTime(ROUND_SUMMARY_MS + 200);
      });

      expect(result.current.state?.phase).toBe('BIDDING');
      expect(result.current.state?.round).toBe(2);
    });

    it('auto-plays card 1 on Trick 1 lead once all 4 calls lock even when held by a human player', () => {
      const clientId = 'auto-one-host';
      window.sessionStorage.setItem('eksho_client_id', clientId);
      window.sessionStorage.setItem('clientId', clientId);

      const now = Date.now();
      let base = createInitialLobbyState('TNG-AO11', clientId, 'Rafiq', now);
      base = applyAction(base, { type: 'FILL_BOTS_AND_START' }, now);
      // Force Seat 0 (human) to hold card 1 and Seat 1..3 calls locked so Seat 0 locks last
      const seededSeats = [
        { ...base.seats[0], hand: [1, 15, 25, 45, 70] as const, call: null },
        { ...base.seats[1], hand: [5, 30, 50, 80, 95] as const, call: 100 },
        { ...base.seats[2], hand: [10, 35, 55, 75, 100] as const, call: 100 },
        { ...base.seats[3], hand: [20, 40, 60, 65, 90] as const, call: 100 },
      ];
      const seeded: GameState = {
        ...base,
        version: 10,
        roundStarterSeat: 0,
        activeSeat: 0,
        trickLeaderSeat: 0,
        seats: seededSeats as unknown as GameState['seats'],
      };
      window.localStorage.setItem('eksho_state_TNG-AO11', JSON.stringify(seeded));

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-AO11',
          username: 'Rafiq',
          enabled: true,
        }),
      );

      act(() => {
        result.current.dispatchAction({
          type: 'PLACE_CALL',
          seatIndex: 0,
          call: 100,
        });
      });

      expect(result.current.state?.phase).toBe('PLAYING');
      expect(result.current.state?.activeSeat).toBe(0);
      expect(result.current.state?.currentTrick).toHaveLength(0);

      // Host auto-plays 1 cleanly in jsdom (~350ms) without manual card tap
      act(() => {
        vi.advanceTimersByTime(450);
      });

      expect(result.current.state?.currentTrick[0]).toEqual({
        seatIndex: 0,
        card: 1,
      });
      expect(result.current.state?.seats[0].hand).not.toContain(1);
      expect(result.current.state?.activeSeat).toBe(1);
    });

    it('auto-plays the last card automatically on the final turn when active player has only 1 card left', () => {
      const clientId = 'auto-last-host';
      window.sessionStorage.setItem('eksho_client_id', clientId);
      window.sessionStorage.setItem('clientId', clientId);

      const now = Date.now();
      let base = createInitialLobbyState('TNG-LC55', clientId, 'Bayzid', now);
      base = applyAction(base, { type: 'FILL_BOTS_AND_START' }, now);

      const lastTurnSeats = [
        { ...base.seats[0], hand: [75] as const, call: 100 },
        { ...base.seats[1], hand: [40] as const, call: 100 },
        { ...base.seats[2], hand: [90] as const, call: 100 },
        { ...base.seats[3], hand: [25] as const, call: 100 },
      ];
      const finalTrickState: GameState = {
        ...base,
        version: 42,
        phase: 'PLAYING',
        trickNumber: 5,
        roundStarterSeat: 0,
        trickLeaderSeat: 0,
        activeSeat: 0,
        currentTrick: [],
        seats: lastTurnSeats as unknown as GameState['seats'],
      };
      window.localStorage.setItem('eksho_state_TNG-LC55', JSON.stringify(finalTrickState));

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-LC55',
          username: 'Bayzid',
          enabled: true,
        }),
      );

      expect(result.current.state?.seats[0].hand).toEqual([75]);

      act(() => {
        vi.advanceTimersByTime(450);
      });

      expect(result.current.state?.currentTrick[0]).toEqual({
        seatIndex: 0,
        card: 75,
      });
      expect(result.current.state?.seats[0].hand).toEqual([]);
      expect(result.current.state?.activeSeat).toBe(1);
    });

    it('triggers >2500ms Host stall watchdog failover on Seat 1 when Host (Seat 0) stalls past turnDeadline', () => {
      const { mockSupabaseClient, channels } = createMockSupabaseEnvironment();
      mockCreateClient.mockReturnValue(mockSupabaseClient);
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://tangail.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-123';

      window.sessionStorage.setItem('eksho_client_id', 'backup-client-1');
      window.sessionStorage.setItem('clientId', 'backup-client-1');

      const now = Date.now();
      let state = createInitialLobbyState(
        'TNG-WD99',
        'stalled-host-0',
        'HostZero',
        now,
      );
      state = assignHumanSeat(state, 'backup-client-1', 'BackupOne', now);
      state = applyAction(state, { type: 'FILL_BOTS_AND_START' }, now);

      window.localStorage.setItem(
        'eksho_state_TNG-WD99',
        JSON.stringify(state),
      );

      const { result } = renderHook(() =>
        useGameSync({
          roomCode: 'TNG-WD99',
          username: 'BackupOne',
          enabled: true,
        }),
      );

      const channel = channels[0];
      act(() => {
        channel.triggerSubscribe('SUBSCRIBED');
        channel.triggerPresence('sync', {
          'stalled-host-0': [
            {
              clientId: 'stalled-host-0',
              seatIndex: 0,
              username: 'HostZero',
              joinedAt: now - 1000,
            },
          ],
          'backup-client-1': [
            {
              clientId: 'backup-client-1',
              seatIndex: 1,
              username: 'BackupOne',
              joinedAt: now - 500,
            },
          ],
        });
      });

      expect(result.current.mySeatIndex).toBe(1);
      expect(result.current.hostSeatIndex).toBe(0);
      expect(result.current.isHost).toBe(false);
      expect(result.current.state?.phase).toBe('BIDDING');
      const stalledSeat = result.current.state!.activeSeat;

      // Advance to turnDeadline + 1500ms (< turnDeadline + 2500ms): Backup Seat 1 must NOT intervene yet
      act(() => {
        vi.advanceTimersByTime(BID_TIMEOUT_MS + 1_500);
      });
      expect(result.current.isHost).toBe(false);
      expect(result.current.state?.seats[stalledSeat].call).toBeNull();

      // Advance past turnDeadline + HOST_STALL_GRACE_MS (2500ms): Seat 1 self-promotes, resolves bid timeout to 50, persists, and broadcasts STATE_SNAPSHOT
      act(() => {
        vi.advanceTimersByTime(HOST_STALL_GRACE_MS - 1_500 + 250);
      });

      expect(result.current.isHost).toBe(true);
      expect(result.current.hostSeatIndex).toBe(1);
      expect(result.current.state?.seats[stalledSeat].call).toBe(50);
      expect(result.current.state?.phase).toBe('PLAYING');
      expect(result.current.state?.activeSeat).toBe(result.current.state?.roundStarterSeat);

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'STATE_SNAPSHOT',
          payload: expect.objectContaining({
            type: 'STATE_SNAPSHOT',
            senderId: 'backup-client-1',
          }),
        }),
      );

      const storedAfterFailover = loadCachedGameState('TNG-WD99');
      expect(storedAfterFailover?.seats[stalledSeat].call).toBe(50);
      expect(storedAfterFailover?.phase).toBe('PLAYING');
    });
  });
});
