'use client';

import React from 'react';
import { Crown, Mic, MicOff, WifiOff } from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import type { SeatState } from '@/lib/types';

export type HubPosition = 'top' | 'left' | 'right' | 'bottom-left';

export interface SeatHubProps {
  seat: SeatState;
  position: HubPosition;
  isMe: boolean;
  isHost: boolean;
  isActiveTurn: boolean;
  isSpeaking: boolean;
  compactMobile?: boolean;
}

const SEAT_PALETTES = [
  { bg: '#2b4a42', accent: '#c9e8de', border: '#66a392' }, // Slate Teal
  { bg: '#6e322b', accent: '#f7d6d0', border: '#c47166' }, // Terracotta
  { bg: '#283d66', accent: '#d2e2fc', border: '#6d91d4' }, // Indigo
  { bg: '#75531a', accent: '#fae6b8', border: '#cfa04c' }, // Ochre
] as const;

/**
 * Ultra-lightweight (< 0.5 KB) crisp vector player avatar — zero AI-generated image bloat.
 */
export function SeatAvatarGraphic({
  seat,
  size = 44,
}: {
  seat: SeatState;
  size?: number;
}) {
  const palette = SEAT_PALETTES[seat.seatIndex % SEAT_PALETTES.length];
  const initial = (seat.username || 'P').trim().charAt(0).toUpperCase() || 'P';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="h-full w-full"
    >
      <rect width="64" height="64" rx="32" fill={palette.bg} />
      <circle cx="32" cy="24" r="10.5" fill={palette.accent} fillOpacity="0.22" />
      <path
        d="M14 55C16.5 44.5 23.2 40 32 40C40.8 40 47.5 44.5 50 55"
        fill={palette.accent}
        fillOpacity="0.18"
      />
      <text
        x="32"
        y="39"
        textAnchor="middle"
        fill={palette.accent}
        fontSize="26"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
}

function CapturedStack({
  seatIndex,
  capturedPoints,
  mini = false,
  className = '',
}: {
  seatIndex: number;
  capturedPoints: number;
  mini?: boolean;
  className?: string;
}) {
  if (mini) {
    return (
      <div
        data-testid={`captured-stack-${seatIndex}`}
        className={`inline-flex items-center gap-1 rounded-md border border-[#e08a91]/35 bg-[#8a212a] px-1.5 py-0.5 text-[10px] font-bold text-[#fae6b8] shadow-sm ${className}`}
      >
        <span>{capturedPoints} </span>
        <span className="text-[8px] opacity-85">Pts</span>
      </div>
    );
  }

  return (
    <div
      data-testid={`captured-stack-${seatIndex}`}
      className={`relative flex items-center justify-center ${className}`}
    >
      <div className="captured-deck-3d relative flex h-[50px] w-[66px] items-center justify-center rounded-[6px] lg:h-[56px] lg:w-[74px]">
        <div className="gold-coin-badge flex h-8 w-8 flex-col items-center justify-center rounded-full text-center leading-none text-[#241302] lg:h-9 lg:w-9">
          <span className="text-[10px] font-extrabold tracking-tight lg:text-xs">
            {capturedPoints}{' '}
          </span>
          <span className="text-[7px] font-bold uppercase tracking-tight">
            Pts
          </span>
        </div>
      </div>
    </div>
  );
}

function OpponentNavyFan({
  position,
  remainingCards,
}: {
  position: HubPosition;
  remainingCards: number;
}) {
  if (remainingCards <= 0) return null;

  return (
    <div
      data-testid={`opponent-fan-${position}`}
      className="relative flex items-center justify-center"
    >
      <div className="flex items-end">
        {Array.from({ length: remainingCards }).map((_, idx) => {
          const center = (remainingCards - 1) / 2;
          const deg = (idx - center) * 8;
          const yLift = Math.abs(idx - center) * 2;
          return (
            <div
              key={idx}
              style={{
                transform: `rotate(${deg}deg) translateY(${yLift}px)`,
                marginLeft: idx === 0 ? 0 : -22,
              }}
            >
              <PlayingCard
                faceDown
                size="sm"
                className="!h-[58px] !w-[40px] lg:!h-[68px] lg:!w-[46px]"
              />
            </div>
          );
        })}
      </div>

      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#faf7f0] text-xs font-extrabold text-[#162033] shadow ring-1 ring-black/15">
        {remainingCards}
      </span>
    </div>
  );
}

