import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOT_NAMES,
  CARD_TIER_CLASSES,
  DECK_CARDS,
  QUICK_CALL_VALUES,
  SEAT_INDICES,
  type CardTier,
  type CardValue,
  type GameAction,
  type GamePhase,
  type GameState,
  type SeatIndex,
  type TrickPlay,
} from '@/lib/types';
import {
  AUTO_TIMEOUT_CALL,
  BID_TIMEOUT_MS,
  CANONICAL_ROOM_CODE_PATTERN,
  CARDS_PER_HAND,
  HOST_STALL_GRACE_MS,
  PLAY_TIMEOUT_MS,
  ROOM_CODE_PATTERN,
  ROUND_SUMMARY_MS,
  TOTAL_ROUNDS,
  TRICK_COMPLETE_MS,
  TRICKS_PER_ROUND,
  applyAction,
  assignHumanSeat,
  computeBotCall,
  computeBotCard,
  createInitialLobbyState,
  generateRoomCode,
  getCardTier,
  getMatchRankings,
  getNextSeat,
  getRoundStarterSeat,
  getTrickPoints,
  getTrickWinner,
  isValidCallValue,
  isValidCardValue,
  isValidGameState,
  isValidRoomCode,
  isValidSeatIndex,
  normalizeRoomCode,
  resolveTimeoutOrTransition,
  setSeatOnlineStatus,
  shuffleDeck,
  syncPresenceOnlineStatus,
} from '@/lib/gameEngine';

function unsafeCard(value: number): CardValue {
  return value as unknown as CardValue;
}

function unsafeSeat(value: number): SeatIndex {
  return value as unknown as SeatIndex;
}

function unsafeAction(value: unknown): GameAction {
  return value as unknown as GameAction;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      const prop = (value as Record<string, unknown>)[key];
      if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    }
  }
  return value;
}

/**
 * Produces a deterministic RNG that forces `shuffleDeck(rng)` to yield `targetOrder`.
 */
function createDeckTargetRng(targetOrder: readonly CardValue[]): () => number {
  const working: CardValue[] = [...DECK_CARDS];
  const outputs: number[] = [];

  for (let i = working.length - 1; i > 0; i -= 1) {
    const desired = targetOrder[i];
    const j = working.indexOf(desired);
    if (j === -1 || j > i) {
      throw new Error(`Invalid target card ${desired} at index ${i}`);
    }
    const tmp = working[i];
    working[i] = working[j];
    working[j] = tmp;
    outputs.push((j + 0.5) / (i + 1));
  }

  let cursor = 0;
  return () => {
    const value = outputs[cursor] ?? 0.5;
    cursor += 1;
    return value;
  };
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function playSingleTrick(
  initialState: GameState,
  cardsBySeat: Readonly<Record<SeatIndex, CardValue>>,
  startTime: number,
): GameState {
  let state = initialState;
  let now = startTime;

  for (let turn = 0; turn < 4; turn += 1) {
    const active = state.activeSeat;
    now += 100;
    state = applyAction(
      state,
      { type: 'PLAY_CARD', seatIndex: active, card: cardsBySeat[active] },
      now,
    );
  }
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('1. DECK_CARDS and 5-card deals (F-07, F-08)', () => {
  it('defines the exact 20-card unique deck excluding 85 with total sum 966', () => {
    expect(DECK_CARDS).toHaveLength(20);
    expect([...DECK_CARDS]).toEqual([
      1, 5, 10, 15, 20, 25, 30, 35, 40, 45,
      50, 55, 60, 65, 70, 75, 80, 90, 95, 100,
    ]);
    expect(DECK_CARDS as readonly number[]).not.toContain(85);
    expect(DECK_CARDS).toContain(1);
    expect(DECK_CARDS).toContain(100);
    expect(new Set(DECK_CARDS).size).toBe(20);

    const sum = DECK_CARDS.reduce((acc, val) => acc + val, 0);
    expect(sum).toBe(966);
  });

  it('deals 4 disjoint sorted 5-card hands summing to 966 across 50 deals', () => {
    const rng = createMulberry32(20261122);
    const seenSeat0Hands = new Set<string>();

    for (let i = 0; i < 50; i += 1) {
      const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 10_000 + i);
      const started = applyAction(
        lobby,
        { type: 'FILL_BOTS_AND_START' },
        10_500 + i,
        rng,
      );

      expect(started.phase).toBe('BIDDING');
      expect(started.round).toBe(1);

      const allDealt: CardValue[] = [];
      for (const idx of SEAT_INDICES) {
        const hand = started.seats[idx].hand;
        expect(hand).toHaveLength(CARDS_PER_HAND);
        for (let k = 0; k < hand.length - 1; k += 1) {
          expect(hand[k]).toBeLessThan(hand[k + 1]);
        }
        allDealt.push(...hand);
      }

      seenSeat0Hands.add(started.seats[0].hand.join(','));
      expect(allDealt).toHaveLength(20);
      expect(allDealt as number[]).not.toContain(85);
      expect(allDealt).toContain(1);
      expect(allDealt).toContain(100);
      expect(new Set(allDealt).size).toBe(20);
      expect([...allDealt].sort((a, b) => a - b)).toEqual([...DECK_CARDS]);
      expect(allDealt.reduce((acc, c) => acc + c, 0)).toBe(966);
    }

    expect(seenSeat0Hands.size).toBeGreaterThan(10);
  });

  it('clamps adversarial RNG bounds cleanly during shuffleDeck', () => {
    const lowDeck = shuffleDeck(() => -5);
    const highDeck = shuffleDeck(() => 42);
    const nanDeck = shuffleDeck(() => Number.NaN);

    for (const d of [lowDeck, highDeck, nanDeck]) {
      expect(d).toHaveLength(20);
      expect(new Set(d).size).toBe(20);
      expect([...d].sort((a, b) => a - b)).toEqual([...DECK_CARDS]);
    }
  });
});

describe('2. getCardTier across all 20 cards and CSS mapping (F-07, F-27)', () => {
  it('maps every single card in DECK_CARDS to its exact color tier', () => {
    const expectedTiers: Array<[CardValue, CardTier]> = [
      [1, 'brick-red'],
      [5, 'brick-red'],
      [10, 'brick-red'],
      [15, 'brick-red'],
      [20, 'brick-red'],
      [25, 'ochre-yellow'],
      [30, 'ochre-yellow'],
      [35, 'ochre-yellow'],
      [40, 'ochre-yellow'],
      [45, 'ochre-yellow'],
      [50, 'forest-green'],
      [55, 'forest-green'],
      [60, 'forest-green'],
      [65, 'forest-green'],
      [70, 'forest-green'],
      [75, 'cobalt-blue'],
      [80, 'cobalt-blue'],
      [90, 'cobalt-blue'],
      [95, 'charcoal-gold'],
      [100, 'charcoal-gold'],
    ];

    expect(expectedTiers).toHaveLength(DECK_CARDS.length);
    const observedTiers = new Set<CardTier>();

    for (const [card, expectedTier] of expectedTiers) {
      const tier = getCardTier(card);
      expect(tier).toBe(expectedTier);
      observedTiers.add(tier);
    }

    expect(observedTiers.size).toBe(5);
  });

  it('maps every CardTier via CARD_TIER_CLASSES to an existing CSS rule in app/globals.css', () => {
    const globalsCss = fs.readFileSync(
      path.resolve(process.cwd(), 'app/globals.css'),
      'utf8',
    );
    for (const card of DECK_CARDS) {
      const cssClass = CARD_TIER_CLASSES[getCardTier(card)];
      expect(globalsCss).toContain(`.${cssClass}`);
    }
  });
});

describe('3. Room code generation, normalization, and validation (F-04)', () => {
  it('generates canonical TNG-[A-Z]{2}\\d{2} codes and respects RNG bounds', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const code = generateRoomCode();
      expect(code).toMatch(CANONICAL_ROOM_CODE_PATTERN);
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(isValidRoomCode(code)).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(50);

    expect(generateRoomCode(() => 0)).toMatch(CANONICAL_ROOM_CODE_PATTERN);
    expect(generateRoomCode(() => 0.999999)).toMatch(CANONICAL_ROOM_CODE_PATTERN);
    expect(generateRoomCode(() => 1)).toMatch(CANONICAL_ROOM_CODE_PATTERN);
    expect(generateRoomCode(() => Number.NaN)).toMatch(CANONICAL_ROOM_CODE_PATTERN);
  });

  it('normalizes valid codes, invite URLs, and query snippets accurately', () => {
    const cases: Array<[string, string, boolean]> = [
      ['TNG-KM47', 'TNG-KM47', true],
      ['tng-km47', 'TNG-KM47', true],
      ['  tng-ab12 \n', 'TNG-AB12', true],
      ['TNG-XX', 'TNG-XX', true],
      ['tng-42', 'TNG-42', true],
      ['?room=tng-zz99', 'TNG-ZZ99', true],
      ['/?foo=1&ROOM=tng-km47#top', 'TNG-KM47', true],
      ['https://hundred.app/?room=tng-km47', 'TNG-KM47', true],
      ['https://hundred.app/?foo=1&room=tng-42&bar=2', 'TNG-42', true],
      ['http://localhost:3000?room=tng-km47', 'TNG-KM47', true],
      ['Invite: https://a.co/?room=tng-km47', 'TNG-KM47', true],
      ['room=tng-km47', 'TNG-KM47', true],
    ];

    for (const [raw, expectedNormalized, expectedValid] of cases) {
      const normalized = normalizeRoomCode(raw);
      expect(normalized).toBe(expectedNormalized);
      expect(isValidRoomCode(normalized)).toBe(expectedValid);
    }
  });

  it('rejects malformed codes without stripping unrelated query params or paths', () => {
    const invalidInputs: string[] = [
      '',
      '   ',
      'BAD',
      'TNG-',
      'TNG-1',
      'TNG-ABCDEFG',
      'TNG-bad/code',
      'TNG-BAD/CODE',
      'TNG-42?x=1',
      'TNG-42&a=1',
      'TNG-42#bad',
      'TNG-A B',
      '?room=tng-42%2Fbad',
      'https://example.com/?x=1',
      '?room=',
    ];

    for (const raw of invalidInputs) {
      const normalized = normalizeRoomCode(raw);
      expect(isValidRoomCode(normalized)).toBe(false);
    }

    // Raw lowercase without normalization is rejected by strict isValidRoomCode
    expect(isValidRoomCode('tng-42')).toBe(false);
    expect(normalizeRoomCode('TNG-42?x=1')).toBe('TNG-42?X=1');
    expect(normalizeRoomCode('TNG-bad/code')).toBe('TNG-BAD/CODE');
    expect(isValidRoomCode('TNG-AB1234')).toBe(true);
  });
});

