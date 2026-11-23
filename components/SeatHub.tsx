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
  /** Progress from 1.0 (full time) down to 0.0 (expired) rendered as a glowing ring on the avatar. */
  turnProgress?: number | null;
  /** True when <= 5 seconds remain on the turn clock (shifts avatar glow from warm gold to coral-red). */
  isTimerUrgent?: boolean;
  /** During simultaneous bidding, hide opponents' exact call amount until all 4 players confirm. */
  maskCall?: boolean;
  /** Optional override for displayed captured points (delayed slightly until sweeping cards land in the stack). */
  displayedCapturedPoints?: number;
  /** Optional override for displayed tricks won count. */
  displayedTricksWon?: number;
  /** Optional override for visible opponent cards during round-start deal animation. */
  visibleHandCount?: number;
}

/**
 * Handcrafted flat-editorial illustrated SVG character portraits (< 1.5 KB each, 0 KB network bloat).
 * Distinct Bangladeshi village adda characters per seat — zero AI-generated look.
 */
export function SeatAvatarGraphic({
  seat,
  size = 44,
}: {
  seat: SeatState;
  size?: number;
}) {
  const variant = seat.seatIndex % 4;

  // Seat 0: Emerald-Teal Panjabi (Friendly neat side-part)
  if (variant === 0) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="h-full w-full"
      >
        <rect width="64" height="64" rx="32" fill="#1e3d38" />
        <circle cx="32" cy="30" r="24" fill="#27524b" fillOpacity="0.55" />
        {/* Panjabi shoulders */}
        <path
          d="M11 64C13 49 21 44 32 44C43 44 51 49 53 64H11Z"
          fill="#2d7a6e"
        />
        <path d="M29 44H35V57H29V44Z" fill="#1b4f47" />
        <circle cx="32" cy="49" r="1.1" fill="#f3cd67" />
        <circle cx="32" cy="53.5" r="1.1" fill="#f3cd67" />
        {/* Neck */}
        <rect x="27.5" y="37" width="9" height="9" rx="4" fill="#c98d63" />
        {/* Ears */}
        <circle cx="19.5" cy="28.5" r="3" fill="#c98d63" />
        <circle cx="44.5" cy="28.5" r="3" fill="#c98d63" />
        {/* Face */}
        <rect x="20" y="15" width="24" height="25" rx="12" fill="#dfa479" />
        {/* Hair */}
        <path
          d="M19 25C19 15.5 25 11.5 32.5 11.5C40 11.5 45 16 45 24.5C42 20.5 38 19 32 19.5C27 20 22.5 21 19 25Z"
          fill="#1b1817"
        />
        {/* Eyes & Eyebrows */}
        <path d="M24 24.5Q26.5 23.2 29 24.5" stroke="#241b17" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M35 24.5Q37.5 23.2 40 24.5" stroke="#241b17" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="26.5" cy="28" r="1.7" fill="#1c1614" />
        <circle cx="37.5" cy="28" r="1.7" fill="#1c1614" />
        {/* Warm smile */}
        <path
          d="M27.5 34C29 36.2 35 36.2 36.5 34"
          stroke="#6b3a24"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Seat 1: Terracotta Kurta + Round Glasses (Siam)
  if (variant === 1) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="h-full w-full"
      >
        <rect width="64" height="64" rx="32" fill="#4f221d" />
        <circle cx="32" cy="30" r="24" fill="#6b2e26" fillOpacity="0.55" />
        {/* Terracotta kurta */}
        <path
          d="M11 64C13 49 21 44 32 44C43 44 51 49 53 64H11Z"
          fill="#b84a39"
        />
        <path d="M27 44L32 51L37 44" stroke="#f5d8b8" strokeWidth="1.8" strokeLinejoin="round" />
        {/* Neck & Ears */}
        <rect x="27.5" y="37" width="9" height="9" rx="4" fill="#be8157" />
        <circle cx="19.5" cy="28.5" r="3" fill="#be8157" />
        <circle cx="44.5" cy="28.5" r="3" fill="#be8157" />
        {/* Face */}
        <rect x="20" y="15" width="24" height="25" rx="12" fill="#d4966a" />
        {/* Wavy Hair */}
        <path
          d="M18.5 25C18 15 24 10.5 32 11C40.5 11.5 45.5 16 45 25C43 21 40 18.5 35 19C30 19.5 25 18 18.5 25Z"
          fill="#1f1918"
        />
        {/* Round Eyeglasses */}
        <circle cx="26.5" cy="28" r="4.2" fill="#ffffff" fillOpacity="0.14" stroke="#1e1714" strokeWidth="1.6" />
        <circle cx="37.5" cy="28" r="4.2" fill="#ffffff" fillOpacity="0.14" stroke="#1e1714" strokeWidth="1.6" />
        <path d="M30.7 28H33.3" stroke="#1e1714" strokeWidth="1.5" />
        <circle cx="26.5" cy="28" r="1.5" fill="#1c1614" />
        <circle cx="37.5" cy="28" r="1.5" fill="#1c1614" />
        {/* Confident grin */}
        <path
          d="M28 34.5C30 36.4 34.5 36.2 36.5 33.8"
          stroke="#5c301c"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Seat 2: Indigo Casual Cap (Apon)
  if (variant === 2) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="h-full w-full"
      >
        <rect width="64" height="64" rx="32" fill="#1c2b4a" />
        <circle cx="32" cy="30" r="24" fill="#273e6b" fillOpacity="0.55" />
        {/* Indigo crew jersey */}
        <path
          d="M11 64C13 49 21 44 32 44C43 44 51 49 53 64H11Z"
          fill="#35589a"
        />
        <path d="M25 45.5Q32 51 39 45.5" stroke="#dbe7ff" strokeWidth="2" strokeLinecap="round" />
        {/* Neck & Ears */}
        <rect x="27.5" y="37" width="9" height="9" rx="4" fill="#c78a60" />
        <circle cx="19.5" cy="29" r="2.8" fill="#c78a60" />
        <circle cx="44.5" cy="29" r="2.8" fill="#c78a60" />
        {/* Face */}
        <rect x="20" y="16" width="24" height="24" rx="11.5" fill="#dda074" />
        {/* Sporty Cap */}
        <path
          d="M19 22C19.5 14 25 10.5 32 10.5C39 10.5 44.5 14 45 22H19Z"
          fill="#e0a943"
        />
        <path d="M17 21.5H47.5C47 23.5 44 24 41 23.5H20C18 23.5 17 22.8 17 21.5Z" fill="#b88122" />
        {/* Eyes & Cheerful smile */}
        <circle cx="26.5" cy="28.5" r="1.7" fill="#1a1514" />
        <circle cx="37.5" cy="28.5" r="1.7" fill="#1a1514" />
        <path
          d="M27 33.8C29 36.8 35 36.8 37 33.8Z"
          fill="#fff5eb"
          stroke="#6b3a24"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Seat 3: Mustard Panjabi + Classic Adda Mustache (Nabil)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="h-full w-full"
    >
      <rect width="64" height="64" rx="32" fill="#4f3711" />
      <circle cx="32" cy="30" r="24" fill="#6e4d18" fillOpacity="0.55" />
      {/* Mustard Panjabi + Dark Shawl */}
      <path
        d="M11 64C13 49 21 44 32 44C43 44 51 49 53 64H11Z"
        fill="#cc922c"
      />
      <path d="M16 48C21 53 26 59 27 64H13C14 57 15 52 16 48Z" fill="#3a2414" />
      {/* Neck & Ears */}
      <rect x="27.5" y="37" width="9" height="9" rx="4" fill="#ba7d53" />
      <circle cx="19.5" cy="28.5" r="3" fill="#ba7d53" />
      <circle cx="44.5" cy="28.5" r="3" fill="#ba7d53" />
      {/* Face */}
      <rect x="20" y="15" width="24" height="25" rx="12" fill="#d19366" />
      {/* Hair */}
      <path
        d="M19.5 24C19.5 15 25 11 32 11C39 11 44.5 15 44.5 24C42 20 37.5 18 32 18C26.5 18 22 20 19.5 24Z"
        fill="#1e1815"
      />
      {/* Eyes */}
      <path d="M24 24.5Q26.5 23.5 29 24.5" stroke="#1f1814" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M35 24.5Q37.5 23.5 40 24.5" stroke="#1f1814" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="26.5" cy="28" r="1.7" fill="#1c1614" />
      <circle cx="37.5" cy="28" r="1.7" fill="#1c1614" />
      {/* Classic Mustache + Smile */}
      <path
        d="M26 33.5C28 31.8 31 32 32 33C33 32 36 31.8 38 33.5"
        stroke="#221915"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M29.2 35.8Q32 37.2 34.8 35.8"
        stroke="#5c301c"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Glowing circular SVG countdown timer ring mounted directly around the player's avatar.
 */
function AvatarTimerRing({
  isActiveTurn,
  isSpeaking,
  turnProgress,
  isUrgent,
}: {
  isActiveTurn: boolean;
  isSpeaking: boolean;
  turnProgress: number | null;
  isUrgent: boolean;
}) {
  if (isSpeaking) {
    return (
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[4px] h-[calc(100%+8px)] w-[calc(100%+8px)]"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="#34d399"
          strokeWidth="5.5"
          style={{ filter: 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.85))' }}
        />
      </svg>
    );
  }

  if (!isActiveTurn) return null;

  const progress =
    turnProgress !== null ? Math.max(0, Math.min(1, turnProgress)) : 1;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const strokeColor = isUrgent ? '#f87171' : '#fbbf24';
  const glowColor = isUrgent
    ? 'rgba(248, 113, 113, 0.92)'
    : 'rgba(251, 191, 36, 0.88)';

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-testid="avatar-timer-ring"
      className="pointer-events-none absolute -inset-[4px] h-[calc(100%+8px)] w-[calc(100%+8px)] -rotate-90"
    >
      {/* Subtle dark track */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.16)"
        strokeWidth="5.5"
      />
      {/* Glowing radial countdown arc */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth="5.8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: 'stroke-dashoffset 220ms linear, stroke 200ms ease',
          filter: `drop-shadow(0 0 6px ${glowColor})`,
        }}
      />
    </svg>
  );
}