export function SeatHub({
  seat,
  position,
  isMe,
  isHost,
  isActiveTurn,
  isSpeaking,
  compactMobile = false,
}: SeatHubProps) {
  const displayName = seat.username || `Seat ${seat.seatIndex + 1}`;
  const remainingCards = seat.hand.length;

  // Clean subtle status rings (green when speaking, warm amber when active turn)
  const ringClasses = isSpeaking
    ? 'ring-[3px] ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.65)]'
    : isActiveTurn
      ? 'ring-[3px] ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
      : 'ring-1 ring-[#e6d5b8]/30';

  /* =========================================================================
     MOBILE COMPACT LAYOUT — Built for 360px–430px phone screens with ZERO overlap
     ========================================================================= */
  if (compactMobile) {
    // North (Top Center) & South-Left (Me): compact horizontal badge
    if (position === 'top' || position === 'bottom-left') {
      return (
        <div
          data-testid={`seat-hub-${position}`}
          data-seat-index={seat.seatIndex}
          data-active-turn={isActiveTurn ? 'true' : 'false'}
          data-speaking={isSpeaking ? 'true' : 'false'}
          className="glass-pill flex min-w-0 items-center gap-1.5 rounded-2xl px-2 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5"
        >
          <div className="relative shrink-0">
            <div
              data-testid={`seat-avatar-${seat.seatIndex}`}
              data-speaking={isSpeaking ? 'true' : 'false'}
              className={`h-8 w-8 overflow-hidden rounded-full transition-all sm:h-9 sm:w-9 ${ringClasses}`}
            >
              <SeatAvatarGraphic seat={seat} size={36} />
            </div>
            {isHost && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[#1b1108]">
                <Crown className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1">
              <span className="max-w-[70px] truncate text-[11px] font-bold text-[#faf3e6] sm:max-w-[82px] sm:text-xs">
                {displayName}
                {isMe ? ' (Me)' : ''}
              </span>
              {position === 'top' && remainingCards > 0 && (
                <span
                  data-testid="opponent-fan-top"
                  className="inline-flex h-4 min-w-[18px] items-center justify-center rounded bg-[#223969] px-1 text-[10px] font-bold text-[#faf7f0] ring-1 ring-[#efe7d8]/50"
                >
                  {remainingCards}
                </span>
              )}
              <CapturedStack
                seatIndex={seat.seatIndex}
                capturedPoints={seat.capturedPoints}
                mini
              />
            </div>

            <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[9.5px] font-medium text-[#d8c7ae] sm:gap-2 sm:text-[10px]">
              <span>Call: {seat.call !== null ? seat.call : '--'}</span>
              <span>Score: {seat.totalScore}</span>
            </div>
          </div>
        </div>
      );
    }

    // West (Left Edge) & East (Right Edge): ultra-slim vertical edge card (fits cleanly in 60px–68px column!)
    return (
      <div
        data-testid={`seat-hub-${position}`}
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="glass-pill flex w-[60px] flex-col items-center gap-1 overflow-hidden rounded-2xl px-1 py-1.5 text-center sm:w-[68px] sm:px-1.5 sm:py-2"
      >
        <div className="relative">
          <div
            data-testid={`seat-avatar-${seat.seatIndex}`}
            data-speaking={isSpeaking ? 'true' : 'false'}
            className={`h-8 w-8 overflow-hidden rounded-full transition-all sm:h-9 sm:w-9 ${ringClasses}`}
          >
            <SeatAvatarGraphic seat={seat} size={36} />
          </div>
          {remainingCards > 0 && (
            <span
              data-testid={`opponent-fan-${position}`}
              className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#223969] px-1 text-[9px] font-bold text-[#faf7f0] ring-1 ring-[#efe7d8]"
            >
              {remainingCards}
            </span>
          )}
        </div>

        <span className="w-full truncate text-[10.5px] font-bold leading-tight text-[#faf3e6] sm:text-[11px]">
          {displayName}
        </span>

        <div className="flex flex-col text-[8.5px] leading-tight text-[#d8c7ae] sm:text-[9px]">
          <span>Call: {seat.call !== null ? seat.call : '--'}</span>
          <span>Score: {seat.totalScore}</span>
        </div>

        <CapturedStack
          seatIndex={seat.seatIndex}
          capturedPoints={seat.capturedPoints}
          mini
        />
      </div>
    );
  }

  /* =========================================================================
     DESKTOP LAYOUT (>= 768px)
     ========================================================================= */
  const avatarBlock = (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div
          data-testid={`seat-avatar-${seat.seatIndex}`}
          data-speaking={isSpeaking ? 'true' : 'false'}
          className={`relative h-[64px] w-[64px] overflow-hidden rounded-full border-2 border-[#1b120d] transition-all duration-200 lg:h-[72px] lg:w-[72px] ${ringClasses}`}
        >
          <SeatAvatarGraphic seat={seat} size={72} />
        </div>

        {isHost && (
          <span
            title="Host"
            className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-amber-100/70 bg-amber-400 text-[#1b1108] shadow"
          >
            <Crown className="h-3 w-3" aria-hidden="true" />
          </span>
        )}

        {seat.type === 'HUMAN' && (
          <span
            title={
              !seat.isOnline
                ? 'Offline'
                : isSpeaking
                  ? 'Speaking'
                  : 'Mic Muted'
            }
            className={`absolute -bottom-0.5 right-0 flex h-5 w-5 items-center justify-center rounded-full border border-[#120b07] shadow ${
              !seat.isOnline
                ? 'bg-zinc-700 text-zinc-200'
                : isSpeaking
                  ? 'bg-emerald-400 text-[#052e16]'
                  : 'bg-[#231710] text-[#e6d5b8]'
            }`}
          >
            {!seat.isOnline ? (
              <WifiOff className="h-2.5 w-2.5" aria-hidden="true" />
            ) : isSpeaking ? (
              <Mic className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <MicOff className="h-2.5 w-2.5 opacity-80" aria-hidden="true" />
            )}
          </span>
        )}
      </div>

      <span className="mt-1.5 max-w-[130px] truncate text-sm font-bold text-[#faf3e6]">
        {displayName}
        {isMe ? ' (Me)' : ''}
      </span>

      <div className="mt-1 flex items-center gap-1.5">
        <span className="glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#faf3e6]">
          Call: {seat.call !== null ? seat.call : '--'}
        </span>
        <span className="glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#faf3e6]">
          Score: {seat.totalScore}
        </span>
      </div>
    </div>
  );

  if (position === 'top') {
    return (
      <div
        data-testid="seat-hub-top"
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="relative flex items-start justify-center"
      >
        {avatarBlock}
        <div className="absolute left-full top-1 ml-4 flex items-center gap-3.5">
          <OpponentNavyFan position="top" remainingCards={remainingCards} />
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
          />
        </div>
      </div>
    );
  }

  if (position === 'left') {
    return (
      <div
        data-testid="seat-hub-left"
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="relative flex items-center gap-3.5"
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-3">
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
            className="-mt-8"
          />
          <OpponentNavyFan position="left" remainingCards={remainingCards} />
        </div>
      </div>
    );
  }

  if (position === 'right') {
    return (
      <div
        data-testid="seat-hub-right"
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="relative flex flex-row-reverse items-center gap-3.5"
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-3">
          <OpponentNavyFan position="right" remainingCards={remainingCards} />
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="seat-hub-bottom-left"
      data-seat-index={seat.seatIndex}
      data-active-turn={isActiveTurn ? 'true' : 'false'}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className="relative flex items-end gap-4"
    >
      {avatarBlock}
      <CapturedStack
        seatIndex={seat.seatIndex}
        capturedPoints={seat.capturedPoints}
        className="mb-12"
      />
    </div>
  );
}

export default SeatHub;