describe('4. Lobby initialization, bot seat management & start guardrails (F-06)', () => {
  it('initializes lobby with normalized room code and Bangla Unicode username', () => {
    const state = createInitialLobbyState('tng-km47', 'host-1', 'রাফি', 10_000);

    expect(state.roomCode).toBe('TNG-KM47');
    expect(state.phase).toBe('LOBBY');
    expect(state.version).toBe(1);
    expect(state.round).toBe(0);
    expect(state.turnDeadline).toBeNull();
    expect(state.emittedAt).toBe(10_000);
    expect(state.seats[0]).toMatchObject({
      seatIndex: 0,
      type: 'HUMAN',
      clientId: 'host-1',
      username: 'রাফি',
      isOnline: true,
    });
    for (const idx of [1, 2, 3] as const) {
      expect(state.seats[idx]).toMatchObject({
        seatIndex: idx,
        type: 'EMPTY',
        clientId: null,
        username: '',
        isOnline: false,
      });
    }
    expect(isValidGameState(state)).toBe(true);
  });

  it('adds and removes AI bots cleanly and reuses freed bot names', () => {
    let state = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 10_000);

    state = applyAction(state, { type: 'ADD_BOT', seatIndex: 1 }, 10_100);
    state = applyAction(state, { type: 'ADD_BOT', seatIndex: 2 }, 10_200);
    state = applyAction(state, { type: 'ADD_BOT' }, 10_300);

    expect(state.seats[1].type).toBe('AI');
    expect(state.seats[1].username).toBe(BOT_NAMES[0]);
    expect(state.seats[2].username).toBe(BOT_NAMES[1]);
    expect(state.seats[3].username).toBe(BOT_NAMES[2]);
    expect(state.seats[1].clientId).toBe('bot-1');
    expect(state.seats[2].clientId).toBe('bot-2');
    expect(state.seats[3].clientId).toBe('bot-3');
    expect(state.version).toBe(4);

    // Remove bot at seat 1 ('Siam') and re-add -> reuses 'Siam'
    state = applyAction(state, { type: 'REMOVE_BOT', seatIndex: 1 }, 10_400);
    expect(state.seats[1]).toMatchObject({
      seatIndex: 1,
      type: 'EMPTY',
      clientId: null,
      username: '',
      isOnline: false,
    });

    state = applyAction(state, { type: 'ADD_BOT', seatIndex: 1 }, 10_500);
    expect(state.seats[1].type).toBe('AI');
    expect(state.seats[1].username).toBe('Siam');
  });

  it('isolates colliding human nickname "Siam" without duplicate bot names or clientId collisions', () => {
    let state = createInitialLobbyState('TNG-KM47', 'human-siam-1', 'Siam', 10_000);
    state = applyAction(state, { type: 'FILL_BOTS_AND_START' }, 10_100);

    expect(state.phase).toBe('BIDDING');
    expect(state.seats[0].type).toBe('HUMAN');
    expect(state.seats[0].clientId).toBe('human-siam-1');
    expect(state.seats[0].username).toBe('Siam');

    const usernames = state.seats.map((s) => s.username);
    const clientIds = state.seats.map((s) => s.clientId);
    expect(new Set(usernames).size).toBe(4);
    expect(new Set(clientIds).size).toBe(4);
    expect(state.seats[1].username).toBe('Apon');
    expect(state.seats[2].username).toBe('Nabil');
    expect(state.seats[3].username).toBe('Rafi');
  });

  it('rejects invalid ADD_BOT, REMOVE_BOT, START_MATCH, and FILL_BOTS_AND_START calls without mutation', () => {
    const lobby0 = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 10_000);

    // Cannot start with 1, 2, or 3 seated players
    expect(applyAction(lobby0, { type: 'START_MATCH' }, 10_050)).toBe(lobby0);

    const lobby1 = applyAction(lobby0, { type: 'ADD_BOT', seatIndex: 1 }, 10_100);
    expect(applyAction(lobby1, { type: 'START_MATCH' }, 10_150)).toBe(lobby1);

    const lobby2 = applyAction(lobby1, { type: 'ADD_BOT', seatIndex: 2 }, 10_200);
    expect(applyAction(lobby2, { type: 'START_MATCH' }, 10_250)).toBe(lobby2);

    // Invalid ADD_BOT / REMOVE_BOT targets
    expect(applyAction(lobby2, { type: 'ADD_BOT', seatIndex: 0 }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'ADD_BOT', seatIndex: 1 }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'ADD_BOT', seatIndex: unsafeSeat(4) }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'ADD_BOT', seatIndex: unsafeSeat(-1) }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'REMOVE_BOT', seatIndex: 0 }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'REMOVE_BOT', seatIndex: 3 }, 10_300)).toBe(lobby2);
    expect(applyAction(lobby2, { type: 'REMOVE_BOT', seatIndex: unsafeSeat(99) }, 10_300)).toBe(lobby2);

    // 4th player allows START_MATCH
    const lobby3 = applyAction(lobby2, { type: 'ADD_BOT', seatIndex: 3 }, 10_400);
    expect(applyAction(lobby3, { type: 'ADD_BOT' }, 10_450)).toBe(lobby3);

    const started = applyAction(lobby3, { type: 'START_MATCH' }, 10_500);
    expect(started.phase).toBe('BIDDING');
    expect(started.round).toBe(1);
    const holder = started.seats.find((s) => s.hand.includes(1))!.seatIndex;
    expect(started.roundStarterSeat).toBe(holder);
    expect(started.activeSeat).toBe(holder);
    expect(started.turnDeadline).toBe(10_500 + BID_TIMEOUT_MS);

    // Rejected outside LOBBY
    expect(applyAction(started, { type: 'ADD_BOT', seatIndex: 1 }, 10_600)).toBe(started);
    expect(applyAction(started, { type: 'REMOVE_BOT', seatIndex: 1 }, 10_600)).toBe(started);
    expect(applyAction(started, { type: 'FILL_BOTS_AND_START' }, 10_600)).toBe(started);
    expect(applyAction(started, { type: 'START_MATCH' }, 10_600)).toBe(started);
  });
});

