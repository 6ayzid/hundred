'use client';

import React, { useState } from 'react';
import type { CardValue } from '@/lib/types';

export interface PlayingCardProps {
  value?: CardValue;
  faceDown?: boolean;
  orientation?: 'portrait' | 'landscape';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hand';
  useCustomScan?: boolean;
  playable?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  testId?: string;
}

const PORTRAIT_SIZE_CLASSES: Record<
  NonNullable<PlayingCardProps['size']>,
  string
> = {
  xs: 'h-14 w-9 rounded-[8px] text-lg',
  sm: 'h-20 w-14 rounded-[11px] text-2xl',
  md: 'h-28 w-20 sm:h-32 sm:w-24 rounded-[14px] text-4xl',
  lg: 'h-32 w-24 sm:h-36 sm:w-28 rounded-[16px] text-5xl',
  hand: 'h-[126px] w-[86px] sm:h-[154px] sm:w-[112px] lg:h-[172px] lg:w-[128px] rounded-[16px] text-[48px] sm:text-[62px] lg:text-[68px]',
};

const LANDSCAPE_SIZE_CLASSES: Record<
  NonNullable<PlayingCardProps['size']>,
  string
> = {
  xs: 'h-9 w-14 rounded-[8px] text-base',
  sm: 'h-14 w-22 rounded-[11px] text-2xl',
  md: 'h-[74px] w-[116px] sm:h-[88px] sm:w-[140px] rounded-[13px] text-[44px] sm:text-[54px]',
  lg: 'h-[86px] w-[136px] sm:h-[96px] sm:w-[156px] rounded-[15px] text-[50px] sm:text-[60px]',
  hand: 'h-[86px] w-[136px] rounded-[15px] text-[52px]',
};

function getCuteCardAccent(value: CardValue): {
  ink: string;
  frame: string;
  charm: string;
  kind: 'star' | 'heart' | 'sparkle' | 'clover';
} {
  if (value === 100) {
    return {
      ink: '#d96b27',
      frame: 'rgba(255, 193, 77, 0.55)',
      charm: '#f59e0b',
      kind: 'star',
    };
  }
  if (value === 1) {
    return {
      ink: '#2d8a64',
      frame: 'rgba(110, 207, 158, 0.55)',
      charm: '#34b37e',
      kind: 'clover',
    };
  }
  if (value >= 75) {
    return {
      ink: '#c94a72',
      frame: 'rgba(255, 143, 171, 0.5)',
      charm: '#ff7597',
      kind: 'heart',
    };
  }
  if (value >= 45) {
    return {
      ink: '#5e4fa2',
      frame: 'rgba(155, 142, 224, 0.48)',
      charm: '#8b7fd0',
      kind: 'sparkle',
    };
  }
  return {
    ink: '#3a6ea5',
    frame: 'rgba(126, 178, 240, 0.48)',
    charm: '#6ca0e6',
    kind: 'sparkle',
  };
}

