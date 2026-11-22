'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Trophy,
} from 'lucide-react';

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
import { PlayingCard } from '@/components/PlayingCard';
import { ScoreboardModal } from '@/components/ScoreboardModal';
import { SeatHub, type HubPosition } from '@/components/SeatHub';
import { VoiceBar } from '@/components/VoiceBar';
import {
  CALL_STEP,
  getMatchRankings,
  MAX_CALL,
  MIN_CALL,
  TOTAL_ROUNDS,
} from '@/lib/gameEngine';
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
  const isDesktop = useSyncExternalStore(
    subscribeDesktopMedia,
    getDesktopMediaSnapshot,
    getDesktopMediaServerSnapshot,
  );

  const scanSet = useMemo(() => new Set(availableCardScans), [availableCardScans]);

  useEffect(() => {
    if (state.phase === 'BIDDING') {
      const startTimer = window.setTimeout(() => {
        setDealingRound(state.round);
      }, 0);
      const endTimer = window.setTimeout(() => {
        setDealingRound(null);
      }, 650);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(endTimer);
      };
    }
    return undefined;
  }, [state.phase, state.round]);

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
  const isMyTurn =
    mySeatIndex !== null &&
    state.activeSeat === mySeatIndex &&
    (state.phase === 'BIDDING' || state.phase === 'PLAYING');

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
    if (mySeatIndex === null) return;
    const clamped = Math.max(MIN_CALL, Math.min(MAX_CALL, value));
    onDispatchAction({
      type: 'PLACE_CALL',
      seatIndex: mySeatIndex,
      call: clamped,
    });
  };

  const handlePlayCard = (card: CardValue) => {
    if (mySeatIndex === null || !isMyTurn || state.phase !== 'PLAYING') return;
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

    return (
      <div
        data-testid={
          compact ? undefined : `trick-slot-${slotName.toLowerCase()}`
        }
        aria-label={`${slotName} slot`}
        className={
          compact
            ? 'flex h-[52px] w-[82px] items-center justify-center'
            : 'flex h-[82px] w-[130px] items-center justify-center lg:h-[90px] lg:w-[146px]'
        }
      >
        {playedCard !== undefined && (
          <div className="animate-center-card-pop">
            <PlayingCard
              value={playedCard}
              orientation="landscape"
              size={compact ? 'sm' : 'md'}
              className={compact ? '!h-[50px] !w-[78px] !text-[28px]' : ''}
              useCustomScan={scanSet.has(playedCard)}
              highlighted={isWinner}
              ariaLabel={`${seat.username} played ${playedCard}`}
            />
          </div>
        )}
      </div>
    );
  };

  const turnRing = (compact = false) => (
    <div
      aria-label={`Active turn: ${activeSeatObj.username}`}
      data-testid={compact ? undefined : 'turn-compass'}
      className={`relative flex items-center justify-center rounded-full border-2 border-amber-300/55 bg-black/15 shadow-[0_0_24px_rgba(251,191,36,0.38),inset_0_0_16px_rgba(251,191,36,0.16)] ${
        compact ? 'h-12 w-12' : 'h-16 w-16 lg:h-20 lg:w-20'
      }`}
    >
      <ArrowUp
        className={`absolute top-1 transition-all ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'top'
            ? 'scale-125 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,1)]'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowLeft
        className={`absolute left-1 transition-all ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'left'
            ? 'scale-125 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,1)]'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowRight
        className={`absolute right-1 transition-all ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'right'
            ? 'scale-125 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,1)]'
            : 'text-amber-100/20'
        }`}
      />
      <ArrowDown
        className={`absolute bottom-1 transition-all ${compact ? 'h-3 w-3' : 'h-4 w-4'} ${
          activeDirection === 'bottom-left'
            ? 'scale-125 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,1)]'
            : 'text-amber-100/20'
        }`}
      />
      <span className="h-2 w-2 rounded-full bg-amber-300/85 shadow-[0_0_10px_rgba(251,191,36,0.95)]" />
    </div>
  );

  const biddingCard = (
    <div
      data-testid="bidding-tray"
      className="glass-pill w-[308px] rounded-3xl border-amber-300/40 p-4 text-center shadow-[0_24px_60px_rgba(0,0,0,0.85)] sm:w-[390px] sm:p-5"
    >
      <div className="text-sm font-bold tracking-wide text-amber-200 sm:text-base">
        {isMyTurn
          ? 'Declare Your Call (50 – 500)'
          : `Waiting for ${activeSeatObj.username} to call…`}
      </div>

      {isMyTurn && (
        <div className="mt-3.5 space-y-3.5">
          <div className="grid grid-cols-4 gap-2">
            {QUICK_CALL_VALUES.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => submitCall(val)}
                data-testid={`quick-call-${val}`}
                className={`rounded-xl border py-2 text-sm font-extrabold transition ${
                  selectedCall === val
                    ? 'border-amber-300 bg-amber-400 text-[#1b1108] shadow-[0_0_14px_rgba(251,191,36,0.5)]'
                    : 'border-white/15 bg-white/10 text-[#faf3e6] hover:border-amber-300/60 hover:bg-amber-400 hover:text-[#1b1108]'
                }`}
              >
                {val}
              </button>
            ))}
          </div>

          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-black/35 px-3.5 py-3">
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-amber-200 transition hover:bg-white/20"
              >
                <Minus className="h-4 w-4" />
              </button>

              <span className="text-xl font-black tracking-tight text-white">
                {selectedCall}
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedCall((c) => Math.min(MAX_CALL, c + CALL_STEP))
                }
                aria-label="Increase call by 10"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-amber-200 transition hover:bg-white/20"
              >
                <Plus className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => submitCall(selectedCall)}
                data-testid="submit-custom-call"
                className="ml-1 flex-1 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-sm font-extrabold text-[#1b1108] shadow-lg transition hover:from-amber-200 hover:to-amber-400"
              >
                Confirm Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      data-testid="game-table-root"
      data-rain-paused={lowDataMode ? 'true' : 'false'}
      data-phase={state.phase}
      className="pati-table-surface relative min-h-screen w-full overflow-hidden select-none md:fixed md:inset-0 md:h-dvh md:min-h-[680px]"
    >
      {/* Atmospheric layers: subtle edge vignette, warm flickering kupibati glow, edge-masked rain */}
      <div aria-hidden="true" className="table-vignette absolute inset-0" />
      <div
        aria-hidden="true"
        className="lantern-ambient-flicker absolute inset-0"
      />
      <div
        aria-hidden="true"
        data-testid="rain-overlay"
        data-rain-paused={lowDataMode ? 'true' : 'false'}
        className={`rain-overlay absolute inset-0 ${
          !rainEnabled ? 'rain-hidden' : ''
        } ${lowDataMode ? 'rain-paused' : ''}`}
      />

      {/* TOP HEADER BAR (Shared Desktop & Mobile) */}
      <header className="relative z-30 flex items-start justify-between px-3.5 pt-3 md:absolute md:inset-x-0 md:top-0 md:px-7 md:pt-4 md:pointer-events-none">
        <div className="flex items-center gap-2.5 md:pointer-events-auto md:gap-5">
          <div className="flex flex-col leading-none">
            <h1 className="title-gold-3d font-bangla text-[26px] font-extrabold leading-[0.95] md:text-[42px]">
              একশো
            </h1>
            <span className="title-gold-3d -mt-0.5 text-[13px] font-black tracking-[0.07em] md:text-[22px]">
              HUNDRED
            </span>
          </div>

          <div className="flex items-center gap-1.5 self-start pt-1 md:gap-2 md:pt-1.5">
            <span
              data-testid="arena-status-pill"
              className="glass-pill rounded-full px-3 py-1 text-[11px] font-bold tracking-wide text-[#faf3e6] md:px-4 md:py-1.5 md:text-[15px]"
            >
              Round {state.round}/{TOTAL_ROUNDS}
            </span>

            {remainingSeconds !== null &&
              (state.phase === 'BIDDING' || state.phase === 'PLAYING') && (
                <span
                  data-testid="shot-clock"
                  className={`glass-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold md:px-2.5 md:py-1.5 md:text-xs ${
                    remainingSeconds <= 5
                      ? '!border-red-400/70 text-red-200'
                      : 'text-amber-200'
                  }`}
                >
                  <Clock className="h-3 w-3 md:h-3.5 md:w-3.5" aria-hidden="true" />
                  <span>{remainingSeconds}s</span>
                </span>
              )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5 md:pointer-events-auto md:gap-2 md:pt-1">
          <button
            type="button"
            onClick={() => setScoreboardOpen(true)}
            data-testid="scoreboard-btn"
            className="glass-pill group inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-bangla text-xs font-bold text-[#faf3e6] transition hover:border-amber-300/60 hover:text-amber-200 md:gap-2.5 md:px-4 md:text-base"
          >
            <span>স্কোরবোর্ড</span>
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-7 items-center rounded-full border border-white/25 bg-white/15 p-0.5 transition group-hover:bg-amber-400/30 md:h-5 md:w-9"
            >
              <span className="h-3 w-3 rounded-full bg-[#f8f3e8] shadow md:h-3.5 md:w-3.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            data-testid="leave-room-btn"
            title="Leave Room"
            aria-label="Leave Room"
            className="glass-pill inline-flex h-8 w-8 items-center justify-center rounded-full text-[#f0dfc2] transition hover:border-red-400/50 hover:text-red-200 md:h-9 md:w-9"
          >
            <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {isDesktop ? (
        /* ================================================================
           DESKTOP 16:9 FLAT-LAY TABLETOP
           ================================================================ */
        <div>
          {/* TOP CENTER (Nabil) — Avatar mathematically centered above North card */}
          <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
            <SeatHub
              seat={seatByPos.top}
              position="top"
              isMe={mySeatIndex === seatByPos.top.seatIndex}
              isHost={hostSeatIndex === seatByPos.top.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.top.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.top.clientId)}
            />
          </div>

          {/* LEFT CENTER (Siam) */}
          <div className="absolute left-6 top-[45%] z-20 -translate-y-1/2 lg:left-8">
            <SeatHub
              seat={seatByPos.left}
              position="left"
              isMe={mySeatIndex === seatByPos.left.seatIndex}
              isHost={hostSeatIndex === seatByPos.left.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.left.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.left.clientId)}
            />
          </div>

          {/* RIGHT CENTER (Apon) */}
          <div className="absolute right-6 top-[45%] z-20 -translate-y-1/2 lg:right-8">
            <SeatHub
              seat={seatByPos.right}
              position="right"
              isMe={mySeatIndex === seatByPos.right.seatIndex}
              isHost={hostSeatIndex === seatByPos.right.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.right.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.right.clientId)}
            />
          </div>

          {/* BOTTOM-LEFT CORNER (Rafiq / Me) */}
          <div className="absolute bottom-5 left-6 z-20 lg:left-8">
            <SeatHub
              seat={seatByPos['bottom-left']}
              position="bottom-left"
              isMe={mySeatIndex === seatByPos['bottom-left'].seatIndex}
              isHost={hostSeatIndex === seatByPos['bottom-left'].seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos['bottom-left'].seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos['bottom-left'].clientId)}
            />
          </div>

          {/* CENTER PLAY ZONE */}
          <section
            aria-label="Center Play Zone"
            data-testid="center-trick-arena"
            className="absolute left-1/2 top-[46%] z-10 -translate-x-1/2 -translate-y-1/2"
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
              <div className="grid grid-cols-[auto_auto_auto] grid-rows-[auto_auto_auto] items-center justify-items-center gap-x-4 gap-y-3">
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

          {/* BOTTOM-CENTER: LARGE SWEPT CURVED ARC HAND */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className="pointer-events-none absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 flex-nowrap items-end justify-center"
          >
            {mySeat.hand.map((card, idx) => {
              const count = mySeat.hand.length;
              const center = (count - 1) / 2;
              const offset = idx - center;
              const rot = offset * 5.2;
              const yOffset = Math.abs(offset) * Math.abs(offset) * 5.5;

              return (
                <div
                  key={card}
                  style={{
                    transform: `rotate(${rot}deg) translateY(${yOffset}px)`,
                    marginLeft: idx === 0 ? 0 : -16,
                    zIndex: 10 + idx,
                  }}
                  className="pointer-events-auto origin-bottom transition-all duration-200 hover:z-40"
                >
                  <div
                    className="animate-deal-fan-in"
                    style={{ animationDelay: `${idx * 55}ms` }}
                  >
                    <PlayingCard
                      value={card}
                      orientation="portrait"
                      size="hand"
                      useCustomScan={scanSet.has(card)}
                      playable={state.phase === 'PLAYING' && isMyTurn}
                      disabled={state.phase !== 'PLAYING' || !isMyTurn}
                      onClick={() => handlePlayCard(card)}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* BOTTOM-RIGHT COMPACT DOCK */}
          <div className="absolute bottom-5 right-6 z-30 lg:right-8">
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
           MOBILE PORTRAIT LAYOUT (< md) — ZERO OVERLAP GUARANTEED
           ================================================================ */
        <div className="relative z-10 flex min-h-[calc(100vh-58px)] flex-col justify-between gap-2 px-3 pb-3 pt-2">
          {/* Top Opponent */}
          <div className="flex justify-center">
            <SeatHub
              compactMobile
              seat={seatByPos.top}
              position="top"
              isMe={mySeatIndex === seatByPos.top.seatIndex}
              isHost={hostSeatIndex === seatByPos.top.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.top.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.top.clientId)}
            />
          </div>

          {/* Left & Right Opponents Strip */}
          <div className="flex items-center justify-between gap-2">
            <SeatHub
              compactMobile
              seat={seatByPos.left}
              position="left"
              isMe={mySeatIndex === seatByPos.left.seatIndex}
              isHost={hostSeatIndex === seatByPos.left.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.left.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.left.clientId)}
            />
            <SeatHub
              compactMobile
              seat={seatByPos.right}
              position="right"
              isMe={mySeatIndex === seatByPos.right.seatIndex}
              isHost={hostSeatIndex === seatByPos.right.seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos.right.seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos.right.clientId)}
            />
          </div>

          {/* Center Play Zone or Bidding Overlay */}
          <section
            aria-label="Center Play Zone"
            data-testid="center-trick-arena"
            className="flex flex-1 items-center justify-center py-2"
          >
            {state.phase === 'BIDDING' ? (
              biddingCard
            ) : (
              <div className="grid grid-cols-[auto_auto_auto] grid-rows-[auto_auto_auto] items-center justify-items-center gap-2">
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
            )}
          </section>

          {/* Bottom HUD Strip: Me (Bottom-Left) + Compact Dock (Bottom-Right) cleanly ABOVE hand */}
          <div className="flex items-end justify-between gap-2">
            <SeatHub
              compactMobile
              seat={seatByPos['bottom-left']}
              position="bottom-left"
              isMe={mySeatIndex === seatByPos['bottom-left'].seatIndex}
              isHost={hostSeatIndex === seatByPos['bottom-left'].seatIndex}
              isActiveTurn={
                (state.phase === 'BIDDING' || state.phase === 'PLAYING') &&
                state.activeSeat === seatByPos['bottom-left'].seatIndex
              }
              isSpeaking={isSeatSpeaking(seatByPos['bottom-left'].clientId)}
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

          {/* Mobile Fanned Hand at Bottom-Center */}
          <div
            aria-label="Your hand"
            data-testid="player-hand"
            className="flex flex-nowrap items-end justify-center pt-1"
          >
            {mySeat.hand.map((card, idx) => {
              const count = mySeat.hand.length;
              const center = (count - 1) / 2;
              const offset = idx - center;
              const rot = offset * 4.5;
              const yOffset = Math.abs(offset) * Math.abs(offset) * 3;
              return (
                <div
                  key={card}
                  style={{
                    transform: `rotate(${rot}deg) translateY(${yOffset}px)`,
                    marginLeft: idx === 0 ? 0 : -10,
                    zIndex: 10 + idx,
                  }}
                >
                  <PlayingCard
                    value={card}
                    orientation="portrait"
                    size="sm"
                    className="!h-[98px] !w-[68px] !text-[36px]"
                    useCustomScan={scanSet.has(card)}
                    playable={state.phase === 'PLAYING' && isMyTurn}
                    disabled={state.phase !== 'PLAYING' || !isMyTurn}
                    onClick={() => handlePlayCard(card)}
                  />
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
          <div className="glass-pill w-full max-w-lg rounded-3xl border-amber-300/40 p-6 text-[#faf3e6] shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bangla text-2xl font-extrabold text-amber-300">
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
                        <td className="py-2.5 pr-2 font-bold">
                          {entry.username}
                        </td>
                        <td className="py-2.5 px-2 text-right text-amber-200">
                          {entry.call}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right font-bold ${
                            hit ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {entry.capturedPoints}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-extrabold text-white">
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
                className="rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-extrabold text-[#1b1108] shadow-lg transition hover:from-amber-200 hover:to-amber-400"
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
          <div className="glass-pill w-full max-w-lg rounded-3xl border-amber-300/60 p-6 text-[#faf3e6] shadow-2xl">
            <div className="mb-5 flex flex-col items-center text-center">
              <Trophy className="mb-2 h-11 w-11 text-amber-300" />
              <h2 className="title-gold-3d font-bangla text-3xl font-extrabold">
                একশো HUNDRED
              </h2>
              {matchRankings[0] && (
                <p className="mt-1.5 text-sm text-[#e6d5b8]">
                  Champion:{' '}
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
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                    entry.rank === 1
                      ? 'border-amber-300/65 bg-amber-400/15'
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

            <div className="mt-6 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-[#faf3e6] hover:bg-white/15"
              >
                Back to Lobby
              </button>
              <button
                type="button"
                onClick={() => onDispatchAction({ type: 'PLAY_AGAIN' })}
                data-testid="play-again-btn"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-extrabold text-[#1b1108] shadow-lg hover:from-amber-200 hover:to-amber-400"
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