describe('5. Bidding phase rules, boundaries & negative guards (F-09)', () => {
  it('exposes exact QUICK_CALL_VALUES and accepts sequential boundary bids 50..500 starting with holder of 1', () => {
    expect([...QUICK_CALL_VALUES]).toEqual([50, 100, 150, 200, 250, 300, 400, 500]);

    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    let state = applyAction(lobby, { type: 'FILL_BOTS_AND_START' }, 2_000);

    const starter = state.roundStarterSeat;
    expect(state.seats[starter].hand).toContain(1);
    expect(state.activeSeat).toBe(starter);

    const bids = [50, 50, 300, 500];
    for (let i = 0; i < 4; i += 1) {
      const seat = ((starter + i) % 4) as SeatIndex;
      state = applyAction(state, { type: 'PLACE_CALL', seatIndex: seat, call: bids[i] }, 2_100 + i * 100);
      expect(state.seats[seat].call).toBe(bids[i]);
      if (i < 3) {
        expect(state.phase).toBe('BIDDING');
        expect(state.activeSeat).toBe(((starter + i + 1) % 4) as SeatIndex);
      }
    }

    expect(state.phase).toBe('PLAYING');
    expect(state.trickNumber).toBe(1);
    expect(state.trickLeaderSeat).toBe(state.roundStarterSeat);
    expect(state.activeSeat).toBe(state.roundStarterSeat);
    expect(state.turnDeadline).toBe(2_400 + PLAY_TIMEOUT_MS);
  });

  it('rejects out-of-range, non-step-10, out-of-turn, and wrong-phase calls without mutation', () => {
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    expect(applyAction(lobby, { type: 'PLACE_CALL', seatIndex: 0, call: 50 }, 1_100)).toBe(
      lobby,
    );

    const bidding = applyAction(lobby, { type: 'FILL_BOTS_AND_START' }, 2_000);
    const firstSeat = bidding.activeSeat;
    const otherSeat = ((firstSeat + 1) % 4) as SeatIndex;

    const badCalls = [0, 45, 510, -10, Number.NaN, Number.POSITIVE_INFINITY, 50.5, 0.1];
    for (const badCall of badCalls) {
      const next = applyAction(
        bidding,
        { type: 'PLACE_CALL', seatIndex: firstSeat, call: badCall },
        2_100,
      );
      expect(next).toBe(bidding);
      expect(next.seats[firstSeat].call).toBeNull();
    }

    // Out of turn and out of range seat
    expect(applyAction(bidding, { type: 'PLACE_CALL', seatIndex: otherSeat, call: 100 }, 2_100)).toBe(
      bidding,
    );
    expect(
      applyAction(bidding, { type: 'PLACE_CALL', seatIndex: unsafeSeat(4), call: 100 }, 2_100),
    ).toBe(bidding);

    // Wrong phase after bidding completes
    let playing = bidding;
    for (let i = 0; i < 4; i += 1) {
      const s = playing.activeSeat;
      playing = applyAction(playing, { type: 'PLACE_CALL', seatIndex: s, call: 100 }, 2_200 + i);
    }
    expect(playing.phase).toBe('PLAYING');
    expect(applyAction(playing, { type: 'PLACE_CALL', seatIndex: playing.activeSeat, call: 100 }, 3_000)).toBe(
      playing,
    );
  });
});

describe('6. Trick play, negative guards, TRICK_COMPLETE & ROUND_SUMMARY pauses (F-10)', () => {
  it('rejects invalid cards, 85, unowned cards, replays, out-of-turn plays, and wrong-phase plays', () => {
    const targetOrder: CardValue[] = [
      1, 15, 25, 30, 60,
      5, 35, 75, 90, 100,
      10, 40, 50, 55, 65,
      20, 45, 70, 80, 95,
    ];
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    let state = applyAction(
      lobby,
      { type: 'FILL_BOTS_AND_START' },
      2_000,
      createDeckTargetRng(targetOrder),
    );

    // Cannot play in BIDDING
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: 1 }, 2_100)).toBe(state);

    for (const idx of SEAT_INDICES) {
      state = applyAction(state, { type: 'PLACE_CALL', seatIndex: idx, call: 100 }, 2_200 + idx);
    }
    expect(state.phase).toBe('PLAYING');

    // Invalid card 85
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: unsafeCard(85) }, 2_300)).toBe(
      state,
    );
    // Card owned by Seat 1 (not Seat 0)
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: 100 }, 2_300)).toBe(state);
    // Out-of-turn valid card belonging to Seat 1
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 1, card: 100 }, 2_300)).toBe(state);

    // Play Trick 1: S0=60, S1=5, S2=10, S3=20 -> enters TRICK_COMPLETE
    state = playSingleTrick(state, { 0: 60, 1: 5, 2: 10, 3: 20 }, 3_000);
    expect(state.phase).toBe('TRICK_COMPLETE');
    expect(state.currentTrick).toHaveLength(4);
    expect(state.lastTrickWinnerSeat).toBe(0);
    expect(state.lastTrickPoints).toBe(95);
    expect(state.seats[0].tricksWon).toBe(1);
    expect(state.seats[0].capturedPoints).toBe(95);

    // Cannot play during TRICK_COMPLETE
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: 15 }, 3_500)).toBe(state);

    // < 2200ms pause keeps TRICK_COMPLETE and all 4 cards visible
    expect(resolveTimeoutOrTransition(state, state.turnDeadline! - 1_000)).toBe(state);

    // At turnDeadline (+2200ms), advances to Trick 2 led by Trick 1 winner (Seat 0)
    state = resolveTimeoutOrTransition(state, state.turnDeadline!);
    expect(state.phase).toBe('PLAYING');
    expect(state.trickNumber).toBe(2);
    expect(state.trickLeaderSeat).toBe(0);
    expect(state.activeSeat).toBe(0);
    expect(state.currentTrick).toEqual([]);

    // Cannot replay card 60 already played in Trick 1
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: 60 }, 6_000)).toBe(state);
  });

  it('enforces ROUND_SUMMARY pause and rotates roundStarterSeat on Round 2', () => {
    const targetOrder: CardValue[] = [
      1, 15, 25, 30, 60,
      5, 35, 75, 90, 100,
      10, 40, 50, 55, 65,
      20, 45, 70, 80, 95,
    ];
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    let state = applyAction(
      lobby,
      { type: 'FILL_BOTS_AND_START' },
      2_000,
      createDeckTargetRng(targetOrder),
    );
    for (const idx of SEAT_INDICES) {
      state = applyAction(state, { type: 'PLACE_CALL', seatIndex: idx, call: 100 }, 2_100 + idx);
    }

    const trickPlans: Array<Record<SeatIndex, CardValue>> = [
      { 0: 60, 1: 5, 2: 10, 3: 20 },
      { 0: 15, 1: 35, 2: 55, 3: 45 },
      { 0: 1, 1: 75, 2: 40, 3: 70 },
      { 0: 25, 1: 90, 2: 50, 3: 80 },
      { 0: 30, 1: 100, 2: 65, 3: 95 },
    ];

    let now = 3_000;
    for (const plan of trickPlans) {
      state = playSingleTrick(state, plan, now);
      expect(state.phase).toBe('TRICK_COMPLETE');
      now = state.turnDeadline!;
      state = resolveTimeoutOrTransition(state, now);
    }

    expect(state.phase).toBe('ROUND_SUMMARY');
    expect(state.turnDeadline).toBe(now + ROUND_SUMMARY_MS);
    expect(applyAction(state, { type: 'PLAY_CARD', seatIndex: 0, card: 1 }, now + 100)).toBe(state);
    expect(resolveTimeoutOrTransition(state, state.turnDeadline! - 1)).toBe(state);

    // Advance via NEXT_ROUND — holder of card 1 starts Round 2
    const round2 = applyAction(state, { type: 'NEXT_ROUND' }, now + 1_000);
    expect(round2.phase).toBe('BIDDING');
    expect(round2.round).toBe(2);
    const holderOfOneR2 = round2.seats.find((s) => s.hand.includes(1))!.seatIndex;
    expect(round2.roundStarterSeat).toBe(holderOfOneR2);
    expect(round2.activeSeat).toBe(holderOfOneR2);
    expect(round2.trickNumber).toBe(0);
    for (const seat of round2.seats) {
      expect(seat.hand).toHaveLength(5);
      expect(seat.call).toBeNull();
      expect(seat.capturedPoints).toBe(0);
      expect(seat.tricksWon).toBe(0);
    }

    // NEXT_ROUND is rejected outside ROUND_SUMMARY
    expect(applyAction(round2, { type: 'NEXT_ROUND' }, now + 1_100)).toBe(round2);
  });
});