/**
 * Placeholder-first captured card stack:
 * - Starts with NO stack — only a subtle dashed empty card placeholder on the mat.
 * - Once tricks are won, grows into a dark navy-blue stacked visiting-card deck
 *   showing ONLY the accumulated points in crisp high-contrast numerals.
 */
function CapturedStack({
  seatIndex,
  capturedPoints,
  tricksWon,
  mini = false,
  className = '',
}: {
  seatIndex: number;
  capturedPoints: number;
  tricksWon: number;
  mini?: boolean;
  className?: string;
}) {
  const isEmpty = capturedPoints === 0 && tricksWon === 0;
  const depthClass =
    tricksWon >= 3
      ? 'captured-deck-3d-tall'
      : tricksWon === 2
        ? 'captured-deck-3d-mid'
        : '';

  if (mini) {
    if (isEmpty) {
      return (
        <div
          data-testid={`captured-stack-${seatIndex}`}
          data-empty="true"
          aria-label="Captured points: 0"
          className={`inline-flex h-[22px] w-[17px] items-center justify-center rounded-[4px] border border-dashed border-[#f2dec0]/35 bg-black/15 ${className}`}
        />
      );
    }

    return (
      <div
        key={capturedPoints}
        data-testid={`captured-stack-${seatIndex}`}
        data-empty="false"
        aria-label={`Captured points: ${capturedPoints}`}
        className={`animate-points-pop relative inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-[5px] border border-[#efe7d8]/85 bg-gradient-to-b from-[#284277] to-[#16274b] px-1.5 text-[11px] font-black tabular-nums leading-none text-white shadow-[0_2px_0_#e5dcc8,0_4px_7px_rgba(0,0,0,0.45)] ${className}`}
      >
        {capturedPoints}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        data-testid={`captured-stack-${seatIndex}`}
        data-empty="true"
        aria-label="Captured points: 0"
        className={`relative flex items-center justify-center ${className}`}
      >
        <div className="flex h-[62px] w-[46px] items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-[#f2dec0]/30 bg-black/15 transition-all duration-300 lg:h-[70px] lg:w-[52px]">
          <div className="h-[74%] w-[70%] rounded-[3px] border border-[#f2dec0]/12" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`captured-stack-${seatIndex}`}
      data-empty="false"
      aria-label={`Captured points: ${capturedPoints}`}
      className={`relative flex items-center justify-center ${className}`}
    >
      {/* Portrait dark-navy stacked visiting-card deck growing thicker with tricks won */}
      <div
        key={capturedPoints}
        className={`captured-deck-3d animate-points-pop relative flex h-[62px] w-[46px] items-center justify-center rounded-[6px] lg:h-[70px] lg:w-[52px] ${depthClass}`}
      >
        {/* Inner navy card filigree frame */}
        <div className="pointer-events-none absolute inset-[3.5px] rounded-[3.5px] border border-[#f5ecd9]/35" />
        {/* Crisp high-contrast accumulated points numeral only */}
        <span className="relative z-10 rounded px-1.5 py-0.5 text-[16px] font-black tabular-nums leading-none tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] lg:text-[18px]">
          {capturedPoints}
        </span>
      </div>
    </div>
  );
}

