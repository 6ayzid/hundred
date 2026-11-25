'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BrandMark } from '@/components/BrandLogo';
import { PlayingCard } from '@/components/PlayingCard';
import { RankBadge, getRankVisualConfig } from '@/components/RankBadge';
import { ScoreboardModal } from '@/components/ScoreboardModal';
import {
  SeatAvatarGraphic,
  SeatHub,
  type HubPosition,
} from '@/components/SeatHub';
import { VoiceBar } from '@/components/VoiceBar';
import {
  BID_TIMEOUT_MS,
  CALL_STEP,
  getMatchRankings,
  MAX_CALL,
  MIN_CALL,
  PLAY_TIMEOUT_MS,
  TOTAL_ROUNDS,
} from '@/lib/gameEngine';
import {
  DEFAULT_LANG,
  formatNum,
  localizeDisplayName,
  TEXTS,
  type Lang,
} from '@/lib/i18n';
import {
  isSfxMuted,
  playCallSound,
  playCardSound,
  playChatSound,
  playDealTickSound,
  playRoundSummarySound,
  playShuffleSound,
  playTrickWinSound,
  setSfxMuted,
  unlockAudio,
} from '@/lib/soundEngine';
import {
  QUICK_CALL_VALUES,
  type CardValue,
  type ChatMessage,
  type ConnectionStatus,
  type GameAction,
  type GameState,
  type MatchRankingEntry,
  type SeatIndex,
  type SpeakingMap,
  type SyncMode,
} from '@/lib/types';

/**
 * Handcrafted pure-SVG kawaii smiling hurricane lantern (kupibati) — < 1.2 KB, zero image bloat.
 */