describe('7. Deterministic scoring boundary verification (F-11)', () => {
  it('Fixture A: verifies 95 < 100 -> 0, call 0 with 721 captured -> 0, 150 >= 100 -> 100, and call 500 -> 0', () => {
    const fixtureAOrder: CardValue[] = [
      1, 15, 25, 30, 60,
      5, 35, 75, 90, 100,
      10, 40, 50, 55, 65,
      20, 45, 70, 80, 95,
    ];
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    let state = applyAction(
      lobby,
      { type: 'FILL_BOTS_AND_START' },
      2_000,
      createDeckTargetRng(fixtureAOrder),
    );

    const bids: [number, number, number, number] = [100, 50, 100, 500];
    for (const idx of SEAT_INDICES) {
      state = applyAction(state, { type: 'PLACE_CALL', seatIndex: idx, call: bids[idx] }, 2_100 + idx);
    }

    const tricks: Array<Record<SeatIndex, CardValue>> = [
      { 0: 60, 1: 5, 2: 10, 3: 20 },
      { 0: 15, 1: 35, 2: 55, 3: 45 },
      { 0: 1, 1: 75, 2: 40, 3: 70 },
      { 0: 25, 1: 90, 2: 50, 3: 80 },
      { 0: 30, 1: 100, 2: 65, 3: 95 },
    ];

    let now = 3_000;
    for (const trick of tricks) {
      state = playSingleTrick(state, trick, now);
      now = state.turnDeadline!;
      state = resolveTimeoutOrTransition(state, now);
    }

    expect(state.phase).toBe('ROUND_SUMMARY');
    expect(state.roundHistory).toHaveLength(1);

    const entries = state.roundHistory[0].entries;
    expect(entries.reduce((acc, e) => acc + e.capturedPoints, 0)).toBe(966);

    expect(entries[0]).toMatchObject({
      seatIndex: 0,
      call: 100,
      capturedPoints: 95,
      pointsAwarded: 0,
      totalAfter: 0,
    });
    expect(entries[1]).toMatchObject({
      seatIndex: 1,
      call: 50,
      capturedPoints: 721,
      pointsAwarded: 50,
      totalAfter: 50,
    });
    expect(entries[2]).toMatchObject({
      seatIndex: 2,
      call: 100,
      capturedPoints: 150,
      pointsAwarded: 100,
      totalAfter: 100,
    });
    expect(entries[3]).toMatchObject({
      seatIndex: 3,
      call: 500,
      capturedPoints: 0,
      pointsAwarded: 0,
      totalAfter: 0,
    });
  });

  it('Fixture B on Round 2: verifies exact boundary 100 === 100 -> 100, off-by-10 under-capture, and cumulative totalAfter', () => {
    const fixtureAOrder: CardValue[] = [
      1, 15, 25, 30, 60,
      5, 35, 75, 90, 100,
      10, 40, 50, 55, 65,
      20, 45, 70, 80, 95,
    ];
    const fixtureBOrder: CardValue[] = [
      1, 5, 30, 55, 70,
      15, 40, 50, 75, 80,
      10, 25, 45, 65, 90,
      20, 35, 60, 95, 100,
    ];

    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    let state = applyAction(
      lobby,
      { type: 'FILL_BOTS_AND_START' },
      2_000,
      createDeckTargetRng(fixtureAOrder),
    );
    const bidsA: [number, number, number, number] = [100, 50, 100, 500];
    for (const idx of SEAT_INDICES) {
      state = applyAction(state, { type: 'PLACE_CALL', seatIndex: idx, call: bidsA[idx] }, 2_100 + idx);
    }

    let now = 3_000;
    for (const trick of [
      { 0: 60, 1: 5, 2: 10, 3: 20 },
      { 0: 15, 1: 35, 2: 55, 3: 45 },
      { 0: 1, 1: 75, 2: 40, 3: 70 },
      { 0: 25, 1: 90, 2: 50, 3: 80 },
      { 0: 30, 1: 100, 2: 65, 3: 95 },
    ] as Array<Record<SeatIndex, CardValue>>) {
      state = playSingleTrick(state, trick, now);
      now = state.turnDeadline!;
      state = resolveTimeoutOrTransition(state, now);
    }

    // Round 2 starts with Seat 1
    state = applyAction(
      state,
      { type: 'NEXT_ROUND' },
      now + 100,
      createDeckTargetRng(fixtureBOrder),
    );
    expect(state.round).toBe(2);
    expect(state.roundStarterSeat).toBe(0);
    expect(state.activeSeat).toBe(0);

    const bidsB: [number, number, number, number] = [100, 180, 50, 300];
    for (let turn = 0; turn < 4; turn += 1) {
      const seat = state.activeSeat;
      state = applyAction(
        state,
        { type: 'PLACE_CALL', seatIndex: seat, call: bidsB[seat] },
        now + 200 + turn,
      );
    }
    expect(state.phase).toBe('PLAYING');
    expect(state.activeSeat).toBe(0);

    // Round 2 Trick 1 is led by Seat 0 (holder of card 1)
    const tricksB: Array<Record<SeatIndex, CardValue>> = [
      { 0: 55, 1: 15, 2: 10, 3: 20 }, // S0 wins 100
      { 0: 30, 1: 80, 2: 25, 3: 35 }, // S1 wins 170
      { 0: 5, 1: 40, 2: 45, 3: 60 },  // S3 wins 150
      { 0: 1, 1: 50, 2: 65, 3: 95 },  // S3 wins 211
      { 0: 70, 1: 75, 2: 90, 3: 100 }, // S3 wins 335
    ];

    now += 1_000;
    for (const trick of tricksB) {
      state = playSingleTrick(state, trick, now);
      now = state.turnDeadline!;
      state = resolveTimeoutOrTransition(state, now);
    }

    expect(state.phase).toBe('ROUND_SUMMARY');
    expect(state.roundHistory).toHaveLength(2);
    const round2Entries = state.roundHistory[1].entries;
    expect(round2Entries.reduce((acc, e) => acc + e.capturedPoints, 0)).toBe(966);

    expect(round2Entries[0]).toMatchObject({
      seatIndex: 0,
      call: 100,
      capturedPoints: 100,
      pointsAwarded: 100,
      totalAfter: 100,
    });
    expect(round2Entries[1]).toMatchObject({
      seatIndex: 1,
      call: 180,
      capturedPoints: 170,
      pointsAwarded: 0,
      totalAfter: 50,
    });
    expect(round2Entries[2]).toMatchObject({
      seatIndex: 2,
      call: 50,
      capturedPoints: 0,
      pointsAwarded: 0,
      totalAfter: 100, // carried over from Round 1!
    });
    expect(round2Entries[3]).toMatchObject({
      seatIndex: 3,
      call: 300,
      capturedPoints: 696,
      pointsAwarded: 300,
      totalAfter: 300,
    });
  });
});

