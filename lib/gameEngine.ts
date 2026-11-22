// Pure, deterministic, environment-agnostic game engine for "হান্ডেট (Hundred)".
// Imports strictly from ./types with zero framework, SDK, or DOM/storage globals.

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
  type MatchRanking,
  type MatchRankingEntry,
  type RoundRecord,
  type RoundSeatResult,
  type SeatIndex,
  type SeatState,
  type SeatType,
  type TrickPlay,
} from './types';

export {
  BOT_NAMES,
  CARD_TIER_CLASSES,
  DECK_CARDS,
  QUICK_CALL_VALUES,
  SEAT_INDICES,
};

export const BID_TIMEOUT_MS = 25_000;
export const PLAY_TIMEOUT_MS = 20_000;
export const HOST_STALL_GRACE_MS = 2_500;
export const TRICK_COMPLETE_MS = 2_200;
export const ROUND_SUMMARY_MS = 4_500;
export const TOTAL_ROUNDS = 10;
export const CARDS_PER_HAND = 5;
export const TRICKS_PER_ROUND = 5;
export const MIN_CALL = 50;
export const MAX_CALL = 500;
export const CALL_STEP = 10;
export const AUTO_TIMEOUT_CALL = 50;

export const CANONICAL_ROOM_CODE_PATTERN = /^TNG-[A-Z]{2}\d{2}$/;
export const ROOM_CODE_PATTERN = /^TNG-[A-Z0-9]{2,6}$/;

