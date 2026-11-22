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
 * Handcrafted pure-SVG Bangladeshi village hurricane lantern (kupibati) — < 1 KB, zero image bloat.
 */
function KupibatiLantern({ paused }: { paused: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative flex items-center justify-center"
    >
      {/* Soft warm amber glow halo */}
      <div
        className={`absolute h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,196,86,0.42)_0%,rgba(232,140,36,0.14)_45%,transparent_72%)] ${
          paused ? '' : 'animate-lantern-flicker'
        }`}
      />
      <svg
        width="54"
        height="72"
        viewBox="0 0 54 72"
        fill="none"
        className="relative drop-shadow-[0_8px_14px_rgba(0,0,0,0.6)]"
      >
        {/* Top ring handle */}
        <circle cx="27" cy="6" r="4" stroke="#b9823c" strokeWidth="2" />
        {/* Brass hood */}
        <path d="M18 15C19 10.5 22.5 9 27 9C31.5 9 35 10.5 36 15H18Z" fill="#7d5324" stroke="#d49b4a" strokeWidth="1.2" />
        <rect x="15" y="15" width="24" height="3.5" rx="1.75" fill="#9c6b2f" />
        {/* Side wire guards */}
        <path d="M17 18.5C11 26 11 40 16 49" stroke="#9e6d31" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M37 18.5C43 26 43 40 38 49" stroke="#9e6d31" strokeWidth="1.5" strokeLinecap="round" />
        {/* Curved glass globe */}
        <path
          d="M18 18.5H36C39 26 39 39 35.5 48.5H18.5C15 39 15 26 18 18.5Z"
          fill="url(#kupibatiGlass)"
          stroke="#f3cf82"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        {/* Flickering inner flame */}
        <g className={paused ? '' : 'animate-lantern-flicker'} style={{ transformOrigin: '27px 40px' }}>
          <path
            d="M27 25C30.5 31 32 35.5 31 39.5C30.2 42.5 28.8 43.5 27 43.5C25.2 43.5 23.8 42.5 23 39.5C22 35.5 23.5 31 27 25Z"
            fill="#ffb830"
          />
          <path
            d="M27 30.5C29 34 29.6 37 29 39.5C28.6 41.2 27.9 42 27 42C26.1 42 25.4 41.2 25 39.5C24.4 37 25 34 27 30.5Z"
            fill="#fff5c2"
          />
        </g>
        {/* Wick holder & brass oil base */}
        <rect x="23" y="44" width="8" height="4.5" rx="1" fill="#5e3b17" />
        <path d="M14 48.5H40L43 60C43 62.5 40.8 64 38.5 64H15.5C13.2 64 11 62.5 11 60L14 48.5Z" fill="#70471e" stroke="#c98e3d" strokeWidth="1.3" />
        <rect x="10" y="62.5" width="34" height="4.5" rx="2.25" fill="#4f3114" stroke="#b37b31" strokeWidth="1" />
        <defs>
          <radialGradient id="kupibatiGlass" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(27 35) rotate(90) scale(16 12)">
            <stop stopColor="#ffe799" stopOpacity="0.65" />
            <stop offset="0.65" stopColor="#e89428" stopOpacity="0.28" />
            <stop offset="1" stopColor="#5a2e0c" stopOpacity="0.45" />
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
  const [dealingRound, setDealingRound] = useState<number | null>(null);
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

  useEffect(() => {
    if (state.phase === 'BIDDING') {
      const startTimer = window.setTimeout(() => {
        setDealingRound(state.round);
      }, 0);
      const endTimer = window.setTimeout(() => {
        setDealingRound(null);
      }, 600);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(endTimer);
      };
    }
    return undefined;
  }, [state.phase, state.round]);

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
  const canPlaceCall =
    state.phase === 'BIDDING' && mySeatIndex !== null && mySeat.call === null;
  const isMyPlayTurn =
    state.phase === 'PLAYING' &&
    mySeatIndex !== null &&
    state.activeSeat === mySeatIndex;
  const calledCount = state.seats.filter((s) => s.call !== null).length;

  const isSeatActiveTurn = (seat: GameState['seats'][number]): boolean => {
    if (state.phase === 'BIDDING') {
      return seat.type !== 'EMPTY' && seat.call === null;
    }
    if (state.phase === 'PLAYING') {
      return state.activeSeat === seat.seatIndex;
    }
    return false;
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

    const flightClass =
      pos === 'top'
        ? 'animate-play-from-top'
        : pos === 'left'
          ? 'animate-play-from-left'
          : pos === 'right'
            ? 'animate-play-from-right'
            : 'animate-play-from-bottom';

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
          <div className={flightClass}>
            <div className={isWinner ? 'animate-trick-win-glow' : ''}>
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
                highlighted={isWinner}
                ariaLabel={`${seat.username} played ${playedCard}`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const turnRing = (compact = false) => (
    <div
      aria-label={`Active turn: ${activeSeatObj.username}`}
      data-testid={compact ? undefined : 'turn-compass'}
      className={`relative flex items-center justify-center rounded-full border border-amber-300/45 bg-black/25 ${
        compact ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-14 w-14 lg:h-16 lg:w-16'
      }`}
    >
      <ArrowUp
        className={`absolute top-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'top'
            ? 'scale-110 text-amber-300'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowLeft
        className={`absolute left-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'left'
            ? 'scale-110 text-amber-300'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowRight
        className={`absolute right-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'right'
            ? 'scale-110 text-amber-300'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowDown
        className={`absolute bottom-0.5 transition-all duration-200 ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'bottom-left'
            ? 'scale-110 text-amber-300'
            : 'text-amber-100/20'
        }`}
      />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300/85" />
    </div>
  );

  const biddingCard = (
    <div
      data-testid="bidding-tray"
      className="glass-pill animate-panel-enter w-full max-w-[360px] rounded-2xl border-amber-300/35 p-4 text-center shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold tracking-wide text-amber-200 sm:text-sm">
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
                className={`rounded-xl border py-1.5 text-xs font-bold transition active:scale-95 sm:text-sm ${
                  selectedCall === val
                    ? 'border-amber-300 bg-amber-400 text-[#1b1108]'
                    : 'border-white/15 bg-white/10 text-[#faf3e6] hover:bg-amber-400 hover:text-[#1b1108]'
                }`}
              >
                {val}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5">
            <input
              type="range"
              min={MIN_CALL}
              max={MAX_CALL}
              step={CALL_STEP}
              value={selectedCall}
              onChange={(e) => setSelectedCall(Number(e.target.value))}
              aria-label="Call amount slider"
              className="w-full accent-amber-400"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedCall((c) => Math.max(MIN_CALL, c - CALL_STEP))
                }
                aria-label="Decrease call by 10"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-amber-200 transition hover:bg-white/20 active:scale-95"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <span className="text-lg font-extrabold tabular-nums text-white">
                {selectedCall}
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedCall((c) => Math.min(MAX_CALL, c + CALL_STEP))
                }
                aria-label="Increase call by 10"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-amber-200 transition hover:bg-white/20 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => submitCall(selectedCall)}
                data-testid="submit-custom-call"
                className="ml-1 flex-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-[#1b1108] transition hover:bg-amber-300 active:scale-95 sm:text-sm"
              >
                Confirm
              </button>
            </div>
          </div>

          <p className="text-[11px] font-medium text-[#d8c7ae]">
            All players call simultaneously ({calledCount}/4 locked)
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-[#d8c7ae]">
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
      className="pati-table-surface fixed inset-0 flex h-dvh w-full flex-col overflow-hidden select-none"
    >
      {/* Subtle rain streaks along edges */}
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
            <h1 className="font-bangla text-lg font-extrabold tracking-tight text-[#faf3e6] sm:text-xl md:text-3xl">
              হানডেট
            </h1>
            <span className="text-[9px] font-bold tracking-[0.16em] text-[#e0a943] sm:text-[10px] md:text-xs">
              HUNDRED
            </span>
          </div>

          <span
            data-testid="arena-status-pill"
            className="glass-pill whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold text-[#faf3e6] sm:px-2.5 sm:py-1 sm:text-[11px] md:px-3.5 md:py-1.5 md:text-xs"
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
            className="glass-pill inline-flex h-7 w-7 items-center justify-center rounded-full text-[#e8d9c0] transition hover:text-amber-300 sm:h-8 sm:w-8 md:h-9 md:w-9"
          >
            {sfxMuted ? (
              <VolumeX className="h-3.5 w-3.5 opacity-60 md:h-4 md:w-4" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-amber-300 md:h-4 md:w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setScoreboardOpen(true)}
            data-testid="scoreboard-btn"
            className="glass-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-bangla text-[11px] font-bold text-[#faf3e6] transition hover:border-amber-300/50 hover:text-amber-200 sm:px-3 sm:py-1.5 sm:text-xs md:px-4 md:text-sm"
          >
            <span>স্কোরবোর্ড</span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="leave-room-btn"
            title="Leave Room"
            aria-label="Leave Room"
            className="glass-pill inline-flex h-7 w-7 items-center justify-center rounded-full text-[#f0dfc2] transition hover:border-red-400/50 hover:text-red-200 sm:h-8 sm:w-8 md:h-9 md:w-9"
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
            />
          </div>

          {/* Left Center Seat */}
          <div className="absolute left-6 top-[44%] z-20 -translate-y-1/2">
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
            />
          </div>

          {/* Right Center Seat */}
          <div className="absolute right-6 top-[44%] z-20 -translate-y-1/2">
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
            />
          </div>

          {/* Bottom-Left Seat (Me) */}
          <div className="absolute bottom-4 left-6 z-20">
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
            />
          </div>

          {/* Center Play Zone */}
          <section
            aria-label="Center Play Zone"
            data-testid="center-trick-arena"
            className="absolute left-1/2 top-[45%] z-10 -translate-x-1/2 -translate-y-1/2"
          >
            {dealingRound !== null && (
              <div
                aria-label="Shuffling and dealing cards"
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
              >
                <div className="relative flex items-center justify-center">
                  <div className="animate-riffle-left absolute">
                    <PlayingCard faceDown size="md" />
                  </div>
                  <div className="animate-riffle-right">
                    <PlayingCard faceDown size="md" />
                  </div>
                </div>
              </div>
            )}

            {state.phase === 'BIDDING' ? (
              biddingCard
            ) : (
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
            )}
          </section>

          {/* Bottom-Center Fanned Local Hand */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 flex-nowrap items-end justify-center"
          >
            {mySeat.hand.map((card, idx) => {
              const count = mySeat.hand.length;
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
                  className="pointer-events-auto origin-bottom transition-all duration-150 hover:z-40"
                >
                  <div
                    className="animate-deal-fan-in"
                    style={{ animationDelay: `${idx * 45}ms` }}
                  >
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
            />
          </div>

          {/* MIDDLE 3-COLUMN TABLE: WEST EDGE — CENTER ARENA — EAST EDGE */}
          <div className="pati-inner-mat relative my-1.5 grid flex-1 grid-cols-[62px_minmax(0,1fr)_62px] items-center rounded-2xl px-1 sm:grid-cols-[68px_minmax(0,1fr)_68px]">
            {/* WEST SEAT (Far Left Edge) */}
            <div className="flex justify-start">
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
              />
            </div>

            {/* CENTER 4-CARD PORTRAIT CROSS */}
            <section
              aria-label="Center Play Zone"
              data-testid="center-trick-arena"
              className="flex items-center justify-center"
            >
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
            </section>

            {/* EAST SEAT (Far Right Edge) */}
            <div className="flex justify-end">
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
              />
            </div>

            {/* Mobile Transient Bidding Overlay centered cleanly over table */}
            {state.phase === 'BIDDING' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px]">
                {biddingCard}
              </div>
            )}
          </div>

          {/* BOTTOM CONTROL STRIP: Local Player (Left) + Ultra-Slim Dock (Right) */}
          <div className="flex shrink-0 items-center justify-between gap-2 px-0.5 py-1">
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
            />

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
            className="flex shrink-0 flex-nowrap items-end justify-center pb-0.5 pt-1"
          >
            {mySeat.hand.map((card, idx) => {
              const count = mySeat.hand.length;
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
                >
                  <div
                    className="animate-deal-fan-in"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="glass-pill w-full max-w-lg rounded-2xl border-amber-300/35 p-5 text-[#faf3e6] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bangla text-xl font-extrabold text-amber-300">
                Round {latestRoundRecord.round} / {TOTAL_ROUNDS}
              </h2>
              <button
                type="button"
                onClick={() => setScoreboardOpen(true)}
                className="rounded-full border border-amber-300/40 bg-white/10 px-3 py-1 font-bangla text-xs font-bold text-amber-200 hover:bg-amber-400 hover:text-[#1b1108]"
              >
                স্কোরবোর্ড
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/15 text-[#d7c4a3]">
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
                        className="border-b border-white/10"
                      >
                        <td className="py-2 pr-2 font-bold">{entry.username}</td>
                        <td className="py-2 px-2 text-right text-amber-200">
                          {entry.call}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-bold ${
                            hit ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {entry.capturedPoints}
                        </td>
                        <td className="py-2 pl-2 text-right font-extrabold text-white">
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
                className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-[#1b1108] hover:bg-amber-300"
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="glass-pill w-full max-w-lg rounded-2xl border-amber-300/50 p-6 text-[#faf3e6] shadow-2xl">
            <div className="mb-5 flex flex-col items-center text-center">
              <Trophy className="mb-2 h-10 w-10 text-amber-300" />
              <h2 className="font-bangla text-2xl font-extrabold text-[#faf3e6]">
                হানডেট <span className="text-[#e0a943]">HUNDRED</span>
              </h2>
              {matchRankings[0] && (
                <p className="mt-1.5 text-sm text-[#e6d5b8]">
                  Winner:{' '}
                  <strong className="text-amber-300">
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
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm ${
                    entry.rank === 1
                      ? 'border-amber-300/60 bg-amber-400/15'
                      : 'border-white/15 bg-black/35'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-black text-amber-300">
                      #{entry.rank}
                    </span>
                    <span className="font-bold text-white">
                      {entry.username}
                    </span>
                  </div>
                  <span className="font-extrabold text-amber-200">
                    {entry.totalScore} pts
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-[#faf3e6] hover:bg-white/15"
              >
                Back to Lobby
              </button>
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'PLAY_AGAIN' })}
                data-testid="play-again-btn"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-sm font-extrabold text-[#1b1108] hover:bg-amber-300"
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
          onClose={() => setScoreboardOpen(false)}
        />
      )}
    </div>
  );
}

export default GameTable;