describe('8. Full 10-round match simulation (200 plays), MATCH_OVER, getMatchRankings, PLAY_AGAIN (F-08..F-11)', () => {
  it('simulates all 10 rounds organically to MATCH_OVER, verifies rankings, and resets cleanly on PLAY_AGAIN', () => {
    const rng = createMulberry32(987654321);
    let now = 1_000_000;
    let state = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', now);
    state = applyAction(state, { type: 'FILL_BOTS_AND_START' }, (now += 100), rng);

    const expectedTotals: [number, number, number, number] = [0, 0, 0, 0];

    for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
      expect(state.phase).toBe('BIDDING');
      expect(state.round).toBe(round);
      const holderOfOne = state.seats.find((s) => s.hand.includes(1))!.seatIndex;
      expect(state.roundStarterSeat).toBe(holderOfOne);
      expect(state.activeSeat).toBe(holderOfOne);

      const roundDeck = state.seats.flatMap((s) => s.hand);
      expect(roundDeck).toHaveLength(20);
      expect(new Set(roundDeck).size).toBe(20);
      expect(roundDeck.reduce((acc, c) => acc + c, 0)).toBe(966);

      // 4 sequential bids
      for (let b = 0; b < 4; b += 1) {
        const bidder = state.activeSeat;
        const existingCalls = state.seats.map((s) => s.call);
        const call = computeBotCall(state.seats[bidder].hand, existingCalls);
        state = applyAction(
          state,
          { type: 'PLACE_CALL', seatIndex: bidder, call },
          (now += 100),
          rng,
        );
      }

      expect(state.phase).toBe('PLAYING');
      expect(state.trickNumber).toBe(1);
      expect(state.activeSeat).toBe(state.roundStarterSeat);

      // 5 tricks × 4 card plays = 20 plays per round
      for (let trick = 1; trick <= TRICKS_PER_ROUND; trick += 1) {
        expect(state.trickNumber).toBe(trick);
        for (let play = 0; play < 4; play += 1) {
          const actor = state.activeSeat;
          const card = computeBotCard(state, actor);
          state = applyAction(
            state,
            { type: 'PLAY_CARD', seatIndex: actor, card },
            (now += 100),
            rng,
          );
        }

        expect(state.phase).toBe('TRICK_COMPLETE');
        expect(state.currentTrick).toHaveLength(4);
        now = state.turnDeadline!;
        state = resolveTimeoutOrTransition(state, now, rng);
      }

      expect(state.seats.reduce((acc, s) => acc + s.capturedPoints, 0)).toBe(966);
      expect(state.seats.reduce((acc, s) => acc + s.tricksWon, 0)).toBe(5);
      for (const seat of state.seats) {
        expect(seat.hand).toHaveLength(0);
      }
      expect(state.roundHistory).toHaveLength(round);

      const latestRecord = state.roundHistory[round - 1];
      for (const idx of SEAT_INDICES) {
        expectedTotals[idx] += latestRecord.entries[idx].pointsAwarded;
        expect(state.seats[idx].totalScore).toBe(expectedTotals[idx]);
      }

      if (round < TOTAL_ROUNDS) {
        expect(state.phase).toBe('ROUND_SUMMARY');
        if (round % 2 === 1) {
          state = applyAction(state, { type: 'NEXT_ROUND' }, (now += 100), rng);
        } else {
          now = state.turnDeadline!;
          state = resolveTimeoutOrTransition(state, now, rng);
        }
      } else {
        expect(state.phase).toBe('MATCH_OVER');
        expect(state.turnDeadline).toBeNull();
      }
    }

    // Cannot advance to Round 11
    expect(applyAction(state, { type: 'NEXT_ROUND' }, now + 5_000, rng)).toBe(state);
    expect(resolveTimeoutOrTransition(state, now + 10_000, rng)).toBe(state);
    expect(state.round).toBe(10);
    expect(state.roundHistory).toHaveLength(10);

    // Rankings validation
    const rankings = getMatchRankings(state);
    expect(rankings).toHaveLength(4);
    expect(new Set(rankings.map((r) => r.seatIndex)).size).toBe(4);
    for (let i = 0; i < rankings.length - 1; i += 1) {
      expect(rankings[i].totalScore).toBeGreaterThanOrEqual(rankings[i + 1].totalScore);
      expect(rankings[i].rank).toBeGreaterThanOrEqual(1);
      expect(rankings[i].rank).toBeLessThanOrEqual(4);
    }
    expect(rankings[0].rank).toBe(1);

    // PLAY_AGAIN rejected before MATCH_OVER
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 100);
    expect(applyAction(lobby, { type: 'PLAY_AGAIN' }, 200)).toBe(lobby);

    // PLAY_AGAIN on MATCH_OVER resets directly to Round 1 BIDDING
    const restarted = applyAction(state, { type: 'PLAY_AGAIN' }, now + 1_000, rng);
    expect(restarted.phase).toBe('BIDDING');
    expect(restarted.round).toBe(1);
    const restartedStarter = restarted.seats.find((s) => s.hand.includes(1))!.seatIndex;
    expect(restarted.roundStarterSeat).toBe(restartedStarter);
    expect(restarted.activeSeat).toBe(restartedStarter);
    expect(restarted.trickNumber).toBe(0);
    expect(restarted.roundHistory).toEqual([]);
    expect(restarted.currentTrick).toEqual([]);
    expect(restarted.version).toBe(state.version + 1);
    expect(restarted.matchId).not.toBe(state.matchId);
    expect(restarted.roomCode).toBe(state.roomCode);

    const restartedCards: CardValue[] = [];
    for (const idx of SEAT_INDICES) {
      expect(restarted.seats[idx].username).toBe(state.seats[idx].username);
      expect(restarted.seats[idx].clientId).toBe(state.seats[idx].clientId);
      expect(restarted.seats[idx].type).toBe(state.seats[idx].type);
      expect(restarted.seats[idx].totalScore).toBe(0);
      expect(restarted.seats[idx].capturedPoints).toBe(0);
      expect(restarted.seats[idx].tricksWon).toBe(0);
      expect(restarted.seats[idx].call).toBeNull();
      expect(restarted.seats[idx].hand).toHaveLength(5);
      restartedCards.push(...restarted.seats[idx].hand);
    }
    expect(restartedCards.reduce((acc, c) => acc + c, 0)).toBe(966);
  });

  it('produces deterministic tie-broken getMatchRankings without mutating input state', () => {
    const base = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    const started = applyAction(base, { type: 'FILL_BOTS_AND_START' }, 2_000);
    const tiedState: GameState = deepFreeze({
      ...started,
      phase: 'MATCH_OVER',
      round: 10,
      turnDeadline: null,
      seats: [
        { ...started.seats[0], totalScore: 200, capturedPoints: 0 },
        { ...started.seats[1], totalScore: 200, capturedPoints: 0 },
        { ...started.seats[2], totalScore: 300, capturedPoints: 0 },
        { ...started.seats[3], totalScore: 200, capturedPoints: 0 },
      ],
      roundHistory: [
        {
          round: 1,
          entries: [
            { seatIndex: 0, username: 'Rafiq', call: 200, capturedPoints: 210, pointsAwarded: 200, totalAfter: 200 },
            { seatIndex: 1, username: 'Siam', call: 200, capturedPoints: 260, pointsAwarded: 200, totalAfter: 200 },
            { seatIndex: 2, username: 'Apon', call: 300, capturedPoints: 320, pointsAwarded: 300, totalAfter: 300 },
            { seatIndex: 3, username: 'Nabil', call: 200, capturedPoints: 210, pointsAwarded: 200, totalAfter: 200 },
          ],
        },
      ],
    });

    const first = getMatchRankings(tiedState);
    const second = getMatchRankings(tiedState);

    expect(first).toEqual(second);
    // Seat 2 (300) first; among 200 ties, Seat 1 has higher capturedPoints (260 vs 210), then Seat 0 < Seat 3
    expect(first.map((r) => r.seatIndex)).toEqual([2, 1, 0, 3]);
    expect(first.map((r) => r.rank)).toEqual([1, 2, 2, 2]);

    const firstPlaceTieState: GameState = deepFreeze({
      ...tiedState,
      seats: [
        { ...tiedState.seats[0], totalScore: 300 },
        { ...tiedState.seats[1], totalScore: 100 },
        { ...tiedState.seats[2], totalScore: 300 },
        { ...tiedState.seats[3], totalScore: 0 },
      ],
    });
    const firstPlaceRankings = getMatchRankings(firstPlaceTieState);
    expect(firstPlaceRankings.map((r) => r.seatIndex)).toEqual([2, 0, 1, 3]);
    expect(firstPlaceRankings.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
  });
});

