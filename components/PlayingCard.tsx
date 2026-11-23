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
  xs: 'h-14 w-9 rounded-[5px] text-lg',
  sm: 'h-20 w-14 rounded-[7px] text-2xl',
  md: 'h-28 w-20 sm:h-32 sm:w-24 rounded-[9px] text-4xl',
  lg: 'h-32 w-24 sm:h-36 sm:w-28 rounded-[10px] text-5xl',
  hand: 'h-[126px] w-[86px] sm:h-[154px] sm:w-[112px] lg:h-[172px] lg:w-[128px] rounded-[10px] text-[48px] sm:text-[62px] lg:text-[68px]',
};

const LANDSCAPE_SIZE_CLASSES: Record<
  NonNullable<PlayingCardProps['size']>,
  string
> = {
  xs: 'h-9 w-14 rounded-[5px] text-base',
  sm: 'h-14 w-22 rounded-[7px] text-2xl',
  md: 'h-[74px] w-[116px] sm:h-[88px] sm:w-[140px] rounded-[8px] text-[44px] sm:text-[54px]',
  lg: 'h-[86px] w-[136px] sm:h-[96px] sm:w-[156px] rounded-[9px] text-[50px] sm:text-[60px]',
  hand: 'h-[86px] w-[136px] rounded-[9px] text-[52px]',
};

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
        <div className="h-[80%] w-[78%] rounded-[3px] border border-white/15 bg-[#182d5b]/45" />
      </div>
    );
  }

  const interactiveClasses = onClick
    ? playable && !disabled
      ? 'cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-7 hover:scale-[1.05] hover:shadow-[0_22px_36px_rgba(0,0,0,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 active:-translate-y-2 active:scale-[0.98]'
      : 'cursor-default opacity-95'
    : '';

  const stateClasses = [
    selected ? '-translate-y-6 ring-2 ring-amber-300 shadow-2xl' : '',
    highlighted
      ? 'ring-[3px] ring-amber-300 shadow-[0_0_26px_rgba(251,191,36,0.75)]'
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
      <span
        className="pointer-events-none relative z-10 font-caveat font-bold leading-none tracking-[-0.02em] text-[#11318a] -rotate-[2.5deg] select-none"
        style={{
          textShadow:
            '0 0.5px 0 rgba(17,49,138,0.28), 0 1px 1px rgba(17,49,138,0.12)',
        }}
      >
        {value}
      </span>
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
