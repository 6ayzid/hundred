// Pure, environment-agnostic TypeScript contracts for "হান্ডেট (Hundred)".
// Zero browser globals, zero runtime framework/SDK imports.

export type SeatIndex = 0 | 1 | 2 | 3;

export const SEAT_INDICES = [0, 1, 2, 3] as const;

/**
 * Exact 20-card unique deck per specification (85 excluded; total sum = 966).
 */
export const DECK_CARDS = [
  1, 5, 10, 15, 20, 25, 30, 35, 40, 45,
  50, 55, 60, 65, 70, 75, 80, 90, 95, 100,
] as const;

export type CardValue = (typeof DECK_CARDS)[number];

export type CardTier =
  | 'brick-red'
  | 'ochre-yellow'
  | 'forest-green'
  | 'cobalt-blue'
  | 'charcoal-gold';

/**
 * Maps each CardTier directly to its CSS component class in app/globals.css.
 */
export const CARD_TIER_CLASSES: Readonly<Record<CardTier, string>> = {
  'brick-red': 'card-tier-brick-red',
  'ochre-yellow': 'card-tier-ochre-yellow',
  'forest-green': 'card-tier-forest-green',
  'cobalt-blue': 'card-tier-cobalt-blue',
  'charcoal-gold': 'card-tier-charcoal-gold',
} as const;

export type GamePhase =
  | 'LOBBY'
  | 'BIDDING'
  | 'PLAYING'
  | 'TRICK_COMPLETE'
  | 'ROUND_SUMMARY'
  | 'MATCH_OVER';

export type SeatType = 'EMPTY' | 'HUMAN' | 'AI';

export const BOT_NAMES = ['Siam', 'Apon', 'Nabil'] as const;
export type BotName = (typeof BOT_NAMES)[number];

export const QUICK_CALL_VALUES = [50, 100, 150, 200, 250, 300, 400, 500] as const;
export type QuickCallValue = (typeof QUICK_CALL_VALUES)[number];

export const BANTER_CHIPS = [
  '100 charlam!',
  'Call koto?',
  'Ei bar baji jitbo!',
  'Chales!',
] as const;
export type BanterChip = (typeof BANTER_CHIPS)[number];

export interface SeatState {
  seatIndex: SeatIndex;
  type: SeatType;
  clientId: string | null;
  username: string;
  hand: CardValue[];
  call: number | null;
  capturedPoints: number;
  tricksWon: number;
  totalScore: number;
  isOnline: boolean;
}

export interface TrickPlay {
  seatIndex: SeatIndex;
  card: CardValue;
}

export interface RoundSeatResult {
  seatIndex: SeatIndex;
  username: string;
  call: number;
  capturedPoints: number;
  pointsAwarded: number;
  totalAfter: number;
}

export interface RoundRecord {
  round: number;
  entries: RoundSeatResult[];
}

export interface GameState {
  matchId: string;
  roomCode: string;
  version: number;
  phase: GamePhase;
  round: number;
  roundStarterSeat: SeatIndex;
  trickNumber: number;
  trickLeaderSeat: SeatIndex;
  activeSeat: SeatIndex;
  turnDeadline: number | null;
  emittedAt: number;
  seats: [SeatState, SeatState, SeatState, SeatState];
  currentTrick: TrickPlay[];
  lastTrickWinnerSeat: SeatIndex | null;
  lastTrickPoints: number;
  roundHistory: RoundRecord[];
}

export type GameAction =
  | { type: 'ADD_BOT'; seatIndex?: SeatIndex }
  | { type: 'REMOVE_BOT'; seatIndex: SeatIndex }
  | { type: 'FILL_BOTS_AND_START' }
  | { type: 'START_MATCH' }
  | { type: 'PLACE_CALL'; seatIndex: SeatIndex; call: number }
  | { type: 'PLAY_CARD'; seatIndex: SeatIndex; card: CardValue }
  | { type: 'NEXT_ROUND' }
  | { type: 'PLAY_AGAIN' };

export interface MatchRankingEntry {
  rank: number;
  seatIndex: SeatIndex;
  type: SeatType;
  username: string;
  totalScore: number;
  roundsHit: number;
  totalCapturedPoints: number;
}

export type MatchRanking = MatchRankingEntry;

export interface ChatMessage {
  id: string;
  senderId: string;
  seatIndex: SeatIndex | null;
  username: string;
  text: string;
  timestamp: number;
  isBanter?: boolean;
}

export interface PresenceMeta {
  clientId: string;
  seatIndex: SeatIndex | null;
  username: string;
  joinedAt: number;
}

export type SyncMode = 'supabase' | 'local';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'local';

/**
 * Discriminated broadcast envelopes sent over Supabase Realtime channel `eksho:${roomCode}`.
 * Every payload includes `senderId` to enforce the self-echo guard.
 */
export type SyncBroadcastEvent =
  | {
      type: 'JOIN_REQUEST';
      senderId: string;
      username: string;
      preferredSeat?: SeatIndex | null;
    }
  | {
      type: 'REQUEST_SYNC';
      senderId: string;
    }
  | {
      type: 'GAME_ACTION';
      senderId: string;
      action: GameAction;
    }
  | {
      type: 'STATE_SNAPSHOT';
      senderId: string;
      state: GameState;
    }
  | {
      type: 'CHAT_MSG';
      senderId: string;
      message: ChatMessage;
    };

/**
 * Technical protocol keys preserved per specification.
 */
export const REALTIME_CHANNEL_PREFIX = 'eksho:' as const;
export const STORAGE_STATE_KEY_PREFIX = 'eksho_state_' as const;
export const SESSION_CLIENT_ID_KEY = 'eksho_client_id' as const;
export const SESSION_SEAT_KEY_PREFIX = 'eksho_seat_' as const;

export type SpeakingMap = Record<string, boolean>;

export interface LiveKitTokenResponse {
  token: string;
}

export interface LiveKitTokenErrorResponse {
  error: string;
  configured?: boolean;
}

export interface UseGameSyncOptions {
  roomCode: string;
  username: string;
  enabled: boolean;
  /** When true (e.g. joining via invite link or Join button), do not create a brand-new room if no host exists. */
  joinOnly?: boolean;
}

export interface UseGameSyncResult {
  state: GameState | null;
  clientId: string;
  mySeatIndex: SeatIndex | null;
  hostSeatIndex: SeatIndex | null;
  isHost: boolean;
  syncMode: SyncMode;
  onlineSeats: SeatIndex[];
  chatMessages: ChatMessage[];
  remainingMs: number | null;
  connectionStatus: ConnectionStatus;
  roomUnavailableReason: string | null;
  dispatchAction: (action: GameAction) => void;
  sendChat: (text: string, isBanter?: boolean) => void;
  leaveRoom: () => void;
}