describe('9. Timeout constants & shot-clock auto-resolution (F-09, F-10, F-15)', () => {
  it('exports exact shot-clock and pause constants', () => {
    expect(BID_TIMEOUT_MS).toBe(25_000);
    expect(PLAY_TIMEOUT_MS).toBe(20_000);
    expect(HOST_STALL_GRACE_MS).toBe(2_500);
    expect(TRICK_COMPLETE_MS).toBe(2_200);
    expect(ROUND_SUMMARY_MS).toBe(4_500);
    expect(TOTAL_ROUNDS).toBe(10);
    expect(AUTO_TIMEOUT_CALL).toBe(50);
  });

  it('auto-calls 50 on 25s bidding timeout and auto-plays lowest card on 20s play timeout', () => {
    const targetOrder: CardValue[] = [
      15, 40, 65, 80, 100,
      5, 35, 70, 90, 95,
      1, 25, 50, 60, 75,
      10, 20, 30, 45, 55,
    ];
    const lobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 10_000);
    // No-op in LOBBY (turnDeadline === null)
    expect(resolveTimeoutOrTransition(lobby, 99_999)).toBe(lobby);

    let state = applyAction(
      lobby,
      { type: 'FILL_BOTS_AND_START' },
      20_000,
      createDeckTargetRng(targetOrder),
    );
    expect(state.turnDeadline).toBe(20_000 + BID_TIMEOUT_MS);

    // Pre-deadline is no-op
    expect(resolveTimeoutOrTransition(state, state.turnDeadline! - 1)).toBe(state);
    expect(resolveTimeoutOrTransition(state, state.turnDeadline! - 10_000)).toBe(state);

    // Seat 2 holds card 1 in targetOrder ([1, 25, 50, 60, 75]), so Seat 2 starts!
    expect(state.activeSeat).toBe(2);

    // At turnDeadline -> auto-calls 50 for Seat 2
    state = resolveTimeoutOrTransition(state, state.turnDeadline!);
    expect(state.seats[2].call).toBe(50);
    expect(state.activeSeat).toBe(3);
    expect(state.turnDeadline).toBe(45_000 + BID_TIMEOUT_MS);

    // Finish remaining bids
    for (const idx of [3, 0, 1] as const) {
      state = resolveTimeoutOrTransition(state, state.turnDeadline! + 10);
      expect(state.seats[idx].call).toBe(50);
    }

    expect(state.phase).toBe('PLAYING');
    expect(state.activeSeat).toBe(2);
    expect(state.turnDeadline).toBe(state.emittedAt + PLAY_TIMEOUT_MS);

    // Pre-deadline in PLAYING is no-op
    expect(resolveTimeoutOrTransition(state, state.turnDeadline! - 1)).toBe(state);

    // At play deadline -> Seat 2 auto-plays lowest card (1 from [1, 25, 50, 60, 75])
    const expectedMinSeat2 = Math.min(...state.seats[2].hand);
    expect(expectedMinSeat2).toBe(1);
    state = resolveTimeoutOrTransition(state, state.turnDeadline!);
    expect(state.currentTrick).toEqual([{ seatIndex: 2, card: 1 }]);
    expect(state.seats[2].hand).toEqual([25, 50, 60, 75]);
    expect(state.activeSeat).toBe(3);

    // Seat 3 auto-plays lowest card (10 from [10, 20, 30, 45, 55])
    state = resolveTimeoutOrTransition(state, state.turnDeadline!);
    expect(state.currentTrick).toEqual([
      { seatIndex: 2, card: 1 },
      { seatIndex: 3, card: 10 },
    ]);
  });
});

