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

const AVATAR_IMAGES = [
  '/assets/avatar-rafiq.jpg',
  '/assets/avatar-siam.jpg',
  '/assets/avatar-nabil.jpg',
  '/assets/avatar-apon.jpg',
] as const;

export function getSeatAvatarSrc(seat: SeatState): string {
  const lower = (seat.username || '').trim().toLowerCase();
  if (lower.includes('rafiq')) return '/assets/avatar-rafiq.jpg';
  if (lower.includes('siam')) return '/assets/avatar-siam.jpg';
  if (lower.includes('nabil')) return '/assets/avatar-nabil.jpg';
  if (lower.includes('apon')) return '/assets/avatar-apon.jpg';
  return AVATAR_IMAGES[seat.seatIndex % AVATAR_IMAGES.length];
}

function CapturedStack3D({
  seatIndex,
  capturedPoints,
  small = false,
  className = '',
}: {
  seatIndex: number;
  capturedPoints: number;
  small?: boolean;
  className?: string;
}) {
  return (
    <div
      data-testid={`captured-stack-${seatIndex}`}
      className={`relative flex items-center justify-center ${className}`}
    >
      <div
        className={`captured-deck-3d relative flex items-center justify-center rounded-[7px] ${
          small
            ? 'h-[40px] w-[52px]'
            : 'h-[56px] w-[74px] lg:h-[62px] lg:w-[82px]'
        }`}
      >
        <div
          className={`gold-coin-badge flex flex-col items-center justify-center rounded-full text-center leading-none text-[#241302] ${
            small ? 'h-7 w-7' : 'h-9 w-9 lg:h-10 lg:w-10'
          }`}
        >
          <span
            className={`font-extrabold tracking-tight ${
              small ? 'text-[9px]' : 'text-[11px] lg:text-xs'
            }`}
          >
            {capturedPoints}{' '}
          </span>
          <span
            className={`font-bold uppercase tracking-tight ${
              small ? 'text-[7px]' : 'text-[8px]'
            }`}
          >
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
  small = false,
}: {
  position: HubPosition;
  remainingCards: number;
  small?: boolean;
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
          const deg = (idx - center) * 9;
          const yLift = Math.abs(idx - center) * 2.5;
          return (
            <div
              key={idx}
              style={{
                transform: `rotate(${deg}deg) translateY(${yLift}px)`,
                marginLeft: idx === 0 ? 0 : small ? -18 : -24,
              }}
              className="transition-transform duration-200"
            >
              <PlayingCard
                faceDown
                size="sm"
                className={
                  small
                    ? '!h-[44px] !w-[30px]'
                    : '!h-[66px] !w-[46px] lg:!h-[76px] lg:!w-[52px]'
                }
              />
            </div>
          );
        })}
      </div>

      {/* Crisp white circular card count badge (NO "Hand" text) */}
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f8f5ef] font-extrabold text-[#121826] shadow-[0_3px_10px_rgba(0,0,0,0.45)] ring-1 ring-black/15 ${
          small ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-sm'
        }`}
      >
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
  const avatarSrc = getSeatAvatarSrc(seat);
  const remainingCards = seat.hand.length;

  const ringClasses = isSpeaking
    ? 'ring-[4px] ring-emerald-400 shadow-[0_0_26px_rgba(52,245,122,0.95),0_0_8px_rgba(52,245,122,0.9)]'
    : isActiveTurn
      ? 'ring-[4px] ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.92),0_0_8px_rgba(251,191,36,0.85)]'
      : 'ring-[3px] ring-emerald-400/75 shadow-[0_0_15px_rgba(52,211,153,0.48)]';

  const avatarSizeClass = compactMobile
    ? 'h-[48px] w-[48px]'
    : 'h-[72px] w-[72px] lg:h-[86px] lg:w-[86px]';

  const avatarBlock = (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div
          data-testid={`seat-avatar-${seat.seatIndex}`}
          data-speaking={isSpeaking ? 'true' : 'false'}
          className={`relative overflow-hidden rounded-full border-[3px] border-[#111914] bg-[#162920] transition-all duration-200 ${avatarSizeClass} ${ringClasses}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarSrc}
            alt={displayName}
            className="h-full w-full object-cover object-top select-none"
          />
        </div>

        {isHost && (
          <span
            title="Host"
            className={`absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full border border-amber-100/80 bg-amber-400 text-[#1b1108] shadow-md ${
              compactMobile ? 'h-4 w-4' : 'h-5 w-5'
            }`}
          >
            <Crown
              className={compactMobile ? 'h-2.5 w-2.5' : 'h-3 w-3'}
              aria-hidden="true"
            />
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
            className={`absolute -bottom-0.5 right-0 flex items-center justify-center rounded-full border border-[#120b07] shadow ${
              compactMobile ? 'h-4 w-4' : 'h-5 w-5'
            } ${
              !seat.isOnline
                ? 'bg-zinc-700 text-zinc-200'
                : isSpeaking
                  ? 'bg-emerald-400 text-[#052e16]'
                  : 'bg-[#231710]/95 text-[#e6d5b8]'
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

      <span
        className={`mt-1 max-w-[130px] truncate font-bold tracking-tight text-white ${
          compactMobile ? 'text-xs' : 'text-sm lg:text-[15px]'
        }`}
        style={{ textShadow: '0 2px 6px rgba(0,0,0,0.92)' }}
      >
        {displayName}
        {isMe ? ' (Me)' : ''}
      </span>

      <div className="mt-0.5 flex items-center gap-1">
        <span
          className={`glass-pill whitespace-nowrap rounded-full font-semibold text-[#faf3e6] ${
            compactMobile
              ? 'px-1.5 py-0.5 text-[9px]'
              : 'px-2.5 py-0.5 text-[11px] lg:text-xs'
          }`}
        >
          Call: {seat.call !== null ? seat.call : '--'}
        </span>
        <span
          className={`glass-pill whitespace-nowrap rounded-full font-semibold text-[#faf3e6] ${
            compactMobile
              ? 'px-1.5 py-0.5 text-[9px]'
              : 'px-2.5 py-0.5 text-[11px] lg:text-xs'
          }`}
        >
          Score: {seat.totalScore}
        </span>
      </div>
    </div>
  );

  // Compact mobile seat layout — super clean, zero overlap
  if (compactMobile) {
    return (
      <div
        data-testid={`seat-hub-${position}`}
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className={`flex items-center gap-2 ${
          position === 'right' ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-1">
          {position !== 'bottom-left' && remainingCards > 0 && (
            <OpponentNavyFan
              position={position}
              remainingCards={remainingCards}
              small
            />
          )}
          <CapturedStack3D
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
            small
          />
        </div>
      </div>
    );
  }

  // DESKTOP TOP CENTER: Avatar mathematically dead-center, Navy Fan + Crimson Stack extend to the right
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
        <div className="absolute left-full top-1 ml-3 flex items-center gap-2.5 lg:ml-4 lg:gap-3.5">
          <OpponentNavyFan position="top" remainingCards={remainingCards} />
          <CapturedStack3D
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
          />
        </div>
      </div>
    );
  }

  // DESKTOP LEFT CENTER (Siam): Avatar far-left, navy fan to right, crimson stack above fan
  if (position === 'left') {
    return (
      <div
        data-testid="seat-hub-left"
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="relative flex items-center gap-3.5 lg:gap-5"
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-3.5">
          <CapturedStack3D
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
            className="-mt-12"
          />
          <OpponentNavyFan position="left" remainingCards={remainingCards} />
        </div>
      </div>
    );
  }

  // DESKTOP RIGHT CENTER (Apon): Avatar far-right, navy fan to left, crimson stack below fan
  if (position === 'right') {
    return (
      <div
        data-testid="seat-hub-right"
        data-seat-index={seat.seatIndex}
        data-active-turn={isActiveTurn ? 'true' : 'false'}
        data-speaking={isSpeaking ? 'true' : 'false'}
        className="relative flex flex-row-reverse items-center gap-3.5 lg:gap-5"
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-3.5">
          <OpponentNavyFan position="right" remainingCards={remainingCards} />
          <CapturedStack3D
            seatIndex={seat.seatIndex}
            capturedPoints={seat.capturedPoints}
          />
        </div>
      </div>
    );
  }

  // DESKTOP BOTTOM-LEFT CORNER (Rafiq / Me): Avatar + 2 pills, crimson stack upper-right, NO face-down fan
  return (
    <div
      data-testid="seat-hub-bottom-left"
      data-seat-index={seat.seatIndex}
      data-active-turn={isActiveTurn ? 'true' : 'false'}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className="relative flex items-end gap-4 lg:gap-5"
    >
      {avatarBlock}
      <CapturedStack3D
        seatIndex={seat.seatIndex}
        capturedPoints={seat.capturedPoints}
        className="mb-14"
      />
    </div>
  );
}

export default SeatHub;