const ROOM_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_DIGITS = '0123456789';
const FALLBACK_BOT_NAMES = ['Rafi', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4'] as const;

const DECK_CARD_SET: ReadonlySet<number> = new Set<number>(DECK_CARDS);
const VALID_PHASES: ReadonlySet<GamePhase> = new Set<GamePhase>([
  'LOBBY',
  'BIDDING',
  'PLAYING',
  'TRICK_COMPLETE',
  'ROUND_SUMMARY',
  'MATCH_OVER',
]);
const VALID_SEAT_TYPES: ReadonlySet<SeatType> = new Set<SeatType>([
  'EMPTY',
  'HUMAN',
  'AI',
]);

const WIN_PROBABILITY_BY_HIGHER_OUTSIDE: readonly number[] = [
  1.0,
  0.78,
  0.58,
  0.4,
  0.26,
  0.16,
  0.09,
  0.04,
];

function safeRng(rng: () => number): number {
  const raw = rng();
  if (!Number.isFinite(raw)) {
    return 0;
  }
  if (raw <= 0) {
    return 0;
  }
  if (raw >= 1) {
    return 0.999999999999;
  }
  return raw;
}

function safeTimestamp(now: number): number {
  return Number.isFinite(now) ? now : Date.now();
}

function pickChar(alphabet: string, rng: () => number): string {
  const index = Math.min(
    alphabet.length - 1,
    Math.floor(safeRng(rng) * alphabet.length),
  );
  return alphabet.charAt(index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSeat(seat: SeatState): SeatState {
  return {
    ...seat,
    hand: [...seat.hand],
  };
}

function cloneSeats(
  seats: readonly [SeatState, SeatState, SeatState, SeatState],
): [SeatState, SeatState, SeatState, SeatState] {
  return [
    cloneSeat(seats[0]),
    cloneSeat(seats[1]),
    cloneSeat(seats[2]),
    cloneSeat(seats[3]),
  ];
}

function createEmptySeat(seatIndex: SeatIndex): SeatState {
  return {
    seatIndex,
    type: 'EMPTY',
    clientId: null,
    username: '',
    hand: [],
    call: null,
    capturedPoints: 0,
    tricksWon: 0,
    totalScore: 0,
    isOnline: false,
  };
}

function createMatchId(
  roomCode: string,
  timestamp: number,
  version: number,
  rng: () => number,
): string {
  const suffix = Math.floor(safeRng(rng) * 1_000_000)
    .toString(36)
    .padStart(4, '0');
  return `${roomCode}-${timestamp}-v${version}-${suffix}`;
}

function pickBotName(
  seats: readonly [SeatState, SeatState, SeatState, SeatState],
  seatIndex: SeatIndex,
): string {
  const usedNames = new Set<string>(
    seats
      .filter((seat) => seat.type !== 'EMPTY')
      .map((seat) => seat.username.trim().toLowerCase()),
  );

  for (const candidate of BOT_NAMES) {
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  const slotCandidate = `Bot ${seatIndex + 1}`;
  const fallbacks = [FALLBACK_BOT_NAMES[0], slotCandidate, ...FALLBACK_BOT_NAMES.slice(1)];
  for (const candidate of fallbacks) {
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return slotCandidate;
}

function normalizeSeatIndex(seatIndex: SeatIndex): SeatIndex {
  return seatIndex === 0 ? 0 : seatIndex;
}

function resolveCollidingBotNames(
  seats: [SeatState, SeatState, SeatState, SeatState],
  humanUsername: string,
): void {
  const targetLower = humanUsername.trim().toLowerCase();
  if (!targetLower) {
    return;
  }

  for (const idx of SEAT_INDICES) {
    const seat = seats[idx];
    if (
      seat.type === 'AI' &&
      seat.username.trim().toLowerCase() === targetLower
    ) {
      seats[idx] = {
        ...seat,
        username: pickBotName(seats, idx),
      };
    }
  }
}

function startRound(
  baseState: GameState,
  roundNumber: number,
  timestamp: number,
  rng: () => number,
  overrideMatchId?: string,
  overrideRoundHistory?: RoundRecord[],
): GameState {
  const deck = shuffleDeck(rng);
  const starterSeat = getRoundStarterSeat(roundNumber);
  const nextSeats = cloneSeats(baseState.seats);

  for (const idx of SEAT_INDICES) {
    const start = idx * CARDS_PER_HAND;
    const hand = deck.slice(start, start + CARDS_PER_HAND).sort((a, b) => a - b);
    nextSeats[idx] = {
      ...nextSeats[idx],
      hand,
      call: null,
      capturedPoints: 0,
      tricksWon: 0,
    };
  }

  return {
    ...baseState,
    matchId: overrideMatchId ?? baseState.matchId,
    version: baseState.version + 1,
    phase: 'BIDDING',
    round: roundNumber,
    roundStarterSeat: starterSeat,
    trickNumber: 0,
    trickLeaderSeat: starterSeat,
    activeSeat: starterSeat,
    turnDeadline: timestamp + BID_TIMEOUT_MS,
    emittedAt: timestamp,
    seats: nextSeats,
    currentTrick: [],
    lastTrickWinnerSeat: null,
    lastTrickPoints: 0,
    roundHistory: overrideRoundHistory ?? [...baseState.roundHistory],
  };
}

/**
 * Generates a canonical room code in `TNG-[A-Z]{2}\d{2}` format.
 */
export function generateRoomCode(rng: () => number = Math.random): string {
  const l1 = pickChar(ROOM_CODE_LETTERS, rng);
  const l2 = pickChar(ROOM_CODE_LETTERS, rng);
  const d1 = pickChar(ROOM_CODE_DIGITS, rng);
  const d2 = pickChar(ROOM_CODE_DIGITS, rng);
  return `TNG-${l1}${l2}${d1}${d2}`;
}

/**
 * Normalizes a raw room code or pasted `?room=` invite URL without stripping
 * unrelated query/path characters from malformed room code strings.
 */
export function normalizeRoomCode(raw: string): string {
  if (typeof raw !== 'string') {
    return '';
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const startsWithQueryOrSlash = trimmed.startsWith('?') || trimmed.startsWith('/');
  const startsWithRoomParam = /^room=/i.test(trimmed);

  if (hasScheme || startsWithQueryOrSlash || startsWithRoomParam) {
    const queryIndex = trimmed.indexOf('?');
    let queryString = '';

    if (queryIndex !== -1) {
      queryString = trimmed.slice(queryIndex + 1);
    } else if (startsWithRoomParam) {
      queryString = trimmed;
    }

    const hashIndex = queryString.indexOf('#');
    if (hashIndex !== -1) {
      queryString = queryString.slice(0, hashIndex);
    }

    if (queryString.length > 0) {
      const params = new URLSearchParams(queryString);
      for (const [key, value] of params.entries()) {
        if (key.toLowerCase() === 'room') {
          return value.trim().toUpperCase();
        }
      }
    }

    return '';
  }

  const embeddedRoomMatch = trimmed.match(/(?:^|[?&\s])room=([^\s&#]+)/i);
  if (embeddedRoomMatch) {
    const extracted = embeddedRoomMatch[1] ?? '';
    try {
      return decodeURIComponent(extracted).trim().toUpperCase();
    } catch {
      return extracted.trim().toUpperCase();
    }
  }

  return trimmed.toUpperCase();
}

/**
 * Validates that a canonicalized room code satisfies `/^TNG-[A-Z0-9]{2,6}$/`.
 */
export function isValidRoomCode(code: string): boolean {
  return typeof code === 'string' && ROOM_CODE_PATTERN.test(code);
}

/**
 * Maps any card value to one of the 5 UNO-inspired visiting-card tiers.
 */
export function getCardTier(card: CardValue | number): CardTier {
  if (card <= 20) return 'brick-red';
  if (card <= 45) return 'ochre-yellow';
  if (card <= 70) return 'forest-green';
  if (card <= 90) return 'cobalt-blue';
  return 'charcoal-gold';
}

/**
 * Returns a shuffled copy of the 20-card unique deck using Fisher-Yates.
 */
export function shuffleDeck(rng: () => number = Math.random): CardValue[] {
  const deck: CardValue[] = [...DECK_CARDS];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(safeRng(rng) * (i + 1));
    const current = deck[i];
    deck[i] = deck[j];
    deck[j] = current;
  }
  return deck;
}

export function isValidSeatIndex(value: unknown): value is SeatIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function isValidCardValue(value: unknown): value is CardValue {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    DECK_CARD_SET.has(value)
  );
}

export function isValidCallValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= MIN_CALL &&
    value <= MAX_CALL &&
    value % CALL_STEP === 0
  );
}

export function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.matchId !== 'string' || value.matchId.trim().length === 0) {
    return false;
  }

  if (typeof value.roomCode !== 'string' || !isValidRoomCode(value.roomCode)) {
    return false;
  }

  if (
    typeof value.version !== 'number' ||
    !Number.isInteger(value.version) ||
    value.version < 1
  ) {
    return false;
  }

  if (
    typeof value.phase !== 'string' ||
    !VALID_PHASES.has(value.phase as GamePhase)
  ) {
    return false;
  }

  const phase = value.phase as GamePhase;
  if (typeof value.round !== 'number' || !Number.isInteger(value.round)) {
    return false;
  }
  if (phase === 'LOBBY') {
    if (value.round !== 0) {
      return false;
    }
  } else if (value.round < 1 || value.round > TOTAL_ROUNDS) {
    return false;
  }

  if (
    !isValidSeatIndex(value.roundStarterSeat) ||
    Object.is(value.roundStarterSeat, -0) ||
    !isValidSeatIndex(value.trickLeaderSeat) ||
    Object.is(value.trickLeaderSeat, -0) ||
    !isValidSeatIndex(value.activeSeat) ||
    Object.is(value.activeSeat, -0)
  ) {
    return false;
  }

  if (
    typeof value.trickNumber !== 'number' ||
    !Number.isInteger(value.trickNumber) ||
    value.trickNumber < 0 ||
    value.trickNumber > TRICKS_PER_ROUND
  ) {
    return false;
  }

  if (
    value.turnDeadline !== null &&
    (typeof value.turnDeadline !== 'number' || !Number.isFinite(value.turnDeadline))
  ) {
    return false;
  }

  if (typeof value.emittedAt !== 'number' || !Number.isFinite(value.emittedAt)) {
    return false;
  }

  if (!Array.isArray(value.seats) || value.seats.length !== 4) {
    return false;
  }

  const seenActiveCards = new Set<number>();

  for (let idx = 0; idx < 4; idx += 1) {
    const seat = value.seats[idx];
    if (!isRecord(seat) || !Object.is(seat.seatIndex, idx)) {
      return false;
    }
    if (
      typeof seat.type !== 'string' ||
      !VALID_SEAT_TYPES.has(seat.type as SeatType)
    ) {
      return false;
    }
    if (phase !== 'LOBBY' && seat.type === 'EMPTY') {
      return false;
    }
    if (seat.clientId !== null && typeof seat.clientId !== 'string') {
      return false;
    }
    if (typeof seat.username !== 'string') {
      return false;
    }
    if (!Array.isArray(seat.hand) || seat.hand.length > CARDS_PER_HAND) {
      return false;
    }
    for (const card of seat.hand) {
      if (!isValidCardValue(card) || seenActiveCards.has(card)) {
        return false;
      }
      seenActiveCards.add(card);
    }
    if (seat.call !== null && !isValidCallValue(seat.call)) {
      return false;
    }
    if (
      typeof seat.capturedPoints !== 'number' ||
      !Number.isInteger(seat.capturedPoints) ||
      seat.capturedPoints < 0
    ) {
      return false;
    }
    if (
      typeof seat.tricksWon !== 'number' ||
      !Number.isInteger(seat.tricksWon) ||
      seat.tricksWon < 0 ||
      seat.tricksWon > TRICKS_PER_ROUND
    ) {
      return false;
    }
    if (
      typeof seat.totalScore !== 'number' ||
      !Number.isInteger(seat.totalScore) ||
      seat.totalScore < 0
    ) {
      return false;
    }
    if (typeof seat.isOnline !== 'boolean') {
      return false;
    }
  }

  if (!Array.isArray(value.currentTrick) || value.currentTrick.length > 4) {
    return false;
  }
  const seenTrickSeats = new Set<number>();
  for (const play of value.currentTrick) {
    if (!isRecord(play)) {
      return false;
    }
    if (
      !isValidSeatIndex(play.seatIndex) ||
      Object.is(play.seatIndex, -0) ||
      seenTrickSeats.has(play.seatIndex)
    ) {
      return false;
    }
    if (!isValidCardValue(play.card) || seenActiveCards.has(play.card)) {
      return false;
    }
    seenTrickSeats.add(play.seatIndex);
    seenActiveCards.add(play.card);
  }

  if (
    value.lastTrickWinnerSeat !== null &&
    (!isValidSeatIndex(value.lastTrickWinnerSeat) ||
      Object.is(value.lastTrickWinnerSeat, -0))
  ) {
    return false;
  }

  if (
    typeof value.lastTrickPoints !== 'number' ||
    !Number.isInteger(value.lastTrickPoints) ||
    value.lastTrickPoints < 0
  ) {
    return false;
  }

  if (!Array.isArray(value.roundHistory) || value.roundHistory.length > TOTAL_ROUNDS) {
    return false;
  }
  for (const record of value.roundHistory) {
    if (!isRecord(record)) {
      return false;
    }
    if (
      typeof record.round !== 'number' ||
      !Number.isInteger(record.round) ||
      record.round < 1 ||
      record.round > TOTAL_ROUNDS
    ) {
      return false;
    }
    if (!Array.isArray(record.entries) || record.entries.length !== 4) {
      return false;
    }
    const seenEntrySeats = new Set<number>();
    for (const entry of record.entries) {
      if (!isRecord(entry)) {
        return false;
      }
      if (
        !isValidSeatIndex(entry.seatIndex) ||
        Object.is(entry.seatIndex, -0) ||
        seenEntrySeats.has(entry.seatIndex) ||
        typeof entry.username !== 'string' ||
        !isValidCallValue(entry.call) ||
        typeof entry.capturedPoints !== 'number' ||
        !Number.isInteger(entry.capturedPoints) ||
        entry.capturedPoints < 0 ||
        typeof entry.pointsAwarded !== 'number' ||
        !Number.isInteger(entry.pointsAwarded) ||
        entry.pointsAwarded < 0 ||
        typeof entry.totalAfter !== 'number' ||
        !Number.isInteger(entry.totalAfter) ||
        entry.totalAfter < 0
      ) {
        return false;
      }
      seenEntrySeats.add(entry.seatIndex);
    }
    if (seenEntrySeats.size !== 4) {
      return false;
    }
  }

  if (phase === 'LOBBY') {
    if (
      value.trickNumber !== 0 ||
      value.currentTrick.length !== 0 ||
      value.roundHistory.length !== 0 ||
      value.turnDeadline !== null
    ) {
      return false;
    }
  } else if (phase === 'BIDDING') {
    if (value.trickNumber !== 0 || value.currentTrick.length !== 0) {
      return false;
    }
  } else if (phase === 'PLAYING') {
    if (
      value.trickNumber < 1 ||
      value.trickNumber > TRICKS_PER_ROUND ||
      value.currentTrick.length >= 4
    ) {
      return false;
    }
  } else if (phase === 'TRICK_COMPLETE') {
    if (
      value.trickNumber < 1 ||
      value.trickNumber > TRICKS_PER_ROUND ||
      value.currentTrick.length !== 4
    ) {
      return false;
    }
  } else if (phase === 'MATCH_OVER') {
    if (value.round !== TOTAL_ROUNDS || value.turnDeadline !== null) {
      return false;
    }
  }

  return true;
}

export function getNextSeat(seatIndex: SeatIndex): SeatIndex {
  return ((seatIndex + 1) % 4) as SeatIndex;
}

export function getRoundStarterSeat(round: number): SeatIndex {
  const safeRound = Number.isFinite(round) ? Math.max(1, Math.floor(round)) : 1;
  return ((safeRound - 1) % 4) as SeatIndex;
}

export function getTrickPoints(trick: readonly TrickPlay[]): number {
  let total = 0;
  for (const play of trick) {
    total += play.card;
  }
  return total;
}

export function getTrickWinner(trick: readonly TrickPlay[]): TrickPlay | null {
  if (trick.length === 0) {
    return null;
  }
  let winner = trick[0];
  for (let i = 1; i < trick.length; i += 1) {
    if (trick[i].card > winner.card) {
      winner = trick[i];
    }
  }
  return winner;
}

export function createInitialLobbyState(
  roomCode: string,
  hostClientId: string,
  hostUsername: string,
  now: number = Date.now(),
): GameState {
  const timestamp = safeTimestamp(now);
  const normalizedCode = normalizeRoomCode(roomCode);
  const cleanRoomCode = isValidRoomCode(normalizedCode)
    ? normalizedCode
    : generateRoomCode();
  const cleanClientId =
    typeof hostClientId === 'string' && hostClientId.trim().length > 0
      ? hostClientId.trim()
      : 'host-0';
  const cleanUsername =
    typeof hostUsername === 'string' && hostUsername.trim().length > 0
      ? hostUsername.trim()
      : 'Player 1';

  const seat0: SeatState = {
    seatIndex: 0,
    type: 'HUMAN',
    clientId: cleanClientId,
    username: cleanUsername,
    hand: [],
    call: null,
    capturedPoints: 0,
    tricksWon: 0,
    totalScore: 0,
    isOnline: true,
  };

  return {
    matchId: `${cleanRoomCode}-${timestamp}`,
    roomCode: cleanRoomCode,
    version: 1,
    phase: 'LOBBY',
    round: 0,
    roundStarterSeat: 0,
    trickNumber: 0,
    trickLeaderSeat: 0,
    activeSeat: 0,
    turnDeadline: null,
    emittedAt: timestamp,
    seats: [seat0, createEmptySeat(1), createEmptySeat(2), createEmptySeat(3)],
    currentTrick: [],
    lastTrickWinnerSeat: null,
    lastTrickPoints: 0,
    roundHistory: [],
  };
}

export function applyAction(
  state: GameState,
  action: GameAction,
  now: number = Date.now(),
  rng: () => number = Math.random,
): GameState {
  if (!isRecord(state) || !Array.isArray(state.seats) || state.seats.length !== 4) {
    return state;
  }
  if (!isRecord(action) || typeof action.type !== 'string') {
    return state;
  }

  const timestamp = safeTimestamp(now);

  switch (action.type) {
    case 'ADD_BOT': {
      if (state.phase !== 'LOBBY') {
        return state;
      }

      let targetSeat: SeatIndex | null = null;
      if (action.seatIndex !== undefined) {
        if (!isValidSeatIndex(action.seatIndex)) {
          return state;
        }
        const normalizedSeat = normalizeSeatIndex(action.seatIndex);
        if (state.seats[normalizedSeat].type !== 'EMPTY') {
          return state;
        }
        targetSeat = normalizedSeat;
      } else {
        const emptySeat = state.seats.find((seat) => seat.type === 'EMPTY');
        if (!emptySeat) {
          return state;
        }
        targetSeat = emptySeat.seatIndex;
      }

      const nextSeats = cloneSeats(state.seats);
      const botName = pickBotName(nextSeats, targetSeat);
      nextSeats[targetSeat] = {
        seatIndex: targetSeat,
        type: 'AI',
        clientId: `bot-${targetSeat}`,
        username: botName,
        hand: [],
        call: null,
        capturedPoints: 0,
        tricksWon: 0,
        totalScore: 0,
        isOnline: true,
      };

      return {
        ...state,
        version: state.version + 1,
        emittedAt: timestamp,
        seats: nextSeats,
      };
    }

    case 'REMOVE_BOT': {
      if (state.phase !== 'LOBBY') {
        return state;
      }
      if (!isValidSeatIndex(action.seatIndex)) {
        return state;
      }
      const seatIndex = normalizeSeatIndex(action.seatIndex);
      if (state.seats[seatIndex].type !== 'AI') {
        return state;
      }

      const nextSeats = cloneSeats(state.seats);
      nextSeats[seatIndex] = createEmptySeat(seatIndex);

      return {
        ...state,
        version: state.version + 1,
        emittedAt: timestamp,
        seats: nextSeats,
      };
    }

    case 'START_MATCH': {
      if (state.phase !== 'LOBBY') {
        return state;
      }
      if (state.seats.some((seat) => seat.type === 'EMPTY')) {
        return state;
      }

      return startRound(state, 1, timestamp, rng);
    }

    case 'FILL_BOTS_AND_START': {
      if (state.phase !== 'LOBBY') {
        return state;
      }

      const nextSeats = cloneSeats(state.seats);
      for (const idx of SEAT_INDICES) {
        if (nextSeats[idx].type === 'EMPTY') {
          nextSeats[idx] = {
            seatIndex: idx,
            type: 'AI',
            clientId: `bot-${idx}`,
            username: pickBotName(nextSeats, idx),
            hand: [],
            call: null,
            capturedPoints: 0,
            tricksWon: 0,
            totalScore: 0,
            isOnline: true,
          };
        }
      }

      const filledState: GameState = {
        ...state,
        seats: nextSeats,
      };
      return startRound(filledState, 1, timestamp, rng);
    }

    case 'PLACE_CALL': {
      if (state.phase !== 'BIDDING') {
        return state;
      }
      if (!isValidSeatIndex(action.seatIndex)) {
        return state;
      }
      const seatIndex = normalizeSeatIndex(action.seatIndex);
      if (seatIndex !== state.activeSeat) {
        return state;
      }
      const actingSeat = state.seats[seatIndex];
      if (actingSeat.type === 'EMPTY' || actingSeat.call !== null) {
        return state;
      }
      if (!isValidCallValue(action.call)) {
        return state;
      }

      const normalizedCall = action.call === 0 ? 0 : action.call;
      const nextSeats = cloneSeats(state.seats);
      nextSeats[seatIndex] = {
        ...nextSeats[seatIndex],
        call: normalizedCall,
      };

      const allCalled = nextSeats.every((seat) => seat.call !== null);
      if (!allCalled) {
        return {
          ...state,
          version: state.version + 1,
          activeSeat: getNextSeat(seatIndex),
          turnDeadline: timestamp + BID_TIMEOUT_MS,
          emittedAt: timestamp,
          seats: nextSeats,
        };
      }

      return {
        ...state,
        version: state.version + 1,
        phase: 'PLAYING',
        trickNumber: 1,
        trickLeaderSeat: state.roundStarterSeat,
        activeSeat: state.roundStarterSeat,
        turnDeadline: timestamp + PLAY_TIMEOUT_MS,
        emittedAt: timestamp,
        seats: nextSeats,
        currentTrick: [],
        lastTrickWinnerSeat: null,
        lastTrickPoints: 0,
      };
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'PLAYING') {
        return state;
      }
      if (!isValidSeatIndex(action.seatIndex)) {
        return state;
      }
      const seatIndex = normalizeSeatIndex(action.seatIndex);
      if (seatIndex !== state.activeSeat) {
        return state;
      }
      if (!isValidCardValue(action.card)) {
        return state;
      }
      if (state.currentTrick.length >= 4) {
        return state;
      }
      if (state.currentTrick.some((play) => play.seatIndex === seatIndex)) {
        return state;
      }

      const actingSeat = state.seats[seatIndex];
      if (!actingSeat.hand.includes(action.card)) {
        return state;
      }

      const nextSeats = cloneSeats(state.seats);
      nextSeats[seatIndex] = {
        ...nextSeats[seatIndex],
        hand: nextSeats[seatIndex].hand.filter((c) => c !== action.card),
      };

      const nextTrick: TrickPlay[] = [
        ...state.currentTrick,
        { seatIndex, card: action.card },
      ];

      if (nextTrick.length < 4) {
        return {
          ...state,
          version: state.version + 1,
          activeSeat: getNextSeat(seatIndex),
          turnDeadline: timestamp + PLAY_TIMEOUT_MS,
          emittedAt: timestamp,
          seats: nextSeats,
          currentTrick: nextTrick,
        };
      }

      const winnerPlay = getTrickWinner(nextTrick);
      if (!winnerPlay) {
        return state;
      }
      const trickPoints = getTrickPoints(nextTrick);

      nextSeats[winnerPlay.seatIndex] = {
        ...nextSeats[winnerPlay.seatIndex],
        capturedPoints: nextSeats[winnerPlay.seatIndex].capturedPoints + trickPoints,
        tricksWon: nextSeats[winnerPlay.seatIndex].tricksWon + 1,
      };

      return {
        ...state,
        version: state.version + 1,
        phase: 'TRICK_COMPLETE',
        activeSeat: winnerPlay.seatIndex,
        turnDeadline: timestamp + TRICK_COMPLETE_MS,
        emittedAt: timestamp,
        seats: nextSeats,
        currentTrick: nextTrick,
        lastTrickWinnerSeat: winnerPlay.seatIndex,
        lastTrickPoints: trickPoints,
      };
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'ROUND_SUMMARY') {
        return state;
      }

      if (state.round >= TOTAL_ROUNDS) {
        return {
          ...state,
          version: state.version + 1,
          phase: 'MATCH_OVER',
          turnDeadline: null,
          emittedAt: timestamp,
        };
      }

      return startRound(state, state.round + 1, timestamp, rng);
    }

    case 'PLAY_AGAIN': {
      if (state.phase !== 'MATCH_OVER') {
        return state;
      }

      const resetSeats = cloneSeats(state.seats);
      for (const idx of SEAT_INDICES) {
        resetSeats[idx] = {
          ...resetSeats[idx],
          hand: [],
          call: null,
          capturedPoints: 0,
          tricksWon: 0,
          totalScore: 0,
        };
      }

      const nextVersion = state.version + 1;
      const newMatchId = createMatchId(state.roomCode, timestamp, nextVersion, rng);
      const allSeated = resetSeats.every((seat) => seat.type !== 'EMPTY');

      if (!allSeated) {
        return {
          ...state,
          matchId: newMatchId,
          version: nextVersion,
          phase: 'LOBBY',
          round: 0,
          roundStarterSeat: 0,
          trickNumber: 0,
          trickLeaderSeat: 0,
          activeSeat: 0,
          turnDeadline: null,
          emittedAt: timestamp,
          seats: resetSeats,
          currentTrick: [],
          lastTrickWinnerSeat: null,
          lastTrickPoints: 0,
          roundHistory: [],
        };
      }

      const baseForReset: GameState = {
        ...state,
        seats: resetSeats,
      };
      return startRound(baseForReset, 1, timestamp, rng, newMatchId, []);
    }

    default:
      return state;
  }
}

export function resolveTimeoutOrTransition(
  state: GameState,
  now: number = Date.now(),
  rng: () => number = Math.random,
): GameState {
  if (!isRecord(state) || !Array.isArray(state.seats) || state.seats.length !== 4) {
    return state;
  }
  if (
    state.turnDeadline === null ||
    typeof state.turnDeadline !== 'number' ||
    !Number.isFinite(state.turnDeadline)
  ) {
    return state;
  }

  const timestamp = safeTimestamp(now);
  if (timestamp < state.turnDeadline) {
    return state;
  }

  switch (state.phase) {
    case 'BIDDING':
      return applyAction(
        state,
        {
          type: 'PLACE_CALL',
          seatIndex: state.activeSeat,
          call: AUTO_TIMEOUT_CALL,
        },
        timestamp,
        rng,
      );

    case 'PLAYING': {
      if (!isValidSeatIndex(state.activeSeat)) {
        return state;
      }
      const activeSeat = normalizeSeatIndex(state.activeSeat);
      const hand = state.seats[activeSeat]?.hand;
      if (!hand || hand.length === 0) {
        return state;
      }
      const lowestCard = Math.min(...hand) as CardValue;
      return applyAction(
        state,
        {
          type: 'PLAY_CARD',
          seatIndex: activeSeat,
          card: lowestCard,
        },
        timestamp,
        rng,
      );
    }

    case 'TRICK_COMPLETE': {
      const winnerSeat =
        state.lastTrickWinnerSeat ??
        getTrickWinner(state.currentTrick)?.seatIndex ??
        state.trickLeaderSeat;

      if (state.trickNumber < TRICKS_PER_ROUND) {
        return {
          ...state,
          version: state.version + 1,
          phase: 'PLAYING',
          trickNumber: state.trickNumber + 1,
          trickLeaderSeat: winnerSeat,
          activeSeat: winnerSeat,
          turnDeadline: timestamp + PLAY_TIMEOUT_MS,
          emittedAt: timestamp,
          seats: cloneSeats(state.seats),
          currentTrick: [],
          lastTrickWinnerSeat: null,
          lastTrickPoints: 0,
        };
      }

      const nextSeats = cloneSeats(state.seats);
      const entries: RoundSeatResult[] = [];

      for (const idx of SEAT_INDICES) {
        const seat = nextSeats[idx];
        const call = seat.call ?? 0;
        const pointsAwarded = seat.capturedPoints >= call ? call : 0;
        const totalAfter = seat.totalScore + pointsAwarded;
        nextSeats[idx] = {
          ...seat,
          totalScore: totalAfter,
        };
        entries.push({
          seatIndex: seat.seatIndex,
          username: seat.username,
          call,
          capturedPoints: seat.capturedPoints,
          pointsAwarded,
          totalAfter,
        });
      }

      const roundRecord: RoundRecord = {
        round: state.round,
        entries,
      };
      const nextHistory = [...state.roundHistory, roundRecord];
      const matchFinished = state.round >= TOTAL_ROUNDS;

      return {
        ...state,
        version: state.version + 1,
        phase: matchFinished ? 'MATCH_OVER' : 'ROUND_SUMMARY',
        turnDeadline: matchFinished ? null : timestamp + ROUND_SUMMARY_MS,
        emittedAt: timestamp,
        seats: nextSeats,
        currentTrick: [],
        lastTrickWinnerSeat: null,
        lastTrickPoints: 0,
        roundHistory: nextHistory,
      };
    }

    case 'ROUND_SUMMARY':
      return applyAction(state, { type: 'NEXT_ROUND' }, timestamp, rng);

    case 'LOBBY':
    case 'MATCH_OVER':
    default:
      return state;
  }
}

/**
 * Estimates a conservative, legal bidding call (0..500 in steps of 10) for an AI seat.
 */
export function computeBotCall(
  hand: readonly CardValue[],
  existingCalls: readonly (number | null)[] = [],
): number {
  if (!Array.isArray(hand) || hand.length === 0) {
    return 0;
  }

  const validHand = hand.filter(
    (card): card is CardValue => typeof card === 'number' && Number.isFinite(card),
  );
  if (validHand.length === 0) {
    return 0;
  }

  const handSet = new Set<number>(validHand);
  let expectedTotal = 0;

  for (const card of validHand) {
    let higherOutsideCount = 0;
    for (const deckCard of DECK_CARDS) {
      if (deckCard > card && !handSet.has(deckCard)) {
        higherOutsideCount += 1;
      }
    }
    const winProb =
      higherOutsideCount < WIN_PROBABILITY_BY_HIGHER_OUTSIDE.length
        ? WIN_PROBABILITY_BY_HIGHER_OUTSIDE[higherOutsideCount]
        : 0;
    expectedTotal += winProb * (card + 80);
  }

  const validCalls = Array.isArray(existingCalls)
    ? existingCalls.filter(
        (call): call is number => typeof call === 'number' && Number.isFinite(call),
      )
    : [];

  if (validCalls.length > 0) {
    const avgCall =
      validCalls.reduce((sum, value) => sum + value, 0) / validCalls.length;
    if (avgCall >= 240 && expectedTotal > 50) {
      expectedTotal -= 15;
    } else if (avgCall <= 60 && validCalls.length >= 2 && expectedTotal > 0) {
      expectedTotal += 10;
    }
  }

  const buffered = expectedTotal * 0.85;
  const rounded = Math.round(buffered / CALL_STEP) * CALL_STEP;
  const clamped = Math.max(MIN_CALL, Math.min(MAX_CALL, rounded));
  return clamped === 0 ? 0 : clamped;
}

/**
 * Chooses a legal card from `state.seats[seatIndex].hand` using goal-aware trick heuristics.
 */
export function computeBotCard(state: GameState, seatIndex: SeatIndex): CardValue {
  if (!isRecord(state) || !Array.isArray(state.seats) || !isValidSeatIndex(seatIndex)) {
    return DECK_CARDS[0];
  }

  const normalizedSeat = normalizeSeatIndex(seatIndex);
  const seat = state.seats[normalizedSeat];
  if (!isRecord(seat) || !Array.isArray(seat.hand) || seat.hand.length === 0) {
    return DECK_CARDS[0];
  }

  const sorted = [...seat.hand].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const targetCall = seat.call ?? 0;
  const needed = Math.max(0, targetCall - seat.capturedPoints);

  if (needed === 0) {
    return sorted[0];
  }

  const currentTrick = Array.isArray(state.currentTrick) ? state.currentTrick : [];

  if (currentTrick.length === 0) {
    const highest = sorted[sorted.length - 1];
    if (highest >= 90 && (needed >= 80 || sorted.length <= 2)) {
      return highest;
    }
    if (highest >= 75 && state.trickNumber >= 4) {
      return highest;
    }
    return sorted[0];
  }

  const currentMax = Math.max(...currentTrick.map((play) => play.card));
  const currentPot = getTrickPoints(currentTrick);
  const winners = sorted.filter((card) => card > currentMax);

  if (winners.length === 0) {
    return sorted[0];
  }

  if (currentTrick.length === 3) {
    return winners[0];
  }

  if (winners[winners.length - 1] === 100 && currentPot >= 130) {
    return 100;
  }

  if (winners[0] >= 75 || currentPot >= 70 || state.trickNumber >= 4) {
    return winners[0];
  }

  return sorted[0];
}

/**
 * Computes deterministic 4-player match rankings sorted by score, hits, captured points, and seatIndex.
 */
export function getMatchRankings(state: GameState): MatchRankingEntry[] {
  const rawEntries: MatchRanking[] = state.seats.map((seat) => {
    let roundsHit = 0;
    let historyCaptured = 0;

    for (const record of state.roundHistory) {
      const entry = record.entries.find((item) => item.seatIndex === seat.seatIndex);
      if (entry) {
        if (entry.pointsAwarded > 0) {
          roundsHit += 1;
        }
        historyCaptured += entry.capturedPoints;
      }
    }

    const totalCapturedPoints =
      state.roundHistory.length === 0
        ? seat.capturedPoints
        : state.phase === 'PLAYING' || state.phase === 'TRICK_COMPLETE'
          ? historyCaptured + seat.capturedPoints
          : historyCaptured;

    return {
      rank: 1,
      seatIndex: seat.seatIndex,
      type: seat.type,
      username: seat.username,
      totalScore: seat.totalScore,
      roundsHit,
      totalCapturedPoints,
    };
  });

  rawEntries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.roundsHit !== a.roundsHit) {
      return b.roundsHit - a.roundsHit;
    }
    if (b.totalCapturedPoints !== a.totalCapturedPoints) {
      return b.totalCapturedPoints - a.totalCapturedPoints;
    }
    return a.seatIndex - b.seatIndex;
  });

  const ranked: MatchRankingEntry[] = [];
  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index];
    const prev = index > 0 ? ranked[index - 1] : null;
    const rank =
      prev && entry.totalScore === prev.totalScore ? prev.rank : index + 1;
    ranked.push({
      ...entry,
      rank,
    });
  }
  return ranked;
}

