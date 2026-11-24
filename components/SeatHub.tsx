'use client';

import React from 'react';
import { Mic, MicOff, Target, Trophy, WifiOff } from 'lucide-react';
import { PlayingCard } from '@/components/PlayingCard';
import { RankBadge } from '@/components/RankBadge';
import { getAvatarPalette, getPresetAvatarForSeat } from '@/lib/avatar';
import {
  DEFAULT_LANG,
  formatNum,
  localizeDisplayName,
  TEXTS,
  type Lang,
} from '@/lib/i18n';
import type { AvatarConfig, SeatState } from '@/lib/types';

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
  /** Current match standing (1–4) once Round 1 finishes, displaying distinct per-rank icons on the avatar. */
  rank?: number | null;
  lang?: Lang;
}

/**
 * Handcrafted customizable kawaii chibi SVG character portraits (< 2 KB, zero network bloat).
 */
export function SeatAvatarGraphic({
  seat,
  avatar,
  variant,
  size = 44,
}: {
  seat?: SeatState;
  avatar?: AvatarConfig;
  variant?: number;
  size?: number;
}) {
  const cfg =
    avatar ??
    seat?.avatar ??
    getPresetAvatarForSeat(seat ? seat.seatIndex : (variant ?? 0));
  const { bgBase, bgRing, outfitFill, skinFill } = getAvatarPalette(cfg);
  const isAi = seat?.type === 'AI';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="h-full w-full"
    >
      <rect width="64" height="64" rx="32" fill={bgBase} />
      <circle cx="32" cy="30" r="24" fill={bgRing} fillOpacity="0.62" />

      {/* Back Hair / Ears Behind Face */}
      {cfg.character === 'kitty' && (
        <>
          <path d="M18 22L16 9.5L27 16Z" fill={outfitFill} />
          <path d="M19.5 19.5L18.5 13L24.5 16.5Z" fill="#ffb3c6" />
          <path d="M46 22L48 9.5L37 16Z" fill={outfitFill} />
          <path d="M44.5 19.5L45.5 13L39.5 16.5Z" fill="#ffb3c6" />
          <circle cx="32" cy="30" r="15.5" fill={outfitFill} />
        </>
      )}
      {cfg.character === 'bunny' && (
        <>
          <rect x="20" y="3.5" width="7.5" height="19" rx="3.75" transform="rotate(-8 20 3.5)" fill="#fff8f2" stroke={outfitFill} strokeWidth="2" />
          <rect x="22" y="7" width="3.5" height="11" rx="1.75" transform="rotate(-8 22 7)" fill="#ffb3c6" />
          <rect x="36.5" y="3.5" width="7.5" height="19" rx="3.75" transform="rotate(8 36.5 3.5)" fill="#fff8f2" stroke={outfitFill} strokeWidth="2" />
          <rect x="38.5" y="7" width="3.5" height="11" rx="1.75" transform="rotate(8 38.5 7)" fill="#ffb3c6" />
          <circle cx="32" cy="28" r="15.5" fill="#4f3531" />
        </>
      )}
      {cfg.character === 'glasses' && (
        <circle cx="32" cy="28" r="16.5" fill="#523532" />
      )}
      {cfg.character === 'dapper' && (
        <>
          <circle cx="32" cy="25" r="15.5" fill="#47332e" />
          <circle cx="22" cy="20" r="4.5" fill="#47332e" />
          <circle cx="42" cy="20" r="4.5" fill="#47332e" />
        </>
      )}
      {cfg.character === 'crown' && (
        <circle cx="32" cy="28" r="16" fill="#47312c" />
      )}
      {cfg.character === 'bearcap' && (
        <>
          <circle cx="20.5" cy="15.5" r="4.2" fill="#ffc857" />
          <circle cx="20.5" cy="15.5" r="2" fill="#ff9eb5" />
          <circle cx="43.5" cy="15.5" r="4.2" fill="#ffc857" />
          <circle cx="43.5" cy="15.5" r="2" fill="#ff9eb5" />
        </>
      )}

      {/* Shoulders & Outfit */}
      <path
        d="M11 64C13 49 21 44 32 44C43 44 51 49 53 64H11Z"
        fill={outfitFill}
      />
      {cfg.character === 'kitty' && (
        <>
          <path d="M27 46V55M37 46V55" stroke="#fff8f0" strokeWidth="2" strokeLinecap="round" />
          <circle cx="27" cy="56" r="1.6" fill="#ffe599" />
          <circle cx="37" cy="56" r="1.6" fill="#ffe599" />
        </>
      )}
      {cfg.character === 'glasses' && (
        <>
          <path d="M26 45L32 52L38 45" fill="#fff8f2" />
          <circle cx="32" cy="55.5" r="1.5" fill="#fff8f2" />
        </>
      )}
      {(cfg.character === 'bearcap' || cfg.character === 'bunny' || cfg.character === 'crown') && (
        <path
          d="M24 46Q32 52 40 46"
          stroke="#fff8f0"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {cfg.character === 'dapper' && (
        <>
          <rect x="21" y="44" width="22" height="5.5" rx="2.75" fill="#ffe599" />
          <rect x="35" y="47" width="5.5" height="12" rx="2.5" fill="#ffd166" />
        </>
      )}

      {/* Chibi Head */}
      <rect x="19" y="17.5" width="26" height="24.5" rx="12" fill={skinFill} />

      {/* Top Hair / Hat / Crown */}
      {cfg.character === 'kitty' && (
        <path
          d="M19 26C20 19 25 16 32 16C39 16 44 19 45 26C41 22.5 36.5 21.5 32 22C27.5 22.5 23 22.5 19 26Z"
          fill="#4a312c"
        />
      )}
      {cfg.character === 'glasses' && (
        <>
          <path
            d="M18.5 26C19 17.5 24.5 14 32 14C39.5 14 45 17.5 45.5 26C42 21.5 37 20.5 32 21C27 21.5 22 21.5 18.5 26Z"
            fill="#523532"
          />
          <rect x="37" y="18.5" width="5.5" height="2.4" rx="1.2" transform="rotate(14 37 18.5)" fill="#ffe599" />
        </>
      )}
      {cfg.character === 'bearcap' && (
        <>
          <path
            d="M18.5 23.5C19 15 24.5 11.5 32 11.5C39.5 11.5 45 15 45.5 23.5H18.5Z"
            fill="#ffc857"
          />
          <path d="M16.5 22.8H47.5C47 25 44 25.4 41 24.8H20C17.8 24.8 16.5 24.1 16.5 22.8Z" fill="#f0a830" />
        </>
      )}
      {(cfg.character === 'dapper' || cfg.character === 'bunny' || cfg.character === 'crown') && (
        <path
          d="M19 25C20 17.5 25 14.5 32 14.5C39 14.5 44 17.5 45 25C41.5 21.5 37 20 32 20C27 20 22.5 21.5 19 25Z"
          fill="#47332e"
        />
      )}
      {cfg.character === 'crown' && (
        <>
          <path d="M22 17L24.5 9.5L30 14L32 8L34 14L39.5 9.5L42 17H22Z" fill="#ffc857" stroke="#e09f2d" strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="32" cy="14" r="1.4" fill="#ff7597" />
        </>
      )}

      {/* Rosy Cheeks */}
      <ellipse cx="22.8" cy="33.2" rx="3.2" ry="1.9" fill="#ff9eb5" fillOpacity="0.72" />
      <ellipse cx="41.2" cy="33.2" rx="3.2" ry="1.9" fill="#ff9eb5" fillOpacity="0.72" />

      {/* Sparkly Eyes */}
      <circle cx="26.2" cy="29.5" r="2.5" fill="#3a2420" />
      <circle cx="37.8" cy="29.5" r="2.5" fill="#3a2420" />
      <circle cx="25.3" cy="28.6" r="0.9" fill="#ffffff" />
      <circle cx="36.9" cy="28.6" r="0.9" fill="#ffffff" />
      <circle cx="27.1" cy="30.3" r="0.45" fill="#ffffff" />
      <circle cx="38.7" cy="30.3" r="0.45" fill="#ffffff" />

      {/* Glasses Overlay */}
      {cfg.character === 'glasses' && (
        <>
          <circle cx="26" cy="29.5" r="4.6" fill="#ffffff" fillOpacity="0.28" stroke="#5c3a35" strokeWidth="1.6" />
          <circle cx="38" cy="29.5" r="4.6" fill="#ffffff" fillOpacity="0.28" stroke="#5c3a35" strokeWidth="1.6" />
          <path d="M30.6 29.5H33.4" stroke="#5c3a35" strokeWidth="1.5" />
        </>
      )}

      {/* Mouth / Facial Expression */}
      {(cfg.character === 'kitty' || cfg.character === 'bunny') && (
        <path
          d="M28.5 34.2Q30.2 36.2 32 34.4Q33.8 36.2 35.5 34.2"
          stroke="#7a4438"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {cfg.character === 'glasses' && (
        <path
          d="M28.5 35.2C30.2 37.2 33.8 37.2 35.5 35.2"
          stroke="#7a4438"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
      {(cfg.character === 'bearcap' || cfg.character === 'crown') && (
        <path
          d="M27.5 34.2C29.3 37.4 34.7 37.4 36.5 34.2Z"
          fill="#ff8fab"
          stroke="#7a4438"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      )}
      {cfg.character === 'dapper' && (
        <>
          <path
            d="M26.5 33.8C28.3 32.1 30.8 32.3 32 33.3C33.2 32.3 35.7 32.1 37.5 33.8"
            stroke="#47332e"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M29.5 36.2Q32 37.8 34.5 36.2"
            stroke="#7a4438"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Subtle Bot Antenna Indicator for AI seats */}
      {isAi && (
        <>
          <line x1="51" y1="18" x2="53.5" y2="10.5" stroke="#5c4799" strokeWidth="2" strokeLinecap="round" />
          <circle cx="53.5" cy="9.5" r="2.6" fill="#6ee7b7" stroke="#4a3780" strokeWidth="1.4" />
        </>
      )}
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
  const strokeColor = isUrgent ? '#f25c84' : '#ff9f43';
  const glowColor = isUrgent
    ? 'rgba(242, 92, 132, 0.85)'
    : 'rgba(255, 168, 76, 0.8)';

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-testid="avatar-timer-ring"
      className="pointer-events-none absolute -inset-[4px] h-[calc(100%+8px)] w-[calc(100%+8px)] -rotate-90"
    >
      {/* Subtle cream track */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="rgba(255, 250, 245, 0.72)"
        strokeWidth="6"
      />
      {/* Glowing radial countdown arc */}
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth="6.2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: 'stroke-dashoffset 220ms linear, stroke 200ms ease',
          filter: `drop-shadow(0 0 5px ${glowColor})`,
        }}
      />
    </svg>
  );
}

/**
 * Placeholder-first captured card stack:
 * - Starts with NO stack — only a subtle dashed empty card placeholder on the mat.
 * - Once tricks are won, grows into a starry-lavender stacked card deck
 *   showing ONLY the accumulated points in crisp high-contrast numerals.
 */
function CapturedStack({
  seatIndex,
  capturedPoints,
  tricksWon,
  mini = false,
  className = '',
  lang = DEFAULT_LANG,
}: {
  seatIndex: number;
  capturedPoints: number;
  tricksWon: number;
  mini?: boolean;
  className?: string;
  lang?: Lang;
}) {
  const isEmpty = capturedPoints === 0 && tricksWon === 0;
  const shownNum = formatNum(capturedPoints, lang);
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
          aria-label={`Captured points: ${shownNum}`}
          className={`inline-flex h-[22px] w-[17px] items-center justify-center rounded-[6px] border border-dashed border-[#c79ba6]/65 bg-[#fff5f0]/65 ${className}`}
        />
      );
    }

    return (
      <div
        key={capturedPoints}
        data-testid={`captured-stack-${seatIndex}`}
        data-empty="false"
        aria-label={`Captured points: ${shownNum}`}
        className={`animate-points-pop relative inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-[7px] border border-[#fff8f2] bg-gradient-to-b from-[#8b7fd0] to-[#6357a8] px-1.5 text-[11px] font-black tabular-nums leading-none text-white shadow-[0_2px_0_#ffe9dc,0_4px_7px_rgba(96,72,128,0.3)] ${className}`}
      >
        {shownNum}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        data-testid={`captured-stack-${seatIndex}`}
        data-empty="true"
        aria-label={`Captured points: ${shownNum}`}
        className={`relative flex items-center justify-center ${className}`}
      >
        <div className="flex h-[62px] w-[46px] items-center justify-center rounded-[11px] border-2 border-dashed border-[#fffaf2]/80 bg-[#fffaf2]/28 transition-all duration-300 lg:h-[70px] lg:w-[52px]">
          <div className="h-[72%] w-[68%] rounded-[6px] border border-dashed border-[#fffaf2]/55" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`captured-stack-${seatIndex}`}
      data-empty="false"
      aria-label={`Captured points: ${shownNum}`}
      className={`relative flex items-center justify-center ${className}`}
    >
      {/* Portrait starry-lavender stacked card deck growing thicker with tricks won */}
      <div
        key={capturedPoints}
        className={`captured-deck-3d animate-points-pop relative flex h-[62px] w-[46px] items-center justify-center rounded-[11px] lg:h-[70px] lg:w-[52px] ${depthClass}`}
      >
        {/* Inner cream card filigree frame */}
        <div className="pointer-events-none absolute inset-[3.5px] rounded-[7px] border border-dashed border-[#fff5e4]/50" />
        {/* Crisp high-contrast accumulated points numeral only */}
        <span className="relative z-10 rounded px-1.5 py-0.5 text-[16px] font-black tabular-nums leading-none tracking-tight text-white drop-shadow-[0_1.5px_2px_rgba(45,32,82,0.55)] lg:text-[18px]">
          {shownNum}
        </span>
      </div>
    </div>
  );
}

/**
 * Purely visual fanned starry cards representing an opponent's remaining hand.
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
              className="navy-card-back h-[20px] w-[14px] rounded-[4px] transition-transform duration-300"
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
  isHost: _isHost,
  isActiveTurn,
  isSpeaking,
  compactMobile = false,
  turnProgress = null,
  isTimerUrgent = false,
  maskCall = false,
  displayedCapturedPoints,
  displayedTricksWon,
  visibleHandCount,
  rank = null,
  lang = DEFAULT_LANG,
}: SeatHubProps) {
  void _isHost;
  const t = TEXTS[lang];
  const fallbackName =
    lang === 'bn'
      ? `সিট ${formatNum(seat.seatIndex + 1, lang)}`
      : `Seat ${seat.seatIndex + 1}`;
  const displayName = localizeDisplayName(seat.username || fallbackName, lang);
  const remainingCards =
    visibleHandCount !== undefined
      ? Math.min(seat.hand.length, visibleHandCount)
      : seat.hand.length;
  const shownPoints = displayedCapturedPoints ?? seat.capturedPoints;
  const shownTricks = displayedTricksWon ?? seat.tricksWon;

  const callLabel =
    seat.call === null ? '--' : maskCall ? '✓' : formatNum(seat.call, lang);
  const scoreLabel = formatNum(seat.totalScore, lang);
  const callMade =
    !maskCall && seat.call !== null && shownPoints >= seat.call;

  const idleRingClasses = isSpeaking
    ? 'ring-2 ring-emerald-400'
    : !isActiveTurn
      ? rank === 1
        ? 'ring-2 ring-[#ffc857] shadow-[0_0_12px_rgba(255,200,87,0.5)]'
        : 'ring-2 ring-[#fff8f2] shadow-sm'
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
          className="glass-pill flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1 sm:gap-2.5 sm:px-3 sm:py-1.5"
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
            {rank != null && rank >= 1 && (
              <span className="absolute -right-1 -top-1 z-10 scale-90">
                <RankBadge
                  rank={rank}
                  variant="avatar"
                  lang={lang}
                  testId={`seat-rank-badge-${seat.seatIndex}`}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="max-w-[70px] truncate text-[11px] font-bold text-[#4a2e2b] sm:max-w-[82px] sm:text-xs">
                {displayName}
                {isMe ? t.meTag : ''}
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
                lang={lang}
              />
            </div>

            <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[9.5px] font-semibold text-[#7d5a58] sm:text-[10px]">
              <span
                title={t.callWord}
                aria-label={`${t.callWord} ${callLabel}`}
                className={`inline-flex items-center gap-0.5 ${callMade ? 'font-bold text-[#228b5b]' : ''}`}
              >
                <Target className="h-2.5 w-2.5 shrink-0 text-[#34b37e]" aria-hidden="true" />
                {callLabel}
              </span>
              <span
                title={t.scoreWord}
                aria-label={`${t.scoreWord} ${scoreLabel}`}
                className={`inline-flex items-center gap-0.5 ${seat.totalScore < 0 ? 'font-bold text-[#d94f72]' : ''}`}
              >
                <Trophy className="h-2.5 w-2.5 shrink-0 text-[#f59e0b]" aria-hidden="true" />
                {scoreLabel}
              </span>
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
        className="glass-pill flex w-[60px] flex-col items-center gap-1 rounded-[22px] px-1 py-1.5 text-center sm:w-[68px] sm:px-1.5 sm:py-2"
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
          {rank != null && rank >= 1 && (
            <span className="absolute -right-1 -top-1 z-10 scale-90">
              <RankBadge
                rank={rank}
                variant="avatar"
                lang={lang}
                testId={`seat-rank-badge-${seat.seatIndex}`}
              />
            </span>
          )}
        </div>

        <span className="w-full truncate text-[10.5px] font-bold leading-tight text-[#4a2e2b] sm:text-[11px]">
          {displayName}
        </span>

        {/* Purely visual mini card fan — zero numbers */}
        <OpponentNavyFan
          position={position}
          remainingCards={remainingCards}
          mini
        />

        <div className="flex flex-col gap-0.5 text-[8.5px] font-semibold leading-tight text-[#7d5a58] sm:text-[9px]">
          <span
            title={t.callWord}
            aria-label={`${t.callWord} ${callLabel}`}
            className={`inline-flex items-center justify-center gap-0.5 ${callMade ? 'font-bold text-[#228b5b]' : ''}`}
          >
            <Target className="h-2.5 w-2.5 shrink-0 text-[#34b37e]" aria-hidden="true" />
            {callLabel}
          </span>
          <span
            title={t.scoreWord}
            aria-label={`${t.scoreWord} ${scoreLabel}`}
            className={`inline-flex items-center justify-center gap-0.5 ${seat.totalScore < 0 ? 'font-bold text-[#d94f72]' : ''}`}
          >
            <Trophy className="h-2.5 w-2.5 shrink-0 text-[#f59e0b]" aria-hidden="true" />
            {scoreLabel}
          </span>
        </div>

        <CapturedStack
          seatIndex={seat.seatIndex}
          capturedPoints={shownPoints}
          tricksWon={shownTricks}
          mini
          lang={lang}
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
          className={`relative h-[64px] w-[64px] overflow-hidden rounded-full border-[3px] border-[#fff9f3] shadow-md transition-all duration-200 lg:h-[72px] lg:w-[72px] ${idleRingClasses}`}
        >
          <SeatAvatarGraphic seat={seat} size={72} />
        </div>

        <AvatarTimerRing
          isActiveTurn={isActiveTurn}
          isSpeaking={isSpeaking}
          turnProgress={turnProgress}
          isUrgent={isTimerUrgent}
        />

        {rank != null && rank >= 1 && (
          <span className="absolute -right-1 -top-1 z-10">
            <RankBadge
              rank={rank}
              variant="avatar"
              lang={lang}
              testId={`seat-rank-badge-${seat.seatIndex}`}
            />
          </span>
        )}

        {isMe && (
          <span
            aria-label={isSpeaking ? t.openMicOn : t.openMicMuted}
            className={`absolute -bottom-0.5 -right-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#fff9f3] shadow-sm ${
              isSpeaking
                ? 'bg-[#34b37e] text-white'
                : 'bg-[#fff3ec] text-[#7d5a58]'
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
            title={t.offline}
            className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#f25c84] text-white ring-2 ring-[#fff9f3]"
          >
            <WifiOff className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="mt-1.5 text-center">
        <span className="glass-pill inline-block max-w-[134px] truncate rounded-full px-2.5 py-0.5 text-xs font-bold text-[#4a2e2b]">
          {displayName}
          {isMe ? t.meTag : ''}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1.5">
        <span
          title={t.callWord}
          aria-label={`${t.callWord} ${callLabel}`}
          className={`glass-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
            callMade
              ? '!border-[#52b788] !bg-[#e6f9ef] text-[#1f7a51]'
              : 'text-[#5c3d3a]'
          }`}
        >
          <Target className="h-3 w-3 shrink-0 text-[#34b37e]" aria-hidden="true" />
          <span>{callLabel}</span>
        </span>
        <span
          title={t.scoreWord}
          aria-label={`${t.scoreWord} ${scoreLabel}`}
          className={`glass-pill inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            seat.totalScore < 0 ? 'text-[#d94f72]' : 'text-[#5c3d3a]'
          }`}
        >
          <Trophy className="h-3 w-3 shrink-0 text-[#f59e0b]" aria-hidden="true" />
          <span>{scoreLabel}</span>
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
            lang={lang}
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
            lang={lang}
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
            lang={lang}
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
        lang={lang}
      />
    </div>
  );
}

export const SeatHub = React.memo(SeatHubInner);

export default SeatHub;