function CornerCharm({
  kind,
  color,
  className,
}: {
  kind: 'star' | 'heart' | 'sparkle' | 'clover';
  color: string;
  className?: string;
}) {
  if (kind === 'heart') {
    return (
      <svg viewBox="0 0 16 16" fill={color} aria-hidden="true" className={className}>
        <path d="M8 14s-5.2-3.2-6.2-6.3C1.1 5.3 2.7 3 5.1 3c1.3 0 2.3.7 2.9 1.6C8.6 3.7 9.6 3 10.9 3c2.4 0 4 2.3 3.3 4.7C13.2 10.8 8 14 8 14Z" />
      </svg>
    );
  }
  if (kind === 'star') {
    return (
      <svg viewBox="0 0 16 16" fill={color} aria-hidden="true" className={className}>
        <path d="M8 1.2l1.9 4.2 4.6.5-3.4 3.1.9 4.5L8 11.2 4 13.5l.9-4.5-3.4-3.1 4.6-.5L8 1.2Z" />
      </svg>
    );
  }
  if (kind === 'clover') {
    return (
      <svg viewBox="0 0 16 16" fill={color} aria-hidden="true" className={className}>
        <circle cx="8" cy="4.8" r="2.7" />
        <circle cx="5.2" cy="8.4" r="2.7" />
        <circle cx="10.8" cy="8.4" r="2.7" />
        <path d="M8 9.5v4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill={color} aria-hidden="true" className={className}>
      <path d="M8 1.5L9.7 6.3L14.5 8L9.7 9.7L8 14.5L6.3 9.7L1.5 8L6.3 6.3L8 1.5Z" />
    </svg>
  );
}

function PlayingCardInner({
  value,
  faceDown = false,
  orientation = 'portrait',
  size = 'md',
  useCustomScan = false,
  playable = false,
  selected = false,
  highlighted = false,
  disabled = false,
  onClick,
  className = '',
  ariaLabel,
  testId,
}: PlayingCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass =
    orientation === 'landscape'
      ? LANDSCAPE_SIZE_CLASSES[size]
      : PORTRAIT_SIZE_CLASSES[size];

  if (faceDown || value === undefined) {
    return (
      <div
        aria-label={ariaLabel ?? 'Face-down card'}
        data-testid={testId ?? 'card-back'}
        className={`navy-card-back bg-[#13223b] relative flex select-none items-center justify-center ${sizeClass} ${className}`}
      >
        <div className="flex h-[80%] w-[78%] items-center justify-center rounded-[7px] border border-dashed border-[#fff5e4]/45 bg-white/10">
          <svg
            viewBox="0 0 16 16"
            fill="#ffe599"
            aria-hidden="true"
            className="h-3.5 w-3.5 opacity-85"
          >
            <path d="M8 1.5L9.7 6.3L14.5 8L9.7 9.7L8 14.5L6.3 9.7L1.5 8L6.3 6.3L8 1.5Z" />
          </svg>
        </div>
      </div>
    );
  }

  const accent = getCuteCardAccent(value);
  const showCornerCharms = size !== 'xs';

  const interactiveClasses = onClick
    ? playable && !disabled
      ? 'cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-7 hover:scale-[1.07] hover:-rotate-1 hover:shadow-[0_18px_32px_rgba(242,106,141,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff7597] active:-translate-y-2 active:scale-[0.97]'
      : 'cursor-default opacity-95'
    : '';

  const stateClasses = [
    selected ? '-translate-y-6 ring-2 ring-[#ff7597] shadow-2xl' : '',
    highlighted
      ? 'ring-[3px] ring-[#ffc857] shadow-[0_0_24px_rgba(255,200,87,0.85)]'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const baseClass = `visiting-card-paper bg-[#faf7f0] relative flex select-none items-center justify-center overflow-hidden ${sizeClass} ${interactiveClasses} ${stateClasses} ${className}`;

  const content =
    useCustomScan && !imgFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/cards/${value}.png`}
        alt={String(value)}
        onError={() => setImgFailed(true)}
        className="pointer-events-none relative z-10 h-[72%] w-[80%] object-contain select-none"
      />
    ) : (
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[4px] rounded-[10px] border border-dashed"
          style={{ borderColor: accent.frame }}
        />
        {showCornerCharms && (
          <>
            <CornerCharm
              kind={accent.kind}
              color={accent.charm}
              className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 opacity-75 sm:h-3 sm:w-3"
            />
            <CornerCharm
              kind={accent.kind}
              color={accent.charm}
              className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 opacity-75 sm:h-3 sm:w-3"
            />
          </>
        )}
        <span
          className="pointer-events-none relative z-10 font-caveat font-bold leading-none tracking-[-0.02em] -rotate-[2deg] select-none"
          style={{
            color: accent.ink,
            textShadow: '0 1px 0 rgba(255,255,255,0.85)',
          }}
        >
          {value}
        </span>
      </>
    );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !playable}
        aria-label={ariaLabel ?? `Play card ${value}`}
        data-testid={testId ?? `hand-card-${value}`}
        data-card-value={value}
        className={baseClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      aria-label={ariaLabel ?? `Card ${value}`}
      data-testid={testId ?? `table-card-${value}`}
      data-card-value={value}
      className={baseClass}
    >
      {content}
    </div>
  );
}

export const PlayingCard = React.memo(PlayingCardInner);

export default PlayingCard;