/**
 * Pure helper for M3 human seating & reconnect handling without mutating input state.
 */
export function assignHumanSeat(
  state: GameState,
  clientId: string,
  username: string,
  now: number = Date.now(),
): GameState {
  if (!isRecord(state) || !Array.isArray(state.seats) || state.seats.length !== 4) {
    return state;
  }

  const cleanId = typeof clientId === 'string' ? clientId.trim() : '';
  const cleanName = typeof username === 'string' ? username.trim() : '';
  if (!cleanId || !cleanName) {
    return state;
  }

  const timestamp = safeTimestamp(now);
  const existingSeat = state.seats.find(
    (seat) => seat.type === 'HUMAN' && seat.clientId === cleanId,
  );

  if (existingSeat) {
    const nextUsername = state.phase === 'LOBBY' ? cleanName : existingSeat.username;
    if (existingSeat.isOnline && nextUsername === existingSeat.username) {
      return state;
    }
    const nextSeats = cloneSeats(state.seats);
    nextSeats[existingSeat.seatIndex] = {
      ...nextSeats[existingSeat.seatIndex],
      isOnline: true,
      username: nextUsername,
    };
    if (state.phase === 'LOBBY') {
      resolveCollidingBotNames(nextSeats, nextUsername);
    }
    return {
      ...state,
      version: state.version + 1,
      emittedAt: timestamp,
      seats: nextSeats,
    };
  }

  if (state.phase !== 'LOBBY') {
    return state;
  }

  const emptySeat = state.seats.find((seat) => seat.type === 'EMPTY');
  if (!emptySeat) {
    return state;
  }

  const nextSeats = cloneSeats(state.seats);
  nextSeats[emptySeat.seatIndex] = {
    seatIndex: emptySeat.seatIndex,
    type: 'HUMAN',
    clientId: cleanId,
    username: cleanName,
    hand: [],
    call: null,
    capturedPoints: 0,
    tricksWon: 0,
    totalScore: 0,
    isOnline: true,
  };
  resolveCollidingBotNames(nextSeats, cleanName);

  return {
    ...state,
    version: state.version + 1,
    emittedAt: timestamp,
    seats: nextSeats,
  };
}