/**
 * Purely visual fanned dark-navy cards representing an opponent's remaining hand.
 * Zero numbers, zero text — physically shrinks as cards are played.
 */
function OpponentNavyFan({
  position,
  remainingCards,
  mini = false,
}: {
  position: HubPosition;
  remainingCards: number;
  mini?: boolean;
}) {
  if (remainingCards <= 0) return null;

  if (mini) {
    return (
      <div
        data-testid={`opponent-fan-${position}`}
        aria-label={`${remainingCards} cards remaining`}
        className="flex items-end justify-center py-0.5"
      >
        {Array.from({ length: remainingCards }).map((_, idx) => {
          const center = (remainingCards - 1) / 2;
          const deg = (idx - center) * 9;
          const yLift = Math.abs(idx - center) * 1.2;
          return (
            <div
              key={idx}
              style={{
                transform: `rotate(${deg}deg) translateY(${yLift}px)`,
                marginLeft: idx === 0 ? 0 : -7,
              }}
              className="navy-card-back h-[20px] w-[14px] rounded-[2.5px] transition-transform duration-300"
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      data-testid={`opponent-fan-${position}`}
      aria-label={`${remainingCards} cards remaining`}
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
              className="transition-transform duration-300 ease-out"
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
    </div>
  );
}

function SeatHubInner({
  seat,
  position,
  isMe,
  isHost,
  isActiveTurn,
  isSpeaking,
  compactMobile = false,
  turnProgress = null,
  isTimerUrgent = false,
  maskCall = false,
  displayedCapturedPoints,
  displayedTricksWon,
  visibleHandCount,
}: SeatHubProps) {
  const displayName = seat.username || `Seat ${seat.seatIndex + 1}`;
  const remainingCards =
    visibleHandCount !== undefined
      ? Math.min(seat.hand.length, visibleHandCount)
      : seat.hand.length;
  const shownPoints = displayedCapturedPoints ?? seat.capturedPoints;
  const shownTricks = displayedTricksWon ?? seat.tricksWon;

  const callLabel =
    seat.call === null ? '--' : maskCall ? '✓' : String(seat.call);
  const callMade =
    !maskCall && seat.call !== null && shownPoints >= seat.call;

  const idleRingClasses = isSpeaking
    ? 'ring-2 ring-emerald-400'
    : !isActiveTurn
      ? 'ring-1 ring-[#e6d5b8]/35'
      : '';

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
          className="glass-pill flex min-w-0 items-center gap-2 rounded-2xl px-2 py-1 sm:gap-2.5 sm:px-2.5 sm:py-1.5"
        >
          <div className="relative shrink-0">
            <div
              data-testid={`seat-avatar-${seat.seatIndex}`}
              data-speaking={isSpeaking ? 'true' : 'false'}
              className={`relative h-8 w-8 overflow-hidden rounded-full transition-all sm:h-9 sm:w-9 ${idleRingClasses}`}
            >
              <SeatAvatarGraphic seat={seat} size={36} />
            </div>
            <AvatarTimerRing
              isActiveTurn={isActiveTurn}
              isSpeaking={isSpeaking}
              turnProgress={turnProgress}
              isUrgent={isTimerUrgent}
            />
            {isHost && (
              <span className="absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[#1b1108]">
                <Crown className="h-2.5 w-2.5" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="max-w-[70px] truncate text-[11px] font-bold text-[#faf3e6] sm:max-w-[82px] sm:text-xs">
                {displayName}
                {isMe ? ' (Me)' : ''}
              </span>
              {position === 'top' && (
                <OpponentNavyFan
                  position="top"
                  remainingCards={remainingCards}
                  mini
                />
              )}
              <CapturedStack
                seatIndex={seat.seatIndex}
                capturedPoints={shownPoints}
                tricksWon={shownTricks}
                mini
              />
            </div>

            <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[9.5px] font-medium text-[#d8c7ae] sm:gap-2 sm:text-[10px]">
              <span className={callMade ? 'font-bold text-emerald-300' : ''}>
                Call: {callLabel}
              </span>
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
        className="glass-pill flex w-[60px] flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-center sm:w-[68px] sm:px-1.5 sm:py-2"
      >
        <div className="relative">
          <div
            data-testid={`seat-avatar-${seat.seatIndex}`}
            data-speaking={isSpeaking ? 'true' : 'false'}
            className={`relative h-8 w-8 overflow-hidden rounded-full transition-all sm:h-9 sm:w-9 ${idleRingClasses}`}
          >
            <SeatAvatarGraphic seat={seat} size={36} />
          </div>
          <AvatarTimerRing
            isActiveTurn={isActiveTurn}
            isSpeaking={isSpeaking}
            turnProgress={turnProgress}
            isUrgent={isTimerUrgent}
          />
        </div>

        <span className="w-full truncate text-[10.5px] font-bold leading-tight text-[#faf3e6] sm:text-[11px]">
          {displayName}
        </span>

        {/* Purely visual mini navy card fan — zero numbers */}
        <OpponentNavyFan
          position={position}
          remainingCards={remainingCards}
          mini
        />

        <div className="flex flex-col text-[8.5px] leading-tight text-[#d8c7ae] sm:text-[9px]">
          <span className={callMade ? 'font-bold text-emerald-300' : ''}>
            Call: {callLabel}
          </span>
          <span>Score: {seat.totalScore}</span>
        </div>

        <CapturedStack
          seatIndex={seat.seatIndex}
          capturedPoints={shownPoints}
          tricksWon={shownTricks}
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
          className={`relative h-[64px] w-[64px] overflow-hidden rounded-full border-2 border-[#1b120d] transition-all duration-200 lg:h-[72px] lg:w-[72px] ${idleRingClasses}`}
        >
          <SeatAvatarGraphic seat={seat} size={72} />
        </div>

        <AvatarTimerRing
          isActiveTurn={isActiveTurn}
          isSpeaking={isSpeaking}
          turnProgress={turnProgress}
          isUrgent={isTimerUrgent}
        />

        {isHost && (
          <span
            title="Room Host"
            aria-label="Room Host"
            className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[#1b1108] shadow ring-1 ring-black/40"
          >
            <Crown className="h-3 w-3" aria-hidden="true" />
          </span>
        )}

        {isMe && (
          <span
            aria-label={isSpeaking ? 'Microphone live' : 'Microphone muted'}
            className={`absolute -bottom-0.5 -right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/25 ${
              isSpeaking
                ? 'bg-emerald-500 text-white'
                : 'bg-[#1a130e]/95 text-stone-300'
            }`}
          >
            {isSpeaking ? (
              <Mic className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <MicOff className="h-2.5 w-2.5 opacity-80" aria-hidden="true" />
            )}
          </span>
        )}

        {!seat.isOnline && seat.type === 'HUMAN' && (
          <span
            title="Offline"
            className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
          >
            <WifiOff className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="mt-1.5 text-center">
        <span className="block max-w-[130px] truncate text-sm font-bold text-[#faf3e6] drop-shadow">
          {displayName}
          {isMe ? ' (Me)' : ''}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1.5">
        <span
          className={`glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
            callMade
              ? '!border-emerald-400/55 text-emerald-200'
              : 'text-[#f3e6cf]'
          }`}
        >
          Call: {callLabel}
        </span>
        <span className="glass-pill whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-[#f3e6cf]">
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
        className="flex items-start gap-4"
      >
        {avatarBlock}
        <div className="mt-2 flex items-center gap-3">
          <OpponentNavyFan position="top" remainingCards={remainingCards} />
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={shownPoints}
            tricksWon={shownTricks}
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
        className="flex items-center gap-4"
      >
        {avatarBlock}
        <div className="flex flex-col items-center gap-2.5">
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={shownPoints}
            tricksWon={shownTricks}
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
        className="flex items-center gap-4"
      >
        <div className="flex flex-col items-center gap-2.5">
          <OpponentNavyFan position="right" remainingCards={remainingCards} />
          <CapturedStack
            seatIndex={seat.seatIndex}
            capturedPoints={shownPoints}
            tricksWon={shownTricks}
          />
        </div>
        {avatarBlock}
      </div>
    );
  }

  // Bottom-Left (Local Player — no face-down hand fan since playable hand is at bottom-center)
  return (
    <div
      data-testid="seat-hub-bottom-left"
      data-seat-index={seat.seatIndex}
      data-active-turn={isActiveTurn ? 'true' : 'false'}
      data-speaking={isSpeaking ? 'true' : 'false'}
      className="flex items-center gap-4"
    >
      {avatarBlock}
      <CapturedStack
        seatIndex={seat.seatIndex}
        capturedPoints={shownPoints}
        tricksWon={shownTricks}
      />
    </div>
  );
}

export const SeatHub = React.memo(SeatHubInner);

export default SeatHub;