describe('10. Bot AI, M3 helpers, deep immutability & Node-safe pure imports', () => {
  it('computes valid monotonic Bot calls and rational legal Bot card plays', () => {
    const emptyHand: CardValue[] = [];
    const lowHand: CardValue[] = [1, 5, 10, 15, 20];
    const mixedHand: CardValue[] = [5, 25, 50, 75, 95];
    const highHand: CardValue[] = [75, 80, 90, 95, 100];

    expect(computeBotCall(emptyHand)).toBe(0);
    expect(computeBotCall(lowHand)).toBe(50);

    const mixedCall1Arg = computeBotCall(mixedHand);
    const mixedCall2Arg = computeBotCall(mixedHand, [150, 200]);
    const highCall = computeBotCall(highHand);

    for (const call of [mixedCall1Arg, mixedCall2Arg, highCall]) {
      expect(Number.isInteger(call)).toBe(true);
      expect(call % 10).toBe(0);
      expect(call).toBeGreaterThanOrEqual(0);
      expect(call).toBeLessThanOrEqual(500);
    }
    expect(highCall).toBeGreaterThanOrEqual(350);
    expect(highCall).toBeGreaterThan(computeBotCall(lowHand));

    // Rational computeBotCard scenarios
    const baseLobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    const started = applyAction(baseLobby, { type: 'FILL_BOTS_AND_START' }, 2_000);

    // 1. Bid already fulfilled -> dumps lowest card (10)
    const fulfilledState: GameState = {
      ...started,
      phase: 'PLAYING',
      trickNumber: 4,
      activeSeat: 1,
      seats: [
        started.seats[0],
        { ...started.seats[1], hand: [10, 95], call: 100, capturedPoints: 120 },
        started.seats[2],
        started.seats[3],
      ],
      currentTrick: [{ seatIndex: 0, card: 20 }],
    };
    expect(computeBotCard(fulfilledState, 1)).toBe(10);

    // 2. 4th to play, bid unfulfilled, can win -> wins with 100
    const fourthWinState: GameState = {
      ...started,
      phase: 'PLAYING',
      trickNumber: 4,
      activeSeat: 3,
      seats: [
        started.seats[0],
        started.seats[1],
        started.seats[2],
        { ...started.seats[3], hand: [5, 100], call: 150, capturedPoints: 0 },
      ],
      currentTrick: [
        { seatIndex: 0, card: 10 },
        { seatIndex: 1, card: 20 },
        { seatIndex: 2, card: 30 },
      ],
    };
    expect(computeBotCard(fourthWinState, 3)).toBe(100);

    // 3. 4th to play, unwinnable trick -> dumps lowest card (5)
    const fourthLoseState: GameState = {
      ...fourthWinState,
      seats: [
        fourthWinState.seats[0],
        fourthWinState.seats[1],
        fourthWinState.seats[2],
        { ...fourthWinState.seats[3], hand: [5, 10], call: 150, capturedPoints: 0 },
      ],
      currentTrick: [
        { seatIndex: 0, card: 10 },
        { seatIndex: 1, card: 20 },
        { seatIndex: 2, card: 95 },
      ],
    };
    expect(computeBotCard(fourthLoseState, 3)).toBe(5);
  });

  it('maintains strict immutability under recursive Object.freeze on valid and invalid paths', () => {
    const lobby = deepFreeze(createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000));
    // Rejected action returns exact reference
    expect(applyAction(lobby, { type: 'START_MATCH' }, 1_100)).toBe(lobby);

    const withBot = deepFreeze(applyAction(lobby, { type: 'ADD_BOT', seatIndex: 1 }, 1_200));
    const removedBot = deepFreeze(applyAction(withBot, { type: 'REMOVE_BOT', seatIndex: 1 }, 1_300));
    expect(removedBot.seats[1].type).toBe('EMPTY');

    const bidding = deepFreeze(applyAction(removedBot, { type: 'FILL_BOTS_AND_START' }, 1_400));
    expect(computeBotCall(bidding.seats[0].hand, [100])).toBeGreaterThanOrEqual(0);
    expect(applyAction(bidding, { type: 'PLACE_CALL', seatIndex: 0, call: 45 }, 1_500)).toBe(
      bidding,
    );

    let playing = bidding;
    for (let i = 0; i < 4; i += 1) {
      const bidder = playing.activeSeat;
      playing = deepFreeze(
        applyAction(playing, { type: 'PLACE_CALL', seatIndex: bidder, call: 100 }, 1_600 + i),
      );
    }

    const leadSeat = playing.activeSeat;
    const botCard = computeBotCard(playing, leadSeat);
    expect(playing.seats[leadSeat].hand).toContain(botCard);
    const played = deepFreeze(
      applyAction(playing, { type: 'PLAY_CARD', seatIndex: leadSeat, card: botCard }, 1_700),
    );
    expect(played.currentTrick).toEqual([{ seatIndex: leadSeat, card: botCard }]);

    const timedOut = deepFreeze(
      resolveTimeoutOrTransition(played, played.turnDeadline! + 50),
    );
    expect(timedOut.currentTrick).toHaveLength(2);
    expect(getMatchRankings(timedOut)).toHaveLength(4);
  });

  it('supports M3 presence/seating helpers and isValidGameState corruption checks', () => {
    let state = deepFreeze(createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000));
    state = deepFreeze(assignHumanSeat(state, 'guest-2', 'Mehedi', 1_100));
    expect(state.seats[1]).toMatchObject({
      type: 'HUMAN',
      clientId: 'guest-2',
      username: 'Mehedi',
      isOnline: true,
    });

    // Reconnect with no change -> no version bump
    expect(assignHumanSeat(state, 'guest-2', 'Mehedi', 1_200)).toBe(state);

    // Presence sync offline -> online -> redundant call no-op
    const offlineState = deepFreeze(syncPresenceOnlineStatus(state, ['host-1'], 1_300));
    expect(offlineState.seats[1].isOnline).toBe(false);
    expect(offlineState.version).toBe(state.version + 1);
    expect(syncPresenceOnlineStatus(offlineState, ['host-1'], 1_400)).toBe(offlineState);

    const backOnline = deepFreeze(setSeatOnlineStatus(offlineState, 'guest-2', true, 1_500));
    expect(backOnline.seats[1].isOnline).toBe(true);
    expect(setSeatOnlineStatus(backOnline, 'guest-2', true, 1_600)).toBe(backOnline);

    // Pure utility helpers
    expect(getNextSeat(3)).toBe(0);
    expect(getRoundStarterSeat(5)).toBe(0);
    expect(getTrickPoints([{ seatIndex: 0, card: 25 }, { seatIndex: 1, card: 95 }])).toBe(120);
    expect(getTrickWinner([])).toBeNull();
    expect(isValidSeatIndex(3)).toBe(true);
    expect(isValidSeatIndex(4)).toBe(false);
    expect(isValidCardValue(85)).toBe(false);
    expect(isValidCardValue(80)).toBe(true);
    expect(isValidCallValue(120)).toBe(true);
    expect(isValidCallValue(125)).toBe(false);

    // Corrupt GameState detection
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState({ roomCode: 'BAD' })).toBe(false);
    expect(isValidGameState({ ...state, roomCode: 'INVALID' })).toBe(false);
    expect(isValidGameState({ ...state, round: 11 })).toBe(false);
    expect(
      isValidGameState({
        ...state,
        phase: 'BIDDING',
        round: 1,
        seats: [
          { ...state.seats[0], hand: [unsafeCard(85)] },
          state.seats[1],
          state.seats[2],
          state.seats[3],
        ],
      }),
    ).toBe(false);
  });

  it('hardens malformed actions/phases, roomCode fallback, computeBotCard, -0 seatIndex, cross-field GameState, and reverse-order Siam collisions', () => {
    // 1. createInitialLobbyState falls back to valid TNG-[A-Z]{2}\d{2} on invalid non-empty roomCode inputs
    for (const badCode of ['BAD-CODE!', 'TNG-42?x=1', 'TNG-ABCDEFG', '']) {
      const created = createInitialLobbyState(badCode, 'host-1', 'Rafiq', 1_000);
      expect(created.roomCode).toMatch(CANONICAL_ROOM_CODE_PATTERN);
      expect(isValidRoomCode(created.roomCode)).toBe(true);
      expect(isValidGameState(created)).toBe(true);
    }

    // 2. applyAction handles null/undefined/non-object/unknown action.type safely
    const lobby = deepFreeze(createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000));
    const bidding = deepFreeze(applyAction(lobby, { type: 'FILL_BOTS_AND_START' }, 2_000));
    expect(isValidGameState(bidding)).toBe(true);

    for (const malformedAction of [
      { type: 'BOGUS_ACTION' },
      {},
      { type: 123 },
      'START_MATCH',
      null,
      undefined,
    ]) {
      expect(applyAction(bidding, unsafeAction(malformedAction), 2_100)).toBe(bidding);
    }

    // 3. resolveTimeoutOrTransition handles unknown phase & corrupted state safely
    const bogusPhaseState = deepFreeze({
      ...bidding,
      phase: 'BOGUS_PHASE' as unknown as GamePhase,
      turnDeadline: 1,
    });
    expect(resolveTimeoutOrTransition(bogusPhaseState, 25_000)).toBe(bogusPhaseState);
    expect(
      resolveTimeoutOrTransition(null as unknown as GameState, 25_000),
    ).toBeNull();

    // 4. computeBotCard rejects string '0' and handles missing/corrupted currentTrick
    let playing = bidding;
    for (let i = 0; i < 4; i += 1) {
      playing = deepFreeze(
        applyAction(playing, { type: 'PLACE_CALL', seatIndex: playing.activeSeat, call: 100 }, 2_200 + i),
      );
    }
    expect(isValidGameState(playing)).toBe(true);
    expect(computeBotCard(playing, '0' as unknown as SeatIndex)).toBe(DECK_CARDS[0]);
    const missingTrickState = {
      ...playing,
      currentTrick: undefined as unknown as TrickPlay[],
    };
    const safeCard = computeBotCard(missingTrickState, 0);
    expect(playing.seats[0].hand).toContain(safeCard);

    // 5. -0 seatIndex normalization across ADD_BOT, REMOVE_BOT, PLACE_CALL, PLAY_CARD
    const emptySeat0Lobby = deepFreeze({
      ...lobby,
      seats: [
        { ...lobby.seats[0], type: 'EMPTY' as const, clientId: null, username: '', isOnline: false },
        { ...lobby.seats[1], type: 'HUMAN' as const, clientId: 'h1', username: 'Host', isOnline: true },
        lobby.seats[2],
        lobby.seats[3],
      ] as GameState['seats'],
    });
    const addedNegZeroBot = applyAction(
      emptySeat0Lobby,
      { type: 'ADD_BOT', seatIndex: -0 as SeatIndex },
      1_100,
    );
    expect(Object.is(addedNegZeroBot.seats[0].seatIndex, 0)).toBe(true);
    const removedNegZeroBot = applyAction(
      addedNegZeroBot,
      { type: 'REMOVE_BOT', seatIndex: -0 as SeatIndex },
      1_200,
    );
    expect(Object.is(removedNegZeroBot.seats[0].seatIndex, 0)).toBe(true);

    let bidAt0 = bidding;
    while (bidAt0.activeSeat !== 0) {
      bidAt0 = applyAction(
        bidAt0,
        { type: 'PLACE_CALL', seatIndex: bidAt0.activeSeat, call: 50 },
        2_050,
      );
    }
    const calledNegZero = applyAction(
      bidAt0,
      { type: 'PLACE_CALL', seatIndex: -0 as SeatIndex, call: 50 },
      2_100,
    );
    expect(calledNegZero.seats[0].call).toBe(50);
    expect(calledNegZero.activeSeat).toBe(1);

    let playAt0 = playing;
    while (playAt0.activeSeat !== 0) {
      const s = playAt0.activeSeat;
      playAt0 = applyAction(
        playAt0,
        { type: 'PLAY_CARD', seatIndex: s, card: playAt0.seats[s].hand[0] },
        2_450,
      );
    }
    const card0 = playAt0.seats[0].hand[0];
    const playedNegZero = applyAction(
      playAt0,
      { type: 'PLAY_CARD', seatIndex: -0 as SeatIndex, card: card0 },
      2_500,
    );
    const seat0Play = playedNegZero.currentTrick.find((p) => p.seatIndex === 0)!;
    expect(Object.is(seat0Play.seatIndex, 0)).toBe(true);

    // 6. All 6 cross-field semantic checks in isValidGameState
    // 6a. MATCH_OVER with round !== 10 or non-null turnDeadline
    expect(
      isValidGameState({ ...playing, phase: 'MATCH_OVER', round: 1, turnDeadline: null }),
    ).toBe(false);
    expect(
      isValidGameState({ ...playing, phase: 'MATCH_OVER', round: 10, turnDeadline: 5_000 }),
    ).toBe(false);

    // 6b. Non-LOBBY phase with EMPTY seat
    expect(
      isValidGameState({
        ...bidding,
        seats: [
          bidding.seats[0],
          bidding.seats[1],
          bidding.seats[2],
          { ...bidding.seats[3], type: 'EMPTY', clientId: null, username: '', hand: [] },
        ],
      }),
    ).toBe(false);

    // 6c. BIDDING with trickNumber !== 0 or non-empty currentTrick
    expect(isValidGameState({ ...bidding, trickNumber: 1 })).toBe(false);
    expect(
      isValidGameState({
        ...bidding,
        currentTrick: [{ seatIndex: 0, card: bidding.seats[0].hand[0] }],
      }),
    ).toBe(false);

    // 6d. PLAYING with trickNumber === 0 or currentTrick.length === 4; TRICK_COMPLETE with < 4 cards
    expect(isValidGameState({ ...playing, trickNumber: 0 })).toBe(false);
    expect(
      isValidGameState({
        ...playing,
        phase: 'TRICK_COMPLETE',
        currentTrick: [{ seatIndex: 0, card: playing.seats[0].hand[0] }],
      }),
    ).toBe(false);

    // 6e. LOBBY with trickNumber !== 0 or non-null turnDeadline
    expect(isValidGameState({ ...lobby, trickNumber: 4 })).toBe(false);
    expect(isValidGameState({ ...lobby, turnDeadline: 10_000 })).toBe(false);

    // 6f. Non-integer capturedPoints / totalScore / lastTrickPoints
    expect(
      isValidGameState({
        ...playing,
        seats: [
          { ...playing.seats[0], capturedPoints: 50.5 },
          playing.seats[1],
          playing.seats[2],
          playing.seats[3],
        ],
      }),
    ).toBe(false);
    expect(isValidGameState({ ...playing, lastTrickPoints: 12.5 })).toBe(false);

    // 6g. roundHistory entries with duplicate seatIndex [0, 0, 0, 0]
    expect(
      isValidGameState({
        ...playing,
        roundHistory: [
          {
            round: 1,
            entries: [
              { seatIndex: 0, username: 'A', call: 100, capturedPoints: 100, pointsAwarded: 100, totalAfter: 100 },
              { seatIndex: 0, username: 'A', call: 100, capturedPoints: 100, pointsAwarded: 100, totalAfter: 100 },
              { seatIndex: 0, username: 'A', call: 100, capturedPoints: 100, pointsAwarded: 100, totalAfter: 100 },
              { seatIndex: 0, username: 'A', call: 100, capturedPoints: 100, pointsAwarded: 100, totalAfter: 100 },
            ],
          },
        ],
      }),
    ).toBe(false);

    // 7. Reverse-order Bot-first 'Siam' + Human 'Siam' collision resolution in assignHumanSeat
    let botFirstLobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    botFirstLobby = applyAction(botFirstLobby, { type: 'ADD_BOT', seatIndex: 1 }, 1_100);
    botFirstLobby = applyAction(botFirstLobby, { type: 'ADD_BOT', seatIndex: 2 }, 1_200);
    expect(botFirstLobby.seats[1].username).toBe('Siam');
    expect(botFirstLobby.seats[2].username).toBe('Apon');

    const withHumanSiam = assignHumanSeat(botFirstLobby, 'guest-siam', '  Siam ', 1_300);
    expect(withHumanSiam.seats[3]).toMatchObject({
      type: 'HUMAN',
      clientId: 'guest-siam',
      username: 'Siam',
      isOnline: true,
    });
    expect(withHumanSiam.seats[1].type).toBe('AI');
    expect(withHumanSiam.seats[1].username).toBe('Nabil');
    expect(
      new Set(withHumanSiam.seats.filter((s) => s.type !== 'EMPTY').map((s) => s.username)).size,
    ).toBe(4);

    // Host updates username to 'Siam' while 3 bots occupy seats 1..3 -> colliding AI rotates to 'Rafi'
    let fullBotLobby = createInitialLobbyState('TNG-KM47', 'host-1', 'Rafiq', 1_000);
    fullBotLobby = applyAction(fullBotLobby, { type: 'ADD_BOT', seatIndex: 1 }, 1_100);
    fullBotLobby = applyAction(fullBotLobby, { type: 'ADD_BOT', seatIndex: 2 }, 1_200);
    fullBotLobby = applyAction(fullBotLobby, { type: 'ADD_BOT', seatIndex: 3 }, 1_300);
    const hostRenamedSiam = assignHumanSeat(fullBotLobby, 'host-1', 'Siam', 1_400);
    expect(hostRenamedSiam.seats[0].username).toBe('Siam');
    expect(hostRenamedSiam.seats[1].username).toBe('Rafi');
    expect(new Set(hostRenamedSiam.seats.map((s) => s.username)).size).toBe(4);

    // No-op reconnect in LOBBY and non-LOBBY preserves exact reference
    expect(assignHumanSeat(hostRenamedSiam, 'host-1', 'Siam', 1_500)).toBe(hostRenamedSiam);
    expect(assignHumanSeat(playing, 'host-1', 'DifferentName', 2_600)).toBe(playing);
  });

  it('keeps lib/types.ts and lib/gameEngine.ts pure, Node-safe, and free of deprecated branding', () => {
    const filesToCheck = ['lib/types.ts', 'lib/gameEngine.ts'];

    for (const relPath of filesToCheck) {
      const raw = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
      expect(raw).not.toContain('একশো');
      expect(raw).not.toContain('Tangail Hundred');

      const codeOnly = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeOnly).not.toMatch(
        /\b(window|document|localStorage|sessionStorage|navigator)\b/,
      );
      expect(codeOnly).not.toMatch(/\b(react|next\/|@supabase|livekit)\b/i);
    }

    vi.resetModules();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('sessionStorage', undefined);
    vi.stubGlobal('navigator', undefined);

    return import('@/lib/gameEngine').then((engine) => {
      const code = engine.generateRoomCode();
      expect(engine.isValidRoomCode(code)).toBe(true);
      let s = engine.createInitialLobbyState(code, 'node-host', 'Host', 1_000);
      s = engine.applyAction(s, { type: 'FILL_BOTS_AND_START' }, 2_000);
      const call = engine.computeBotCall(s.seats[0].hand);
      s = engine.applyAction(s, { type: 'PLACE_CALL', seatIndex: 0, call }, 2_100);
      expect(engine.getMatchRankings(s)).toHaveLength(4);
    });
  });
});