/**
 * Updates online status for a single human seat by `clientId` if it changed.
 */
export function setSeatOnlineStatus(
  state: GameState,
  clientId: string,
  isOnline: boolean,
  now: number = Date.now(),
): GameState {
  const cleanId = typeof clientId === 'string' ? clientId.trim() : '';
  if (!cleanId) {
    return state;
  }

  const target = state.seats.find(
    (seat) => seat.type === 'HUMAN' && seat.clientId === cleanId,
  );
  if (!target || target.isOnline === isOnline) {
    return state;
  }

  const timestamp = safeTimestamp(now);
  const nextSeats = cloneSeats(state.seats);
  nextSeats[target.seatIndex] = {
    ...nextSeats[target.seatIndex],
    isOnline,
  };

  return {
    ...state,
    version: state.version + 1,
    emittedAt: timestamp,
    seats: nextSeats,
  };
}

/**
 * Reconciles all 4 seats' `isOnline` flags against the active Presence client ID set.
 */
export function syncPresenceOnlineStatus(
  state: GameState,
  onlineClientIds: ReadonlySet<string> | readonly string[],
  now: number = Date.now(),
): GameState {
  const onlineSet: ReadonlySet<string> = Array.isArray(onlineClientIds)
    ? new Set(onlineClientIds)
    : (onlineClientIds as ReadonlySet<string>);

  let changed = false;
  for (const seat of state.seats) {
    const desired =
      seat.type === 'HUMAN'
        ? seat.clientId !== null && onlineSet.has(seat.clientId)
        : seat.type === 'AI';
    if (seat.isOnline !== desired) {
      changed = true;
      break;
    }
  }

  if (!changed) {
    return state;
  }

  const timestamp = safeTimestamp(now);
  const nextSeats = cloneSeats(state.seats);
  for (const idx of SEAT_INDICES) {
    const seat = nextSeats[idx];
    const desired =
      seat.type === 'HUMAN'
        ? seat.clientId !== null && onlineSet.has(seat.clientId)
        : seat.type === 'AI';
    nextSeats[idx] = {
      ...seat,
      isOnline: desired,
    };
  }

  return {
    ...state,
    version: state.version + 1,
    emittedAt: timestamp,
    seats: nextSeats,
  };
}