function KupibatiLantern({ paused }: { paused: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative flex items-center justify-center"
    >
      {/* Soft warm honey-peach glow halo */}
      <div
        className={`absolute h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,224,132,0.58)_0%,rgba(255,186,162,0.22)_46%,transparent_72%)] ${
          paused ? '' : 'animate-lantern-flicker'
        }`}
      />
      <svg
        width="56"
        height="74"
        viewBox="0 0 56 74"
        fill="none"
        className={`relative drop-shadow-[0_6px_12px_rgba(166,104,108,0.28)] ${
          paused ? '' : 'animate-cute-float'
        }`}
      >
        {/* Little floating sparkles */}
        <path
          d="M7 22L8.3 25L11.3 26.3L8.3 27.6L7 30.6L5.7 27.6L2.7 26.3L5.7 25L7 22Z"
          fill="#ffc857"
          className={paused ? '' : 'animate-sparkle-twinkle'}
        />
        <path
          d="M49 16L50 18.4L52.4 19.4L50 20.4L49 22.8L48 20.4L45.6 19.4L48 18.4L49 16Z"
          fill="#ff8fab"
          className={paused ? '' : 'animate-sparkle-twinkle'}
          style={{ animationDelay: '0.8s' }}
        />
        {/* Top ring handle */}
        <circle cx="28" cy="7" r="4" stroke="#f0a84c" strokeWidth="2.2" />
        {/* Pastel strawberry-peach hood */}
        <path d="M18 16C19.5 11 23 9.5 28 9.5C33 9.5 36.5 11 38 16H18Z" fill="#ff8fab" stroke="#fff8f2" strokeWidth="1.5" />
        <rect x="15" y="15.5" width="26" height="4" rx="2" fill="#ffc857" stroke="#fff8f2" strokeWidth="1.2" />
        {/* Side wire guards */}
        <path d="M17 19.5C11 27 11 41 16 50" stroke="#f0a84c" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M39 19.5C45 27 45 41 40 50" stroke="#f0a84c" strokeWidth="1.8" strokeLinecap="round" />
        {/* Chubby glass globe */}
        <path
          d="M18 19.5H38C41.5 27 41.5 40 37.5 49.5H18.5C14.5 40 14.5 27 18 19.5Z"
          fill="url(#kupibatiGlass)"
          stroke="#fff8f0"
          strokeWidth="1.8"
        />
        {/* Warm inner flame glow */}
        <g className={paused ? '' : 'animate-lantern-flicker'} style={{ transformOrigin: '28px 36px' }}>
          <circle cx="28" cy="34" r="7.5" fill="#fff3b0" fillOpacity="0.85" />
        </g>
        {/* Kawaii happy closed eyes ^ ^ + rosy cheeks + tiny smile */}
        <path d="M21.5 34.5Q23.5 32 25.5 34.5" stroke="#5e3a34" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M30.5 34.5Q32.5 32 34.5 34.5" stroke="#5e3a34" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="20.5" cy="37.5" rx="2.3" ry="1.3" fill="#ff8fab" fillOpacity="0.7" />
        <ellipse cx="35.5" cy="37.5" rx="2.3" ry="1.3" fill="#ff8fab" fillOpacity="0.7" />
        <path d="M26 37.5Q28 39.5 30 37.5" stroke="#5e3a34" strokeWidth="1.4" strokeLinecap="round" />
        {/* Pastel strawberry base */}
        <path d="M15 49.5H41L44 60C44 62.5 41.8 64.5 39 64.5H17C14.2 64.5 12 62.5 12 60L15 49.5Z" fill="#ff8fab" stroke="#fff8f2" strokeWidth="1.6" />
        <rect x="11" y="63" width="34" height="5" rx="2.5" fill="#ffc857" stroke="#fff8f2" strokeWidth="1.3" />
        <defs>
          <radialGradient id="kupibatiGlass" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(28 34) rotate(90) scale(16 13)">
            <stop stopColor="#fffbe0" stopOpacity="0.95" />
            <stop offset="0.65" stopColor="#ffe18c" stopOpacity="0.82" />
            <stop offset="1" stopColor="#ffbe76" stopOpacity="0.75" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

function subscribeDesktopMedia(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(min-width: 768px)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getDesktopMediaSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(min-width: 768px)').matches;
}

function getDesktopMediaServerSnapshot(): boolean {
  return true;
}

const CLOCKWISE_DEAL_ORDER: readonly HubPosition[] = [
  'bottom-left',
  'left',
  'top',
  'right',
];

const DEAL_FALLBACK_VECTORS: Record<
  HubPosition,
  { dx: number; dy: number; rot: number }
> = {
  'bottom-left': { dx: 0, dy: 205, rot: 4 },
  left: { dx: -320, dy: 12, rot: -16 },
  top: { dx: 55, dy: -220, rot: 10 },
  right: { dx: 320, dy: 12, rot: 16 },
};

interface DealFlyCard {
  step: number;
  pos: HubPosition;
  dx: number;
  dy: number;
  rot: number;
}

interface SweepVector {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
}

const FULL_DEALT_COUNTS: Record<HubPosition, number> = {
  'bottom-left': 5,
  left: 5,
  top: 5,
  right: 5,
};

const ZERO_DEALT_COUNTS: Record<HubPosition, number> = {
  'bottom-left': 0,
  left: 0,
  top: 0,
  right: 0,
};

export interface GameTableProps {
  state: GameState;
  clientId: string;
  username: string;
  mySeatIndex: SeatIndex | null;
  hostSeatIndex: SeatIndex | null;
  syncMode: SyncMode;
  connectionStatus: ConnectionStatus;
  remainingMs: number | null;
  isLiveKitConfigured: boolean;
  lowDataMode: boolean;
  onToggleLowDataMode: () => void;
  rainEnabled: boolean;
  onToggleRain: () => void;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, isBanter?: boolean) => void;
  speakingByClientId: SpeakingMap;
  onSpeakingMapChange: (speaking: SpeakingMap) => void;
  onDispatchAction: (action: GameAction) => void;
  onLeaveRoom: () => void;
  availableCardScans?: number[];
  lang?: Lang;
  onToggleLang?: () => void;
}

function getRelativeSeatIndex(baseSeat: SeatIndex, offset: number): SeatIndex {
  return ((baseSeat + offset) % 4) as SeatIndex;
}

export function GameTable({
  state,
  clientId,
  username,
  mySeatIndex,
  hostSeatIndex,
  remainingMs,
  isLiveKitConfigured,
  lowDataMode,
  onToggleLowDataMode,
  rainEnabled,
  onToggleRain,
  chatMessages,
  onSendChat,
  speakingByClientId,
  onSpeakingMapChange,
  onDispatchAction,
  onLeaveRoom,
  availableCardScans = [],
  lang = DEFAULT_LANG,
  onToggleLang,
}: GameTableProps) {
  const t = TEXTS[lang];
  const [selectedCall, setSelectedCall] = useState<number>(100);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [dealStage, setDealStage] = useState<'shuffling' | 'dealing' | 'ready'>(
    'ready',
  );
  const [dealtCounts, setDealtCounts] = useState<Record<HubPosition, number>>(
    () => ({ ...FULL_DEALT_COUNTS }),
  );
  const [dealFlies, setDealFlies] = useState<DealFlyCard[]>([]);
  const [remainingDeckCount, setRemainingDeckCount] = useState<number>(20);
  const [sweepPhase, setSweepPhase] = useState<
    'idle' | 'highlight' | 'sweeping' | 'landed'
  >('idle');
  const [sweepVectors, setSweepVectors] = useState<
    Partial<Record<HubPosition, SweepVector>>
  >({});
  const [sfxMuted, setSfxMutedState] = useState<boolean>(() => isSfxMuted());

  const tableRootRef = useRef<HTMLDivElement | null>(null);
  const dealingDeckRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isDesktop = useSyncExternalStore(
    subscribeDesktopMedia,
    getDesktopMediaSnapshot,
    getDesktopMediaServerSnapshot,
  );

  const scanSet = useMemo(() => new Set(availableCardScans), [availableCardScans]);

  // Tactile Web Audio SFX synced to real game state transitions
  const prevTrickLenRef = useRef<number>(state.currentTrick.length);
  const prevPhaseRef = useRef<GameState['phase']>(state.phase);
  const prevRoundRef = useRef<number>(state.round);
  const prevCallsCountRef = useRef<number>(
    state.seats.filter((s) => s.call !== null).length,
  );
  const prevChatLenRef = useRef<number>(chatMessages.length);

  useEffect(() => {
    const callsCount = state.seats.filter((s) => s.call !== null).length;

    if (state.round !== prevRoundRef.current && state.phase === 'BIDDING') {
      playShuffleSound();
    } else if (callsCount > prevCallsCountRef.current) {
      playCallSound();
    }

    if (state.currentTrick.length > prevTrickLenRef.current) {
      playCardSound();
    }

    if (
      state.phase === 'TRICK_COMPLETE' &&
      prevPhaseRef.current !== 'TRICK_COMPLETE'
    ) {
      playTrickWinSound();
    }

    if (
      (state.phase === 'ROUND_SUMMARY' || state.phase === 'MATCH_OVER') &&
      prevPhaseRef.current !== state.phase
    ) {
      playRoundSummarySound();
    }

    prevTrickLenRef.current = state.currentTrick.length;
    prevPhaseRef.current = state.phase;
    prevRoundRef.current = state.round;
    prevCallsCountRef.current = callsCount;
  }, [state]);

  useEffect(() => {
    if (chatMessages.length > prevChatLenRef.current) {
      playChatSound();
    }
    prevChatLenRef.current = chatMessages.length;
  }, [chatMessages.length]);

  // Clockwise 1-by-1 round-start shuffle & card distribution sequence
  // (skipped in jsdom tests or if local player already locked a call on reconnect)
  const lastChoreographedRoundRef = useRef<number>(0);
  const localAlreadyCalled =
    mySeatIndex !== null && state.seats[mySeatIndex]?.call !== null;

  useEffect(() => {
    if (state.phase !== 'BIDDING') {
      const resetT = window.setTimeout(() => {
        setDealStage('ready');
        setDealFlies([]);
        setRemainingDeckCount(20);
        setDealtCounts({ ...FULL_DEALT_COUNTS });
      }, 0);
      return () => window.clearTimeout(resetT);
    }

    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
    if (
      isJsdom ||
      localAlreadyCalled ||
      lastChoreographedRoundRef.current === state.round
    ) {
      return undefined;
    }

    lastChoreographedRoundRef.current = state.round;
    const timers: number[] = [];

    const measureDealVector = (
      pos: HubPosition,
      roundCardIdx: number,
    ): { dx: number; dy: number; rot: number } => {
      const fallback = DEAL_FALLBACK_VECTORS[pos];
      const root = tableRootRef.current;
      const deckEl = dealingDeckRef.current;
      if (!root || !deckEl) return fallback;

      const deckRect = deckEl.getBoundingClientRect();
      if (deckRect.width === 0) return fallback;
      const deckCx = deckRect.left + deckRect.width / 2;
      const deckCy = deckRect.top + deckRect.height / 2;

      if (pos === 'bottom-left') {
        const handCandidates = root.querySelectorAll('[data-testid="player-hand"]');
        for (const el of Array.from(handCandidates)) {
          const r = el.getBoundingClientRect();
          if (r.top > 0) {
            const fanSpread = (roundCardIdx - 2) * 34;
            const targetX = r.left + r.width / 2 + fanSpread;
            const targetY = r.top - 56;
            return {
              dx: Math.round(targetX - deckCx),
              dy: Math.round(targetY - deckCy),
              rot: (roundCardIdx - 2) * 5,
            };
          }
        }
        return fallback;
      }

      const seatCandidates = root.querySelectorAll(`[data-testid="seat-hub-${pos}"]`);
      for (const el of Array.from(seatCandidates)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) {
          const xFrac = pos === 'left' ? 0.72 : pos === 'right' ? 0.28 : 0.64;
          const yFrac = pos === 'top' ? 0.5 : pos === 'left' ? 0.56 : 0.44;
          const targetX = r.left + r.width * xFrac;
          const targetY = r.top + r.height * yFrac;
          return {
            dx: Math.round(targetX - deckCx),
            dy: Math.round(targetY - deckCy),
            rot: pos === 'left' ? -14 + roundCardIdx * 2 : pos === 'right' ? 14 - roundCardIdx * 2 : (roundCardIdx - 2) * 4,
          };
        }
      }
      return fallback;
    };

    timers.push(
      window.setTimeout(() => {
        setDealStage('shuffling');
        setDealFlies([]);
        setRemainingDeckCount(20);
        setDealtCounts({ ...ZERO_DEALT_COUNTS });
        playShuffleSound();
      }, 0),
    );

    timers.push(
      window.setTimeout(() => {
        setDealStage('dealing');
      }, 640),
    );

    // Deal 20 cards clockwise one-by-one (South -> West -> North -> East), 110ms apart
    for (let step = 0; step < 20; step += 1) {
      const pos = CLOCKWISE_DEAL_ORDER[step % 4];
      const roundCardCount = Math.floor(step / 4) + 1;
      const launchAt = 680 + step * 110;

      timers.push(
        window.setTimeout(() => {
          const vec = measureDealVector(pos, roundCardCount - 1);
          setRemainingDeckCount(19 - step);
          setDealFlies((prev) => [...prev.slice(-6), { step, pos, ...vec }]);
          playDealTickSound(step);
        }, launchAt),
      );

      // Increment the seat's hand count right as the flying card reaches it
      timers.push(
        window.setTimeout(() => {
          setDealtCounts((prev) => ({
            ...prev,
            [pos]: roundCardCount,
          }));
        }, launchAt + 300),
      );

      timers.push(
        window.setTimeout(() => {
          setDealFlies((prev) => prev.filter((item) => item.step !== step));
        }, launchAt + 420),
      );
    }

    // Breathing room after the 20th card lands before showing Call controls
    timers.push(
      window.setTimeout(() => {
        setDealFlies([]);
        setRemainingDeckCount(0);
        setDealStage('ready');
      }, 3420),
    );

    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [state.phase, state.round, localAlreadyCalled]);

  // Choreographed TRICK_COMPLETE sweep:
  // 0..1050ms: read all 4 cards + golden highlight on winner
  // 1050..2050ms: measure exact slot -> winner CapturedStack vectors and sweep all 4 cards into the stack
  // 2050ms+: winner's card stack updates & pops cleanly as the cards arrive
  useEffect(() => {
    if (state.phase !== 'TRICK_COMPLETE') {
      const resetT = window.setTimeout(() => {
        setSweepPhase('idle');
        setSweepVectors({});
      }, 0);
      return () => window.clearTimeout(resetT);
    }

    const tHighlight = window.setTimeout(() => {
      setSweepPhase('highlight');
      setSweepVectors({});
    }, 0);

    const tSweep = window.setTimeout(() => {
      const root = tableRootRef.current;
      const nextVectors: Partial<Record<HubPosition, SweepVector>> = {};

      if (root && state.lastTrickWinnerSeat !== null) {
        const stackEls = root.querySelectorAll(
          `[data-testid="captured-stack-${state.lastTrickWinnerSeat}"]`,
        );
        let targetEl: Element | null = null;
        for (const el of Array.from(stackEls)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            targetEl = el;
            break;
          }
        }

        if (targetEl) {
          const targetRect = targetEl.getBoundingClientRect();
          const targetCx = targetRect.left + targetRect.width / 2;
          const targetCy = targetRect.top + targetRect.height / 2;
          const isMobileCompact = targetRect.width < 36;

          const positions: HubPosition[] = ['top', 'left', 'right', 'bottom-left'];
          for (const pos of positions) {
            const desktopSlot = slotRefs.current[`d-${pos}`];
            const mobileSlot = slotRefs.current[`m-${pos}`];
            const dRect = desktopSlot?.getBoundingClientRect();
            const mRect = mobileSlot?.getBoundingClientRect();
            const activeRect =
              dRect && dRect.width > 0
                ? dRect
                : mRect && mRect.width > 0
                  ? mRect
                  : null;
            if (activeRect) {
              const slotCx = activeRect.left + activeRect.width / 2;
              const slotCy = activeRect.top + activeRect.height / 2;
              nextVectors[pos] = {
                dx: Math.round(targetCx - slotCx),
                dy: Math.round(targetCy - slotCy),
                rot:
                  pos === 'left'
                    ? -10
                    : pos === 'right'
                      ? 10
                      : pos === 'top'
                        ? 6
                        : -6,
                scale: isMobileCompact ? 0.36 : 0.48,
              };
            }
          }
        }
      }

      setSweepVectors(nextVectors);
      setSweepPhase('sweeping');
      playCardSound();
    }, 1050);

    const tLand = window.setTimeout(() => {
      setSweepPhase('landed');
    }, 2050);

    return () => {
      window.clearTimeout(tHighlight);
      window.clearTimeout(tSweep);
      window.clearTimeout(tLand);
    };
  }, [state.phase, state.trickNumber, state.round, state.lastTrickWinnerSeat]);

  const toggleSfx = () => {
    unlockAudio();
    const next = !sfxMuted;
    setSfxMuted(next);
    setSfxMutedState(next);
    if (!next) {
      playCallSound();
    }
  };

  const perspectiveSeat: SeatIndex = mySeatIndex ?? 0;

  const seatByPos = useMemo(() => {
    const south = perspectiveSeat;
    const west = getRelativeSeatIndex(perspectiveSeat, 1);
    const north = getRelativeSeatIndex(perspectiveSeat, 2);
    const east = getRelativeSeatIndex(perspectiveSeat, 3);
    return {
      'bottom-left': state.seats[south],
      left: state.seats[west],
      top: state.seats[north],
      right: state.seats[east],
    } as Record<HubPosition, GameState['seats'][number]>;
  }, [perspectiveSeat, state.seats]);

  const mySeat = state.seats[perspectiveSeat];
  const activeSeatObj = state.seats[state.activeSeat];
  const isDealingSequence =
    state.phase === 'BIDDING' && dealStage !== 'ready';
  const canPlaceCall =
    state.phase === 'BIDDING' &&
    dealStage === 'ready' &&
    mySeatIndex !== null &&
    mySeat.call === null;
  const isMyPlayTurn =
    state.phase === 'PLAYING' &&
    mySeatIndex !== null &&
    state.activeSeat === mySeatIndex;
  const isWaitingAutoPlayOne =
    state.phase === 'PLAYING' &&
    state.trickNumber === 1 &&
    state.currentTrick.length === 0 &&
    activeSeatObj.hand.includes(1);
  const isWaitingAutoPlayLast =
    state.phase === 'PLAYING' && activeSeatObj.hand.length === 1;
  const canClickHandCard =
    isMyPlayTurn && !isWaitingAutoPlayOne && !isWaitingAutoPlayLast;
  const calledCount = state.seats.filter((s) => s.call !== null).length;

  const isSeatActiveTurn = (seat: GameState['seats'][number]): boolean => {
    if (state.phase === 'BIDDING') {
      return !isDealingSequence && seat.type !== 'EMPTY' && seat.call === null;
    }
    if (state.phase === 'PLAYING') {
      return state.activeSeat === seat.seatIndex;
    }
    return false;
  };

  const trickWinnerPos: HubPosition | null = useMemo(() => {
    if (state.lastTrickWinnerSeat === null) return null;
    if (state.lastTrickWinnerSeat === seatByPos.top.seatIndex) return 'top';
    if (state.lastTrickWinnerSeat === seatByPos.left.seatIndex) return 'left';
    if (state.lastTrickWinnerSeat === seatByPos.right.seatIndex) return 'right';
    return 'bottom-left';
  }, [seatByPos, state.lastTrickWinnerSeat]);

  // Delay revealing the newly won points in the winner's stack until the sweeping cards actually land
  const getDisplayedStack = (seat: GameState['seats'][number]) => {
    const holdBack =
      state.phase === 'TRICK_COMPLETE' &&
      state.lastTrickWinnerSeat === seat.seatIndex &&
      (sweepPhase === 'idle' ||
        sweepPhase === 'highlight' ||
        sweepPhase === 'sweeping');
    if (holdBack) {
      return {
        points: Math.max(0, seat.capturedPoints - state.lastTrickPoints),
        tricks: Math.max(0, seat.tricksWon - 1),
      };
    }
    return {
      points: seat.capturedPoints,
      tricks: seat.tricksWon,
    };
  };

  const trickCardBySeat = useMemo(() => {
    const map = new Map<SeatIndex, CardValue>();
    for (const play of state.currentTrick) {
      map.set(play.seatIndex, play.card);
    }
    return map;
  }, [state.currentTrick]);

  const activeDirection: HubPosition = useMemo(() => {
    if (state.activeSeat === seatByPos.top.seatIndex) return 'top';
    if (state.activeSeat === seatByPos.left.seatIndex) return 'left';
    if (state.activeSeat === seatByPos.right.seatIndex) return 'right';
    return 'bottom-left';
  }, [seatByPos, state.activeSeat]);

  const latestRoundRecord =
    state.roundHistory.length > 0
      ? state.roundHistory[state.roundHistory.length - 1]
      : null;

  const matchRankings = useMemo(
    () =>
      state.roundHistory.length > 0 || state.phase === 'MATCH_OVER'
        ? getMatchRankings(state)
        : [],
    [state],
  );

  const rankBySeat = useMemo(() => {
    const map = new Map<SeatIndex, MatchRankingEntry>();
    for (const entry of matchRankings) {
      map.set(entry.seatIndex, entry);
    }
    return map;
  }, [matchRankings]);

  const rankedRoundEntries = useMemo(() => {
    if (!latestRoundRecord) return [];
    const entryBySeat = new Map(
      latestRoundRecord.entries.map((entry) => [entry.seatIndex, entry]),
    );
    const ordered =
      matchRankings.length > 0
        ? matchRankings
            .map((r) => {
              const roundEntry = entryBySeat.get(r.seatIndex);
              return roundEntry
                ? {
                    ...roundEntry,
                    rank: r.rank,
                    seat: state.seats[r.seatIndex],
                  }
                : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : latestRoundRecord.entries.map((entry, idx) => ({
            ...entry,
            rank: idx + 1,
            seat: state.seats[entry.seatIndex],
          }));
    return ordered;
  }, [latestRoundRecord, matchRankings, state.seats]);

  const remainingSeconds =
    remainingMs !== null ? Math.max(0, Math.ceil(remainingMs / 1000)) : null;
  const totalTurnMs =
    state.phase === 'BIDDING' ? BID_TIMEOUT_MS : PLAY_TIMEOUT_MS;
  const turnProgress =
    remainingMs !== null &&
    (state.phase === 'BIDDING' || state.phase === 'PLAYING')
      ? Math.max(0, Math.min(1, remainingMs / totalTurnMs))
      : null;
  const isTimerUrgent = remainingSeconds !== null && remainingSeconds <= 5;

  const isSeatSpeaking = (seatClientId: string | null): boolean => {
    if (!seatClientId) return false;
    return Boolean(speakingByClientId[seatClientId]);
  };

  const handleCopyInvite = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(state.roomCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      setCopiedInvite(false);
    }
  };

  const submitCall = (value: number) => {
    unlockAudio();
    if (mySeatIndex === null || !canPlaceCall) return;
    const clamped = Math.max(MIN_CALL, Math.min(MAX_CALL, value));
    onDispatchAction({
      type: 'PLACE_CALL',
      seatIndex: mySeatIndex,
      call: clamped,
    });
  };

  const handlePlayCard = (card: CardValue) => {
    unlockAudio();
    if (mySeatIndex === null || !canClickHandCard || state.phase !== 'PLAYING')
      return;
    onDispatchAction({
      type: 'PLAY_CARD',
      seatIndex: mySeatIndex,
      card,
    });
  };

  const renderPlaySlot = (
    slotName: 'North' | 'West' | 'East' | 'South',
    pos: HubPosition,
    compact = false,
  ) => {
    const seat = seatByPos[pos];
    const playedCard = trickCardBySeat.get(seat.seatIndex);
    const isWinner =
      state.phase === 'TRICK_COMPLETE' &&
      state.lastTrickWinnerSeat === seat.seatIndex;
    const isSweeping =
      state.phase === 'TRICK_COMPLETE' &&
      (sweepPhase === 'sweeping' || sweepPhase === 'landed') &&
      trickWinnerPos !== null;

    const flightClass =
      pos === 'top'
        ? 'animate-play-from-top'
        : pos === 'left'
          ? compact
            ? 'animate-play-mobile-left'
            : 'animate-play-from-left'
          : pos === 'right'
            ? compact
              ? 'animate-play-mobile-right'
              : 'animate-play-from-right'
            : compact
              ? 'animate-play-mobile-bottom'
              : 'animate-play-from-bottom';

    const measuredSweep = sweepVectors[pos];
    const fallbackSweepClass =
      trickWinnerPos === 'top'
        ? 'animate-sweep-to-top'
        : trickWinnerPos === 'left'
          ? 'animate-sweep-to-left'
          : trickWinnerPos === 'right'
            ? 'animate-sweep-to-right'
            : 'animate-sweep-to-bottom-left';
    const sweepClass = isSweeping
      ? measuredSweep
        ? 'animate-sweep-to-winner'
        : fallbackSweepClass
      : '';

    const sweepStyle: React.CSSProperties | undefined = isSweeping
      ? ({
          animationDelay: `${isWinner ? 180 : (seat.seatIndex % 3) * 60}ms`,
          ...(measuredSweep
            ? {
                '--sweep-dx': `${measuredSweep.dx}px`,
                '--sweep-dy': `${measuredSweep.dy}px`,
                '--sweep-rot': `${measuredSweep.rot}deg`,
                '--sweep-end-scale': String(measuredSweep.scale),
              }
            : {}),
        } as React.CSSProperties)
      : undefined;

    return (
      <div
        ref={(el) => {
          slotRefs.current[`${compact ? 'm' : 'd'}-${pos}`] = el;
        }}
        data-testid={
          compact ? undefined : `trick-slot-${slotName.toLowerCase()}`
        }
        aria-label={`${slotName} slot`}
        className={`relative flex items-center justify-center ${
          isWinner ? 'z-30' : 'z-20'
        } ${
          compact
            ? 'h-[68px] w-[50px] sm:h-[76px] sm:w-[56px]'
            : 'h-[106px] w-[76px] lg:h-[116px] lg:w-[84px]'
        }`}
      >
        {playedCard !== undefined && (
          <div className={sweepClass || flightClass} style={sweepStyle}>
            <div className={isWinner && !isSweeping ? 'animate-trick-win-glow' : ''}>
              <PlayingCard
                value={playedCard}
                orientation="portrait"
                size={compact ? 'sm' : 'md'}
                className={
                  compact
                    ? '!h-[64px] !w-[46px] !text-[24px] sm:!h-[72px] sm:!w-[52px] sm:!text-[26px]'
                    : '!h-[102px] !w-[74px] !text-[36px] lg:!h-[112px] lg:!w-[80px] lg:!text-[40px]'
                }
                useCustomScan={scanSet.has(playedCard)}
                highlighted={isWinner && !isSweeping}
                ariaLabel={`${localizeDisplayName(seat.username, lang)} played ${formatNum(playedCard, lang)}`}
              />
            </div>
          </div>
        )}
        {playedCard !== undefined &&
          isWinner &&
          state.phase === 'TRICK_COMPLETE' &&
          state.lastTrickPoints > 0 &&
          sweepPhase === 'highlight' && (
            <div
              aria-live="polite"
              className={`animate-float-pts pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#ffc857] bg-[#fff9e6] font-extrabold text-[#b86b00] shadow-md ${
                compact
                  ? '-top-3 px-2 py-0.5 text-[10.5px]'
                  : '-top-4 px-2.5 py-0.5 text-xs'
              }`}
            >
              ✨ +{formatNum(state.lastTrickPoints, lang)}
            </div>
          )}
      </div>
    );
  };

  const deckStackLayers =
    dealStage === 'shuffling'
      ? 3
      : Math.max(0, Math.ceil(remainingDeckCount / 5));

  const dealingOverlay = (
    <div
      ref={dealingDeckRef}
      aria-label={t.dealingCards}
      data-testid="dealing-deck"
      className="pointer-events-none relative flex h-32 w-32 items-center justify-center"
    >
      {/* Center 3D Riffle & Depleting Card Stack */}
      <div className="relative flex items-center justify-center">
        {dealStage === 'shuffling' ? (
          <>
            <div className="animate-riffle-left absolute">
              <PlayingCard faceDown size="sm" className="!h-[78px] !w-[54px]" />
            </div>
            <div className="animate-riffle-right">
              <PlayingCard faceDown size="sm" className="!h-[78px] !w-[54px]" />
            </div>
          </>
        ) : (
          deckStackLayers > 0 && (
            <div className="relative flex items-center justify-center transition-all duration-200">
              {Array.from({ length: deckStackLayers }).map((_, layerIdx) => (
                <div
                  key={layerIdx}
                  style={{
                    transform: `translate3d(${layerIdx * 1.5}px, ${-layerIdx * 2.5}px, 0)`,
                  }}
                  className={layerIdx === deckStackLayers - 1 ? 'relative' : 'absolute'}
                >
                  <PlayingCard faceDown size="sm" className="!h-[78px] !w-[54px]" />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Concurrent Clockwise Flying Deal Cards (South -> West -> North -> East) */}
      {dealStage === 'dealing' &&
        dealFlies.map((fly) => (
          <div
            key={fly.step}
            style={
              {
                '--deal-dx': `${fly.dx}px`,
                '--deal-dy': `${fly.dy}px`,
                '--deal-rot': `${fly.rot}deg`,
                zIndex: 40 + (fly.step % 6),
              } as React.CSSProperties
            }
            className="animate-deal-fly absolute"
          >
            <PlayingCard faceDown size="xs" className="!h-[58px] !w-[40px]" />
          </div>
        ))}

      <span className="glass-pill absolute -bottom-7 whitespace-nowrap rounded-full px-3 py-0.5 text-[11px] font-bold text-[#7d5a58]">
        {t.dealingCards}
      </span>
    </div>
  );

  const visibleLocalHand = isDealingSequence
    ? mySeat.hand.slice(0, dealtCounts['bottom-left'])
    : mySeat.hand;

  const activeTurnHint =
    state.phase === 'PLAYING' && canClickHandCard ? t.yourTurnTap : null;

  const turnRing = (compact = false) => (
    <div
      aria-label={`Active turn: ${localizeDisplayName(activeSeatObj.username, lang)}`}
      data-testid={compact ? undefined : 'turn-compass'}
      className={`relative flex items-center justify-center rounded-full border-2 border-[#fff8f2] bg-[#fffaf5]/85 shadow-sm ${
        compact ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-14 w-14 lg:h-16 lg:w-16'
      }`}
    >
      <ArrowUp
        className={`absolute top-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'top'
            ? 'scale-115 text-[#f25c84]'
            : 'text-[#d4b0b8]/55'
        }`}
      />
      <ArrowLeft
        className={`absolute left-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'left'
            ? 'scale-115 text-[#f25c84]'
            : 'text-[#d4b0b8]/55'
        }`}
      />
      <ArrowRight
        className={`absolute right-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'right'
            ? 'scale-115 text-[#f25c84]'
            : 'text-[#d4b0b8]/55'
        }`}
      />
      <ArrowDown
        className={`absolute bottom-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'bottom-left'
            ? 'scale-115 text-[#f25c84]'
            : 'text-[#d4b0b8]/55'
        }`}
      />
      <span className="h-2 w-2 rounded-full bg-[#ffc857] ring-2 ring-[#fff8f0]" />
    </div>
  );

  const biddingCard = (
    <div
      data-testid="bidding-tray"
      className="glass-pill animate-panel-enter w-full max-w-[360px] rounded-[28px] border-2 border-[#f7c0ce] p-4 text-center shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-extrabold tracking-wide text-[#d94f72] sm:text-sm">
        <span className="mx-auto">
          {canPlaceCall
            ? t.declareCall
            : mySeat.call !== null
              ? t.callLocked(mySeat.call)
              : t.simultaneousCall}
        </span>
      </div>

      {canPlaceCall ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_CALL_VALUES.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => submitCall(val)}
                data-testid={`quick-call-${val}`}
                className={`rounded-2xl border-2 py-1.5 text-xs font-extrabold transition active:scale-95 sm:text-sm ${
                  selectedCall === val
                    ? 'border-[#ff7597] bg-[#ff7597] text-white shadow-[0_2px_0_#d94f72]'
                    : 'border-[#f5d0da] bg-white text-[#5c3d3a] hover:border-[#ff8fab] hover:bg-[#fff0f4] hover:text-[#d94f72]'
                }`}
              >
                {formatNum(val, lang)}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-2xl border border-[#f5d4dc] bg-[#fff7f3] px-3 py-2.5">
            <input
              type="range"
              min={MIN_CALL}
              max={MAX_CALL}
              step={CALL_STEP}
              value={selectedCall}
              onChange={(e) => setSelectedCall(Number(e.target.value))}
              aria-label={t.declareCall}
              className="w-full accent-[#ff7597]"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedCall((c) => Math.max(MIN_CALL, c - CALL_STEP))
                }
                aria-label="Decrease call by 10"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#f3c6d1] bg-white text-[#d94f72] transition hover:bg-[#fff0f4] active:scale-95"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <span className="text-lg font-extrabold tabular-nums text-[#4a2e2b]">
                {formatNum(selectedCall, lang)}
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedCall((c) => Math.min(MAX_CALL, c + CALL_STEP))
                }
                aria-label="Increase call by 10"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#f3c6d1] bg-white text-[#d94f72] transition hover:bg-[#fff0f4] active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => submitCall(selectedCall)}
                data-testid="submit-custom-call"
                className="ml-1 flex-1 rounded-xl bg-[#ff7597] px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[1px] active:shadow-[0_1px_0_#d94f72] sm:text-sm"
              >
                {t.confirmCall}
              </button>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-[#8c6460]">
            {t.allCallingCount(calledCount)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[#8c6460]">
          {t.waitingCallsCount(calledCount)}
        </p>
      )}
    </div>
  );

  return (
    <div
      ref={tableRootRef}
      data-testid="game-table-root"
      data-rain-paused={lowDataMode ? 'true' : 'false'}
      data-phase={state.phase}
      onPointerDown={() => unlockAudio()}
      className="bg-tabletop-photo fixed inset-0 flex h-dvh w-full flex-col overflow-hidden select-none"
    >
      {/* Subtle pastel rain streaks along edges */}
      <div
        aria-hidden="true"
        data-testid="rain-overlay"
        data-rain-paused={lowDataMode ? 'true' : 'false'}
        className={`rain-overlay absolute inset-0 ${
          !rainEnabled ? 'rain-hidden' : ''
        } ${lowDataMode ? 'rain-paused' : ''}`}
      />

      {/* TOP HEADER BAR */}
      <header className="relative z-30 flex shrink-0 items-center justify-between gap-1 px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5 md:px-6 md:py-3">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:gap-4">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <BrandMark
              size={36}
              className="h-7 w-7 shrink-0 drop-shadow-[0_2px_4px_rgba(216,53,99,0.2)] sm:h-8 sm:w-8 md:h-9 md:w-9"
            />
            <div className="flex shrink-0 flex-col leading-none">
              <h1 className="font-bangla text-lg font-extrabold tracking-tight text-[#4a2e2b] sm:text-xl md:text-3xl">
                হানডেট
              </h1>
              <span className="text-[9px] font-extrabold tracking-[0.16em] text-[#f25c84] sm:text-[10px] md:text-xs">
                HUNDRED
              </span>
            </div>
          </div>

          <span
            data-testid="arena-status-pill"
            className="glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[#4a2e2b] sm:px-3 sm:py-1 sm:text-[11px] md:px-3.5 md:py-1.5 md:text-xs"
          >
            {t.roundPill(state.round, TOTAL_ROUNDS)}
          </span>

          {remainingSeconds !== null &&
            (state.phase === 'BIDDING' || state.phase === 'PLAYING') && (
              <span data-testid="shot-clock" className="sr-only">
                {remainingSeconds}s
              </span>
            )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
          {onToggleLang && (
            <button
              type="button"
              onClick={onToggleLang}
              data-testid="lang-toggle-btn"
              aria-label={t.toggleLangLabel}
              className="glass-pill inline-flex h-7 items-center justify-center rounded-full px-2.5 text-[11px] font-extrabold text-[#6e3f45] transition hover:border-[#ff8fab] hover:text-[#d94f72] sm:h-8 sm:px-3 sm:text-xs md:h-9"
            >
              <span>{t.toggleLangText}</span>
            </button>
          )}

          {/* Tactile Audio SFX Toggle */}
          <button
            type="button"
            onClick={toggleSfx}
            aria-label={sfxMuted ? t.unmuteSfxLabel : t.muteSfxLabel}
            title={sfxMuted ? t.soundOff : t.soundOn}
            data-testid="sfx-toggle-btn"
            className="glass-pill inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7d5a58] transition hover:text-[#f25c84] sm:h-8 sm:w-8 md:h-9 md:w-9"
          >
            {sfxMuted ? (
              <VolumeX className="h-3.5 w-3.5 opacity-60 md:h-4 md:w-4" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-[#f25c84] md:h-4 md:w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setScoreboardOpen(true)}
            data-testid="scoreboard-btn"
            className="glass-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-bangla text-[11px] font-bold text-[#4a2e2b] transition hover:border-[#ff8fab] hover:text-[#d94f72] sm:px-3 sm:py-1.5 sm:text-xs md:px-4 md:text-sm"
          >
            <span>{t.scoreboardBtn}</span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="leave-room-btn"
            title={t.leaveRoomLabel}
            aria-label={t.leaveRoomLabel}
            className="glass-pill inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7d5a58] transition hover:border-[#f25c84] hover:text-[#d94f72] sm:h-8 sm:w-8 md:h-9 md:w-9"
          >
            <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {isDesktop ? (
        /* ================================================================
           DESKTOP TABLETOP (>= 768px)
           ================================================================ */
        <div className="relative flex-1 px-6 pb-4">
          {/* Warm Woven Terracotta & Mustard Bangladeshi Pati Mat */}
          <div className="pati-inner-mat pointer-events-none absolute inset-x-16 inset-y-4 rounded-3xl" />

          {/* Handcrafted Pure-SVG Hurricane Lantern (Kupibati) in Top-Right Corner */}
          <div className="pointer-events-none absolute right-20 top-5 z-10 hidden lg:block">
            <KupibatiLantern paused={lowDataMode} />
          </div>

          {/* Top Center Seat */}
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
            {(() => {
              const stack = getDisplayedStack(seatByPos.top);
              return (
                <SeatHub
                  seat={seatByPos.top}
                  position="top"
                  isMe={mySeatIndex === seatByPos.top.seatIndex}
                  isHost={hostSeatIndex === seatByPos.top.seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos.top)}
                  isSpeaking={isSeatSpeaking(seatByPos.top.clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={
                    state.phase === 'BIDDING' &&
                    mySeatIndex !== seatByPos.top.seatIndex
                  }
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  visibleHandCount={
                    isDealingSequence ? dealtCounts.top : undefined
                  }
                  rank={rankBySeat.get(seatByPos.top.seatIndex)?.rank ?? null}
                  lang={lang}
                />
              );
            })()}
          </div>

          {/* Left Center Seat */}
          <div className="absolute left-6 top-[44%] z-20 -translate-y-1/2">
            {(() => {
              const stack = getDisplayedStack(seatByPos.left);
              return (
                <SeatHub
                  seat={seatByPos.left}
                  position="left"
                  isMe={mySeatIndex === seatByPos.left.seatIndex}
                  isHost={hostSeatIndex === seatByPos.left.seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos.left)}
                  isSpeaking={isSeatSpeaking(seatByPos.left.clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={
                    state.phase === 'BIDDING' &&
                    mySeatIndex !== seatByPos.left.seatIndex
                  }
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  visibleHandCount={
                    isDealingSequence ? dealtCounts.left : undefined
                  }
                  rank={rankBySeat.get(seatByPos.left.seatIndex)?.rank ?? null}
                  lang={lang}
                />
              );
            })()}
          </div>

          {/* Right Center Seat */}
          <div className="absolute right-6 top-[44%] z-20 -translate-y-1/2">
            {(() => {
              const stack = getDisplayedStack(seatByPos.right);
              return (
                <SeatHub
                  seat={seatByPos.right}
                  position="right"
                  isMe={mySeatIndex === seatByPos.right.seatIndex}
                  isHost={hostSeatIndex === seatByPos.right.seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos.right)}
                  isSpeaking={isSeatSpeaking(seatByPos.right.clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={
                    state.phase === 'BIDDING' &&
                    mySeatIndex !== seatByPos.right.seatIndex
                  }
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  visibleHandCount={
                    isDealingSequence ? dealtCounts.right : undefined
                  }
                  rank={rankBySeat.get(seatByPos.right.seatIndex)?.rank ?? null}
                  lang={lang}
                />
              );
            })()}
          </div>

          {/* Bottom-Left Seat (Me) */}
          <div className="absolute bottom-4 left-6 z-20">
            {(() => {
              const stack = getDisplayedStack(seatByPos['bottom-left']);
              return (
                <SeatHub
                  seat={seatByPos['bottom-left']}
                  position="bottom-left"
                  isMe={mySeatIndex === seatByPos['bottom-left'].seatIndex}
                  isHost={hostSeatIndex === seatByPos['bottom-left'].seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos['bottom-left'])}
                  isSpeaking={isSeatSpeaking(seatByPos['bottom-left'].clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={false}
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  rank={
                    rankBySeat.get(seatByPos['bottom-left'].seatIndex)?.rank ??
                    null
                  }
                  lang={lang}
                />
              );
            })()}
          </div>

          {/* Center Play Zone */}
          <section
            aria-label="Center Play Zone"
            data-testid="center-trick-arena"
            className="pointer-events-none absolute left-1/2 top-[45%] z-30 -translate-x-1/2 -translate-y-1/2"
          >
            {isDealingSequence ? (
              dealingOverlay
            ) : state.phase === 'BIDDING' ? (
              <div className="pointer-events-auto">{biddingCard}</div>
            ) : (
              <div className="relative">
                <div className="grid grid-cols-[auto_auto_auto] grid-rows-[auto_auto_auto] items-center justify-items-center gap-x-4 gap-y-2.5">
                  <div />
                  {renderPlaySlot('North', 'top')}
                  <div />

                  {renderPlaySlot('West', 'left')}
                  {turnRing(false)}
                  {renderPlaySlot('East', 'right')}

                  <div />
                  {renderPlaySlot('South', 'bottom-left')}
                  <div />
                </div>
              </div>
            )}
          </section>

          {/* Subtle Calm Active-Turn Cue above Hand (Fixed Overlay — zero layout shift) */}
          {activeTurnHint && (
            <div
              data-testid="active-turn-hint"
              className="pointer-events-none absolute bottom-[188px] left-1/2 z-20 -translate-x-1/2 lg:bottom-[204px]"
            >
              <span className="glass-pill whitespace-nowrap rounded-full !border-[#ff8fab] !bg-[#fff5f7] px-3.5 py-1 text-[11px] font-bold tracking-wide text-[#c73e65]">
                {activeTurnHint}
              </span>
            </div>
          )}

          {/* Bottom-Center Fanned Local Hand */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-nowrap items-end justify-center"
          >
            {visibleLocalHand.map((card, idx) => {
              const count = visibleLocalHand.length;
              const center = (count - 1) / 2;
              const offset = idx - center;
              const rot = offset * 4.8;
              const yOffset = Math.abs(offset) * Math.abs(offset) * 4.5;

              return (
                <div
                  key={card}
                  style={{
                    transform: `rotate(${rot}deg) translateY(${yOffset}px)`,
                    marginLeft: idx === 0 ? 0 : -14,
                    zIndex: 10 + idx,
                  }}
                  className="pointer-events-auto origin-bottom transition-all duration-300 ease-out hover:z-40"
                >
                  <div className="animate-deal-fan-in">
                    <PlayingCard
                      value={card}
                      orientation="portrait"
                      size="hand"
                      useCustomScan={scanSet.has(card)}
                      playable={canClickHandCard}
                      disabled={!canClickHandCard}
                      onClick={() => handlePlayCard(card)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom-Right Compact Dock */}
          <div className="absolute bottom-4 right-6 z-30">
            <VoiceBar
              compact
              roomCode={state.roomCode}
              username={username}
              clientId={clientId}
              isLiveKitConfigured={isLiveKitConfigured}
              lowDataMode={lowDataMode}
              onToggleLowDataMode={onToggleLowDataMode}
              rainEnabled={rainEnabled}
              onToggleRain={onToggleRain}
              chatMessages={chatMessages}
              onSendChat={onSendChat}
              onSpeakingMapChange={onSpeakingMapChange}
              onCopyRoomCode={() => void handleCopyInvite()}
              copiedRoom={copiedInvite}
              lang={lang}
            />
          </div>
        </div>
      ) : (
        /* ================================================================
           TRUE 4-EDGE MOBILE CARD TABLE LAYOUT (< 768px)
           ================================================================ */
        <div className="relative z-10 flex flex-1 flex-col justify-between overflow-hidden px-2 pb-2">
          {/* NORTH SEAT (Top Center) */}
          <div className="flex shrink-0 justify-center py-0.5">
            {(() => {
              const stack = getDisplayedStack(seatByPos.top);
              return (
                <SeatHub
                  compactMobile
                  seat={seatByPos.top}
                  position="top"
                  isMe={mySeatIndex === seatByPos.top.seatIndex}
                  isHost={hostSeatIndex === seatByPos.top.seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos.top)}
                  isSpeaking={isSeatSpeaking(seatByPos.top.clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={
                    state.phase === 'BIDDING' &&
                    mySeatIndex !== seatByPos.top.seatIndex
                  }
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  visibleHandCount={
                    isDealingSequence ? dealtCounts.top : undefined
                  }
                  rank={rankBySeat.get(seatByPos.top.seatIndex)?.rank ?? null}
                  lang={lang}
                />
              );
            })()}
          </div>

          {/* MIDDLE 3-COLUMN TABLE: WEST EDGE — CENTER ARENA — EAST EDGE */}
          <div className="pati-inner-mat relative my-1.5 grid flex-1 grid-cols-[62px_minmax(0,1fr)_62px] items-center rounded-2xl px-1 sm:grid-cols-[68px_minmax(0,1fr)_68px]">
            {/* WEST SEAT (Far Left Edge) */}
            <div className="flex justify-start">
              {(() => {
                const stack = getDisplayedStack(seatByPos.left);
                return (
                  <SeatHub
                    compactMobile
                    seat={seatByPos.left}
                    position="left"
                    isMe={mySeatIndex === seatByPos.left.seatIndex}
                    isHost={hostSeatIndex === seatByPos.left.seatIndex}
                    isActiveTurn={isSeatActiveTurn(seatByPos.left)}
                    isSpeaking={isSeatSpeaking(seatByPos.left.clientId)}
                    turnProgress={turnProgress}
                    isTimerUrgent={isTimerUrgent}
                    maskCall={
                      state.phase === 'BIDDING' &&
                      mySeatIndex !== seatByPos.left.seatIndex
                    }
                    displayedCapturedPoints={stack.points}
                    displayedTricksWon={stack.tricks}
                    visibleHandCount={
                      isDealingSequence ? dealtCounts.left : undefined
                    }
                    rank={rankBySeat.get(seatByPos.left.seatIndex)?.rank ?? null}
                    lang={lang}
                  />
                );
              })()}
            </div>

            {/* CENTER 4-CARD PORTRAIT CROSS */}
            <section
              aria-label="Center Play Zone"
              data-testid="center-trick-arena"
              className="pointer-events-none relative z-30 flex items-center justify-center"
            >
              {isDealingSequence ? (
                dealingOverlay
              ) : (
                <div className="relative">
                  <div className="grid grid-cols-[auto_auto_auto] grid-rows-[auto_auto_auto] items-center justify-items-center gap-1 sm:gap-1.5">
                    <div />
                    {renderPlaySlot('North', 'top', true)}
                    <div />

                    {renderPlaySlot('West', 'left', true)}
                    {turnRing(true)}
                    {renderPlaySlot('East', 'right', true)}

                    <div />
                    {renderPlaySlot('South', 'bottom-left', true)}
                    <div />
                  </div>
                </div>
              )}
            </section>

            {/* EAST SEAT (Far Right Edge) */}
            <div className="flex justify-end">
              {(() => {
                const stack = getDisplayedStack(seatByPos.right);
                return (
                  <SeatHub
                    compactMobile
                    seat={seatByPos.right}
                    position="right"
                    isMe={mySeatIndex === seatByPos.right.seatIndex}
                    isHost={hostSeatIndex === seatByPos.right.seatIndex}
                    isActiveTurn={isSeatActiveTurn(seatByPos.right)}
                    isSpeaking={isSeatSpeaking(seatByPos.right.clientId)}
                    turnProgress={turnProgress}
                    isTimerUrgent={isTimerUrgent}
                    maskCall={
                      state.phase === 'BIDDING' &&
                      mySeatIndex !== seatByPos.right.seatIndex
                    }
                    displayedCapturedPoints={stack.points}
                    displayedTricksWon={stack.tricks}
                    visibleHandCount={
                      isDealingSequence ? dealtCounts.right : undefined
                    }
                    rank={rankBySeat.get(seatByPos.right.seatIndex)?.rank ?? null}
                    lang={lang}
                  />
                );
              })()}
            </div>

            {/* Mobile Non-Shifting Turn Pill anchored inside mat bottom */}
            {activeTurnHint && (
              <div
                data-testid="active-turn-hint"
                className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2"
              >
                <span className="glass-pill whitespace-nowrap rounded-full !border-[#ff8fab] !bg-[#fff5f7]/95 px-3 py-0.5 text-[11px] font-bold text-[#c73e65] shadow-sm">
                  {activeTurnHint}
                </span>
              </div>
            )}

            {/* Mobile Transient Bidding Overlay (appears AFTER deal settles) */}
            {state.phase === 'BIDDING' && !isDealingSequence && (
              <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-[#4a2e2b]/25 p-3 backdrop-blur-[2px]">
                {biddingCard}
              </div>
            )}
          </div>

          {/* BOTTOM CONTROL STRIP: Local Player (Left) + Ultra-Slim Dock (Right) */}
          <div className="flex shrink-0 items-center justify-between gap-2 px-0.5 py-1">
            {(() => {
              const stack = getDisplayedStack(seatByPos['bottom-left']);
              return (
                <SeatHub
                  compactMobile
                  seat={seatByPos['bottom-left']}
                  position="bottom-left"
                  isMe={mySeatIndex === seatByPos['bottom-left'].seatIndex}
                  isHost={hostSeatIndex === seatByPos['bottom-left'].seatIndex}
                  isActiveTurn={isSeatActiveTurn(seatByPos['bottom-left'])}
                  isSpeaking={isSeatSpeaking(seatByPos['bottom-left'].clientId)}
                  turnProgress={turnProgress}
                  isTimerUrgent={isTimerUrgent}
                  maskCall={false}
                  displayedCapturedPoints={stack.points}
                  displayedTricksWon={stack.tricks}
                  rank={
                    rankBySeat.get(seatByPos['bottom-left'].seatIndex)?.rank ??
                    null
                  }
                  lang={lang}
                />
              );
            })()}

            <VoiceBar
              compact
              roomCode={state.roomCode}
              username={username}
              clientId={clientId}
              isLiveKitConfigured={isLiveKitConfigured}
              lowDataMode={lowDataMode}
              onToggleLowDataMode={onToggleLowDataMode}
              rainEnabled={rainEnabled}
              onToggleRain={onToggleRain}
              chatMessages={chatMessages}
              onSendChat={onSendChat}
              onSpeakingMapChange={onSpeakingMapChange}
              onCopyRoomCode={() => void handleCopyInvite()}
              copiedRoom={copiedInvite}
              lang={lang}
            />
          </div>

          {/* BOTTOM HAND: Large Thumb-Friendly Fanned Visiting Cards (Fixed height prevents jank when last card leaves) */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className="flex h-[106px] shrink-0 flex-nowrap items-end justify-center pb-1 pt-1.5"
          >
            {visibleLocalHand.map((card, idx) => {
              const count = visibleLocalHand.length;
              const center = (count - 1) / 2;
              const offset = idx - center;
              const rot = offset * 4;
              const yOffset = Math.abs(offset) * Math.abs(offset) * 2.5;

              return (
                <div
                  key={card}
                  style={{
                    transform: `rotate(${rot}deg) translateY(${yOffset}px)`,
                    marginLeft: idx === 0 ? 0 : -10,
                    zIndex: 10 + idx,
                  }}
                  className="origin-bottom transition-all duration-300 ease-out"
                >
                  <div className="animate-deal-fan-in">
                    <PlayingCard
                      value={card}
                      orientation="portrait"
                      size="sm"
                      className="!h-[96px] !w-[66px] !text-[34px]"
                      useCustomScan={scanSet.has(card)}
                      playable={canClickHandCard}
                      disabled={!canClickHandCard}
                      onClick={() => handlePlayCard(card)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ROUND SUMMARY MODAL */}
      {state.phase === 'ROUND_SUMMARY' && latestRoundRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.roundSummaryTitle(
            latestRoundRecord.round,
            TOTAL_ROUNDS,
          )}
          data-testid="round-summary-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#4a2e2b]/35 p-3 backdrop-blur-sm sm:p-4"
        >
          <div className="glass-pill animate-panel-enter w-full max-w-xl rounded-[30px] border-2 border-[#f7c0ce] p-4 text-[#4a2e2b] shadow-2xl sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bangla text-lg font-extrabold text-[#d94f72] sm:text-xl">
                {t.roundSummaryTitle(latestRoundRecord.round, TOTAL_ROUNDS)}
              </h2>
              <button
                type="button"
                onClick={() => setScoreboardOpen(true)}
                className="rounded-full border-2 border-[#ffccd8] bg-[#fff0f4] px-3.5 py-1 font-bangla text-xs font-bold text-[#c73e65] transition hover:bg-[#ff7597] hover:text-white"
              >
                {t.fullScoreboard}
              </button>
            </div>

            {rankedRoundEntries.length > 0 && (() => {
              const tiedFirst = rankedRoundEntries.filter((e) => e.rank === 1);
              const leader = rankedRoundEntries[0];
              const leaderLabel =
                tiedFirst.length > 1
                  ? tiedFirst
                      .map((e) => localizeDisplayName(e.username, lang))
                      .join(' • ')
                  : localizeDisplayName(leader.username, lang);
              return (
                <div
                  data-testid="round-summary-leader-banner"
                  className="mb-3 flex items-center justify-between gap-2.5 rounded-2xl border-2 border-[#ffc857] bg-gradient-to-r from-[#fff8dd] to-[#fff1be] px-3 py-2 shadow-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {leader.seat && (
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-xs">
                        <SeatAvatarGraphic seat={leader.seat} size={36} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RankBadge
                          rank={1}
                          variant="pill"
                          lang={lang}
                          testId="round-summary-leader-badge"
                        />
                        <span className="text-[11px] font-bold text-[#8a5808]">
                          {tiedFirst.length > 1 ? t.tiedFirstNow : t.leadingNow}
                        </span>
                      </div>
                      <p className="truncate text-sm font-extrabold text-[#4a2e2b]">
                        {leaderLabel}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`text-sm font-black sm:text-base ${
                        leader.totalAfter < 0
                          ? 'text-[#d94f72]'
                          : 'text-[#b45309]'
                      }`}
                    >
                      {formatNum(leader.totalAfter, lang)} {t.ptsUnit}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="overflow-x-auto rounded-2xl border border-[#f5d4dc] bg-white px-2 py-1 sm:px-3">
              <table className="w-full text-left text-[11px] sm:text-sm">
                <thead>
                  <tr className="border-b border-[#f5d8df] text-[#8c6460]">
                    <th className="py-1.5 pr-1 sm:py-2 sm:pr-1.5">{t.rankCol}</th>
                    <th className="py-1.5 pr-1 sm:py-2 sm:pr-2">{t.colPlayer}</th>
                    <th className="px-1 py-1.5 text-right sm:px-1.5 sm:py-2">{t.colCall}</th>
                    <th className="px-1 py-1.5 text-right sm:px-1.5 sm:py-2">{t.colWon}</th>
                    <th className="px-1 py-1.5 text-right sm:px-1.5 sm:py-2">{t.colDelta}</th>
                    <th className="py-1.5 pl-1 text-right sm:py-2 sm:pl-1.5">{t.colScore}</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedRoundEntries.map((entry) => {
                    const hit = entry.capturedPoints >= entry.call;
                    const deltaLabel =
                      entry.pointsAwarded >= 0
                        ? `+${formatNum(entry.pointsAwarded, lang)}`
                        : formatNum(entry.pointsAwarded, lang);
                    const isEntryMe =
                      mySeatIndex !== null && entry.seatIndex === mySeatIndex;
                    const visual = getRankVisualConfig(entry.rank);
                    return (
                      <tr
                        key={entry.seatIndex}
                        data-testid={`round-summary-row-${entry.seatIndex}`}
                        data-rank={entry.rank}
                        className={`border-b border-[#faeaee] last:border-b-0 ${visual.rowHighlightClasses}`}
                      >
                        <td className="whitespace-nowrap py-1.5 pr-1 sm:py-2 sm:pr-1.5">
                          <RankBadge
                            rank={entry.rank}
                            variant="compact"
                            lang={lang}
                            testId={`round-summary-rank-badge-${entry.seatIndex}`}
                          />
                        </td>
                        <td className="py-1.5 pr-1 font-bold text-[#4a2e2b] sm:py-2 sm:pr-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {entry.seat && (
                              <div className="hidden h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[#f5d4dc] sm:block">
                                <SeatAvatarGraphic
                                  seat={entry.seat}
                                  size={24}
                                />
                              </div>
                            )}
                            <span className="max-w-[78px] truncate sm:max-w-[140px]">
                              {localizeDisplayName(entry.username, lang)}
                              {isEntryMe ? t.meTag : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-right font-semibold text-[#c47d10] sm:px-1.5 sm:py-2">
                          {formatNum(entry.call, lang)}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-extrabold sm:px-1.5 sm:py-2 ${
                            hit ? 'text-[#289664]' : 'text-[#d94f72]'
                          }`}
                        >
                          {formatNum(entry.capturedPoints, lang)}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-right font-extrabold sm:px-1.5 sm:py-2 ${
                            entry.pointsAwarded >= 0
                              ? 'text-[#289664]'
                              : 'text-[#d94f72]'
                          }`}
                        >
                          {deltaLabel}
                        </td>
                        <td
                          className={`py-1.5 pl-1 text-right font-black sm:py-2 sm:pl-1.5 ${
                            entry.totalAfter < 0
                              ? 'text-[#d94f72]'
                              : 'text-[#4a2e2b]'
                          }`}
                        >
                          {formatNum(entry.totalAfter, lang)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end sm:mt-5">
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'NEXT_ROUND' })}
                data-testid="next-round-btn"
                className="rounded-2xl bg-[#ff7597] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[2px] active:shadow-[0_2px_0_#d94f72]"
              >
                {state.round >= TOTAL_ROUNDS
                  ? t.viewPodium
                  : t.nextRound(state.round + 1)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATCH OVER PODIUM MODAL */}
      {state.phase === 'MATCH_OVER' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.viewPodium}
          data-testid="match-over-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#4a2e2b]/35 p-4 backdrop-blur-sm"
        >
          <div className="glass-pill animate-panel-enter w-full max-w-lg rounded-[32px] border-2 border-[#ffc857] p-6 text-[#4a2e2b] shadow-2xl">
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-[#fff3cc] ring-4 ring-[#ffe8a3]/60">
                <Trophy className="h-8 w-8 text-[#e69500]" />
              </div>
              <h2 className="font-bangla text-2xl font-extrabold text-[#4a2e2b]">
                হানডেট <span className="text-[#f25c84]">HUNDRED</span>
              </h2>
              {matchRankings[0] && (
                <p className="mt-1.5 text-sm font-semibold text-[#7d5a58]">
                  {t.winnerLabel}{' '}
                  <strong className="text-[#d94f72]">
                    {localizeDisplayName(matchRankings[0].username, lang)}
                  </strong>{' '}
                  — {formatNum(matchRankings[0].totalScore, lang)} {t.ptsUnit}
                </p>
              )}
            </div>

            <ol className="space-y-2">
              {matchRankings.map((entry) => {
                const seatObj = state.seats[entry.seatIndex];
                const isEntryMe =
                  mySeatIndex !== null && entry.seatIndex === mySeatIndex;
                return (
                  <li
                    key={entry.seatIndex}
                    data-testid={`match-over-row-${entry.seatIndex}`}
                    data-rank={entry.rank}
                    className={`flex items-center justify-between rounded-2xl border-2 px-3.5 py-2.5 text-sm ${
                      entry.rank === 1
                        ? 'border-[#ffc857] bg-[#fff8e0]'
                        : 'border-[#f4d4dc] bg-white'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <RankBadge
                        rank={entry.rank}
                        variant="pill"
                        lang={lang}
                        testId={`match-over-rank-badge-${entry.seatIndex}`}
                      />
                      {seatObj && (
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#f5d4dc]">
                          <SeatAvatarGraphic seat={seatObj} size={32} />
                        </div>
                      )}
                      <span className="truncate font-bold text-[#4a2e2b]">
                        {localizeDisplayName(entry.username, lang)}
                        {isEntryMe ? t.meTag : ''}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-extrabold ${
                        entry.totalScore < 0
                          ? 'text-[#d94f72]'
                          : 'text-[#289664]'
                      }`}
                    >
                      {formatNum(entry.totalScore, lang)} {t.ptsUnit}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="rounded-2xl border-2 border-[#f2c4cf] bg-white px-4 py-2 text-sm font-bold text-[#6e4946] transition hover:bg-[#fff0ec]"
              >
                {t.backToLobby}
              </button>
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'PLAY_AGAIN' })}
                data-testid="play-again-btn"
                className="inline-flex items-center gap-1.5 rounded-2xl bg-[#ff7597] px-5 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[2px] active:shadow-[0_2px_0_#d94f72]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{t.playAgain}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEPARATE FULLSCREEN SCOREBOARD SCREEN */}
      {scoreboardOpen && (
        <ScoreboardModal
          state={state}
          mySeatIndex={mySeatIndex}
          onClose={() => setScoreboardOpen(false)}
          lang={lang}
        />
      )}
    </div>
  );
}

export default GameTable;
