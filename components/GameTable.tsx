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
import { PlayingCard } from '@/components/PlayingCard';
import { ScoreboardModal } from '@/components/ScoreboardModal';
import { SeatHub, type HubPosition } from '@/components/SeatHub';
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
  isSfxMuted,
  playCallSound,
  playCardSound,
  playChatSound,
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
}: GameTableProps) {
  const [selectedCall, setSelectedCall] = useState<number>(100);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [dealStage, setDealStage] = useState<'shuffling' | 'dealing' | 'ready'>(
    'ready',
  );
  const [dealtCardCount, setDealtCardCount] = useState<number>(5);
  const [sweepPhase, setSweepPhase] = useState<
    'idle' | 'highlight' | 'sweeping' | 'landed'
  >('idle');
  const [sfxMuted, setSfxMutedState] = useState<boolean>(() => isSfxMuted());

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

  // Restful choreographed round-start shuffle & card distribution sequence
  // (skipped in jsdom tests or if local player already locked a call on reconnect)
  const lastChoreographedRoundRef = useRef<number>(0);
  const localAlreadyCalled =
    mySeatIndex !== null && state.seats[mySeatIndex]?.call !== null;

  useEffect(() => {
    if (state.phase !== 'BIDDING') {
      const resetT = window.setTimeout(() => {
        setDealStage('ready');
        setDealtCardCount(5);
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

    timers.push(
      window.setTimeout(() => {
        setDealStage('shuffling');
        setDealtCardCount(0);
        playShuffleSound();
      }, 0),
    );

    timers.push(
      window.setTimeout(() => {
        setDealStage('dealing');
      }, 540),
    );

    // Deal 5 calm waves outward to all 4 seats (160ms rhythm per wave)
    for (let wave = 1; wave <= 5; wave += 1) {
      timers.push(
        window.setTimeout(() => {
          setDealtCardCount(wave);
          playCardSound();
        }, 560 + (wave - 1) * 165),
      );
    }

    // Restful pause so the player can glance at their 5 cards before Call overlay appears
    timers.push(
      window.setTimeout(() => {
        setDealStage('ready');
      }, 1560),
    );

    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [state.phase, state.round, localAlreadyCalled]);

  // Choreographed TRICK_COMPLETE sweep:
  // 0..880ms: read all 4 cards + golden highlight on winner
  // 880..1540ms: all 4 played cards sweep visibly together into winner's card stack
  // 1440ms+: winner's card stack updates & pops cleanly as the cards arrive
  useEffect(() => {
    if (state.phase !== 'TRICK_COMPLETE') {
      const resetT = window.setTimeout(() => {
        setSweepPhase('idle');
      }, 0);
      return () => window.clearTimeout(resetT);
    }

    const tHighlight = window.setTimeout(() => {
      setSweepPhase('highlight');
    }, 0);
    const tSweep = window.setTimeout(() => {
      setSweepPhase('sweeping');
      playCardSound();
    }, 880);
    const tLand = window.setTimeout(() => {
      setSweepPhase('landed');
    }, 1480);

    return () => {
      window.clearTimeout(tHighlight);
      window.clearTimeout(tSweep);
      window.clearTimeout(tLand);
    };
  }, [state.phase, state.trickNumber, state.round]);

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
    () => (state.phase === 'MATCH_OVER' ? getMatchRankings(state) : []),
    [state],
  );

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
    if (mySeatIndex === null || !isMyPlayTurn || state.phase !== 'PLAYING') return;
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
          ? 'animate-play-from-left'
          : pos === 'right'
            ? 'animate-play-from-right'
            : 'animate-play-from-bottom';

    const sweepClass = isSweeping
      ? compact
        ? trickWinnerPos === 'top'
          ? 'animate-sweep-mobile-top'
          : trickWinnerPos === 'left'
            ? 'animate-sweep-mobile-left'
            : trickWinnerPos === 'right'
              ? 'animate-sweep-mobile-right'
              : 'animate-sweep-mobile-bottom-left'
        : trickWinnerPos === 'top'
          ? 'animate-sweep-to-top'
          : trickWinnerPos === 'left'
            ? 'animate-sweep-to-left'
            : trickWinnerPos === 'right'
              ? 'animate-sweep-to-right'
              : 'animate-sweep-to-bottom-left'
      : '';

    return (
      <div
        data-testid={
          compact ? undefined : `trick-slot-${slotName.toLowerCase()}`
        }
        aria-label={`${slotName} slot`}
        className={
          compact
            ? 'flex h-[68px] w-[50px] items-center justify-center sm:h-[76px] sm:w-[56px]'
            : 'flex h-[106px] w-[76px] items-center justify-center lg:h-[116px] lg:w-[84px]'
        }
      >
        {playedCard !== undefined && (
          <div
            className={sweepClass || flightClass}
            style={
              isSweeping
                ? {
                    animationDelay: `${
                      (isWinner ? 3 : seat.seatIndex % 3) * 125
                    }ms`,
                  }
                : undefined
            }
          >
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
                ariaLabel={`${seat.username} played ${playedCard}`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const dealingOverlay = (
    <div
      aria-label="Shuffling and dealing cards"
      data-testid="dealing-deck"
      className="pointer-events-none relative flex h-32 w-32 items-center justify-center"
    >
      {/* Center 3D Riffle Deck */}
      <div className="relative flex items-center justify-center">
        <div
          className={`absolute ${dealStage === 'shuffling' ? 'animate-riffle-left' : ''}`}
        >
          <PlayingCard faceDown size="sm" className="!h-[78px] !w-[54px]" />
        </div>
        <div className={dealStage === 'shuffling' ? 'animate-riffle-right' : ''}>
          <PlayingCard faceDown size="sm" className="!h-[78px] !w-[54px]" />
        </div>
      </div>

      {/* Outward flying deal cards to North, West, East, and South */}
      {dealStage === 'dealing' && (
        <>
          {(['top', 'left', 'right', 'bottom'] as const).map((dir, dIdx) => (
            <div
              key={`${dir}-${dealtCardCount}`}
              style={{ animationDelay: `${dIdx * 30}ms` }}
              className={`absolute animate-deal-to-${dir}`}
            >
              <PlayingCard faceDown size="xs" className="!h-[56px] !w-[38px]" />
            </div>
          ))}
        </>
      )}
    </div>
  );

  const visibleLocalHand = isDealingSequence
    ? mySeat.hand.slice(0, dealtCardCount)
    : mySeat.hand;

  const activeTurnHint =
    isMyPlayTurn && state.phase === 'PLAYING'
      ? state.trickNumber === 1 && state.currentTrick.length === 0
        ? 'You hold 1 — lead Trick 1'
        : 'Your turn — tap a card'
      : null;

  const turnRing = (compact = false) => (
    <div
      aria-label={`Active turn: ${activeSeatObj.username}`}
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
            ? 'Declare Your Call (50 – 500)'
            : mySeat.call !== null
              ? `Call Locked: ${mySeat.call}`
              : 'Simultaneous Call'}
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
                {val}
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
              aria-label="Call amount slider"
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
                {selectedCall}
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
                Confirm
              </button>
            </div>
          </div>

          <p className="text-[11px] font-semibold text-[#8c6460]">
            All players call simultaneously ({calledCount}/4 locked)
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[#8c6460]">
          Waiting for other players to lock their call ({calledCount}/4)…
        </p>
      )}
    </div>
  );

  return (
    <div
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
          <div className="flex shrink-0 flex-col leading-none">
            <h1 className="font-bangla text-lg font-extrabold tracking-tight text-[#4a2e2b] sm:text-xl md:text-3xl">
              হানডেট
            </h1>
            <span className="text-[9px] font-extrabold tracking-[0.16em] text-[#f25c84] sm:text-[10px] md:text-xs">
              HUNDRED
            </span>
          </div>

          <span
            data-testid="arena-status-pill"
            className="glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold text-[#4a2e2b] sm:px-3 sm:py-1 sm:text-[11px] md:px-3.5 md:py-1.5 md:text-xs"
          >
            Round {state.round}/{TOTAL_ROUNDS}
          </span>

          {remainingSeconds !== null &&
            (state.phase === 'BIDDING' || state.phase === 'PLAYING') && (
              <span data-testid="shot-clock" className="sr-only">
                {remainingSeconds}s
              </span>
            )}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
          {/* Tactile Audio SFX Toggle */}
          <button
            type="button"
            onClick={toggleSfx}
            aria-label={sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
            title={sfxMuted ? 'Sound OFF' : 'Sound ON'}
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
            <span>স্কোরবোর্ড</span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="leave-room-btn"
            title="Leave Room"
            aria-label="Leave Room"
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
                    isDealingSequence ? dealtCardCount : undefined
                  }
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
                    isDealingSequence ? dealtCardCount : undefined
                  }
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
                    isDealingSequence ? dealtCardCount : undefined
                  }
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
                />
              );
            })()}
          </div>

          {/* Center Play Zone */}
          <section
            aria-label="Center Play Zone"
            data-testid="center-trick-arena"
            className="absolute left-1/2 top-[45%] z-10 -translate-x-1/2 -translate-y-1/2"
          >
            {isDealingSequence ? (
              dealingOverlay
            ) : state.phase === 'BIDDING' ? (
              biddingCard
            ) : (
              <div className="relative">
                {state.phase === 'TRICK_COMPLETE' &&
                  state.lastTrickPoints > 0 &&
                  sweepPhase === 'highlight' && (
                    <div
                      aria-live="polite"
                      className="animate-float-pts pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#ffc857] bg-[#fff9e6] px-3 py-1 text-xs font-extrabold text-[#b86b00] shadow-md"
                    >
                      ✨ +{state.lastTrickPoints}
                    </div>
                  )}

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

          {/* Subtle Calm Active-Turn Cue above Hand */}
          {activeTurnHint && (
            <div className="animate-panel-enter pointer-events-none absolute bottom-[188px] left-1/2 z-20 -translate-x-1/2 lg:bottom-[204px]">
              <span className="glass-pill rounded-full !border-[#ff8fab] !bg-[#fff5f7] px-3.5 py-1 text-[11px] font-bold tracking-wide text-[#c73e65]">
                {activeTurnHint}
              </span>
            </div>
          )}

          {/* Bottom-Center Fanned Local Hand */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className={`pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-nowrap items-end justify-center transition-transform duration-300 ${
              isMyPlayTurn ? '-translate-y-1.5' : ''
            }`}
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
                  className="pointer-events-auto origin-bottom transition-all duration-200 ease-out hover:z-40"
                >
                  <div className="animate-deal-fan-in">
                    <PlayingCard
                      value={card}
                      orientation="portrait"
                      size="hand"
                      useCustomScan={scanSet.has(card)}
                      playable={isMyPlayTurn}
                      disabled={!isMyPlayTurn}
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
                    isDealingSequence ? dealtCardCount : undefined
                  }
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
                      isDealingSequence ? dealtCardCount : undefined
                    }
                  />
                );
              })()}
            </div>

            {/* CENTER 4-CARD PORTRAIT CROSS */}
            <section
              aria-label="Center Play Zone"
              data-testid="center-trick-arena"
              className="relative flex items-center justify-center"
            >
              {isDealingSequence ? (
                dealingOverlay
              ) : (
                <div className="relative">
                  {state.phase === 'TRICK_COMPLETE' &&
                    state.lastTrickPoints > 0 &&
                    sweepPhase === 'highlight' && (
                      <div
                        aria-live="polite"
                        className="animate-float-pts pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#ffc857] bg-[#fff9e6] px-2.5 py-0.5 text-[11px] font-extrabold text-[#b86b00] shadow-md"
                      >
                        ✨ +{state.lastTrickPoints}
                      </div>
                    )}

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
                      isDealingSequence ? dealtCardCount : undefined
                    }
                  />
                );
              })()}
            </div>

            {/* Mobile Transient Bidding Overlay (appears AFTER deal settles) */}
            {state.phase === 'BIDDING' && !isDealingSequence && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#4a2e2b]/25 p-3 backdrop-blur-[2px]">
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
            />
          </div>

          {/* BOTTOM HAND: Large Thumb-Friendly Fanned Visiting Cards */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className={`flex shrink-0 flex-nowrap items-end justify-center pb-0.5 pt-1 transition-transform duration-300 ${
              isMyPlayTurn ? '-translate-y-1' : ''
            }`}
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
                  className="transition-transform duration-200 ease-out"
                >
                  <div className="animate-deal-fan-in">
                    <PlayingCard
                      value={card}
                      orientation="portrait"
                      size="sm"
                      className="!h-[96px] !w-[66px] !text-[34px]"
                      useCustomScan={scanSet.has(card)}
                      playable={isMyPlayTurn}
                      disabled={!isMyPlayTurn}
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
          aria-label={`Round ${latestRoundRecord.round} Summary`}
          data-testid="round-summary-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#4a2e2b]/35 p-4 backdrop-blur-sm"
        >
          <div className="glass-pill animate-panel-enter w-full max-w-lg rounded-[30px] border-2 border-[#f7c0ce] p-5 text-[#4a2e2b] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bangla text-xl font-extrabold text-[#d94f72]">
                Round {latestRoundRecord.round} / {TOTAL_ROUNDS}
              </h2>
              <button
                type="button"
                onClick={() => setScoreboardOpen(true)}
                className="rounded-full border-2 border-[#ffccd8] bg-[#fff0f4] px-3.5 py-1 font-bangla text-xs font-bold text-[#c73e65] transition hover:bg-[#ff7597] hover:text-white"
              >
                স্কোরবোর্ড
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#f5d4dc] bg-white px-3 py-1">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#f5d8df] text-[#8c6460]">
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 px-2 text-right">Call</th>
                    <th className="py-2 px-2 text-right">Won</th>
                    <th className="py-2 pl-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRoundRecord.entries.map((entry) => {
                    const hit = entry.capturedPoints >= entry.call;
                    return (
                      <tr
                        key={entry.seatIndex}
                        className="border-b border-[#faeaee] last:border-b-0"
                      >
                        <td className="py-2 pr-2 font-bold text-[#4a2e2b]">
                          {entry.username}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-[#c47d10]">
                          {entry.call}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-extrabold ${
                            hit ? 'text-[#289664]' : 'text-[#d94f72]'
                          }`}
                        >
                          {entry.capturedPoints}
                        </td>
                        <td className="py-2 pl-2 text-right font-black text-[#4a2e2b]">
                          {entry.totalAfter}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'NEXT_ROUND' })}
                data-testid="next-round-btn"
                className="rounded-2xl bg-[#ff7597] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[2px] active:shadow-[0_2px_0_#d94f72]"
              >
                {state.round >= TOTAL_ROUNDS
                  ? 'View Final Podium'
                  : `Start Round ${state.round + 1}`}
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
          aria-label="Match Over Podium"
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
                  Winner:{' '}
                  <strong className="text-[#d94f72]">
                    {matchRankings[0].username}
                  </strong>{' '}
                  — {matchRankings[0].totalScore} pts
                </p>
              )}
            </div>

            <ol className="space-y-2">
              {matchRankings.map((entry) => (
                <li
                  key={entry.seatIndex}
                  className={`flex items-center justify-between rounded-2xl border-2 px-4 py-2.5 text-sm ${
                    entry.rank === 1
                      ? 'border-[#ffc857] bg-[#fff8e0]'
                      : 'border-[#f4d4dc] bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-[#e69500]">
                      #{entry.rank}
                    </span>
                    <span className="font-bold text-[#4a2e2b]">
                      {entry.username}
                    </span>
                  </div>
                  <span className="font-extrabold text-[#d94f72]">
                    {entry.totalScore} pts
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="rounded-2xl border-2 border-[#f2c4cf] bg-white px-4 py-2 text-sm font-bold text-[#6e4946] transition hover:bg-[#fff0ec]"
              >
                Back to Lobby
              </button>
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'PLAY_AGAIN' })}
                data-testid="play-again-btn"
                className="inline-flex items-center gap-1.5 rounded-2xl bg-[#ff7597] px-5 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[2px] active:shadow-[0_2px_0_#d94f72]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Play Again</span>
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
        />
      )}
    </div>
  );
}

export default GameTable;
