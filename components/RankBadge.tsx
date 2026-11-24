'use client';

import React from 'react';
import { Award, Crown, Medal, Sprout } from 'lucide-react';
import { DEFAULT_LANG, TEXTS, type Lang } from '@/lib/i18n';

export type RankIconName = 'crown' | 'medal' | 'award' | 'sprout';

export interface RankVisualConfig {
  iconName: RankIconName;
  pillClasses: string;
  avatarBadgeClasses: string;
  rowHighlightClasses: string;
}

export function getRankVisualConfig(rank: number): RankVisualConfig {
  switch (rank) {
    case 1:
      return {
        iconName: 'crown',
        pillClasses:
          'border-[#f5b935] bg-gradient-to-r from-[#ffe68a] to-[#ffd05b] text-[#5c3605] shadow-[0_2px_0_#e0a624]',
        avatarBadgeClasses:
          'border-[#fff9e6] bg-gradient-to-br from-[#ffe27a] to-[#ffb703] text-[#5c3605] ring-2 ring-[#ffc857]/60',
        rowHighlightClasses: 'bg-[#fff9e0]',
      };
    case 2:
      return {
        iconName: 'medal',
        pillClasses:
          'border-[#b8c7eb] bg-gradient-to-r from-[#eff3ff] to-[#dce5fc] text-[#32467a] shadow-[0_2px_0_#c2d0f2]',
        avatarBadgeClasses:
          'border-white bg-gradient-to-br from-[#eef2ff] to-[#cbd5e1] text-[#32467a] ring-2 ring-[#b8c7eb]/70',
        rowHighlightClasses: 'bg-[#f8faff]',
      };
    case 3:
      return {
        iconName: 'award',
        pillClasses:
          'border-[#edb693] bg-gradient-to-r from-[#ffece0] to-[#ffd7bf] text-[#7c3c16] shadow-[0_2px_0_#e3a986]',
        avatarBadgeClasses:
          'border-[#fff4eb] bg-gradient-to-br from-[#ffd6ba] to-[#e79968] text-[#5c280a] ring-2 ring-[#edb693]/70',
        rowHighlightClasses: 'bg-[#fffaf6]',
      };
    default:
      return {
        iconName: 'sprout',
        pillClasses:
          'border-[#ecc5d1] bg-[#fff0f4] text-[#9e3f60] shadow-[0_2px_0_#e7bcc9]',
        avatarBadgeClasses:
          'border-white bg-[#ffe8ef] text-[#9e3f60] ring-1 ring-[#ecc5d1]',
        rowHighlightClasses: 'bg-white',
      };
  }
}

export interface RankBadgeProps {
  rank: number;
  variant?: 'pill' | 'avatar' | 'compact';
  lang?: Lang;
  testId?: string;
}

export function RankBadge({
  rank,
  variant = 'pill',
  lang = DEFAULT_LANG,
  testId,
}: RankBadgeProps) {
  const t = TEXTS[lang];
  const visual = getRankVisualConfig(rank);
  const label = t.rankOrdinal(rank);

  const renderIcon = (sizeClass: string) => {
    switch (visual.iconName) {
      case 'crown':
        return <Crown className={sizeClass} aria-hidden="true" />;
      case 'medal':
        return <Medal className={sizeClass} aria-hidden="true" />;
      case 'award':
        return <Award className={sizeClass} aria-hidden="true" />;
      case 'sprout':
        return <Sprout className={sizeClass} aria-hidden="true" />;
    }
  };

  if (variant === 'avatar') {
    return (
      <span
        data-testid={testId ?? `rank-avatar-badge-${rank}`}
        data-rank={rank}
        data-rank-icon={visual.iconName}
        title={label}
        aria-label={label}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm ${visual.avatarBadgeClasses}`}
      >
        {renderIcon('h-2.5 w-2.5')}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span
        data-testid={testId ?? `rank-badge-${rank}`}
        data-rank={rank}
        data-rank-icon={visual.iconName}
        title={label}
        aria-label={label}
        className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-black leading-none ${visual.pillClasses}`}
      >
        {renderIcon('h-3 w-3 shrink-0')}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      data-testid={testId ?? `rank-badge-${rank}`}
      data-rank={rank}
      data-rank-icon={visual.iconName}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black leading-tight ${visual.pillClasses}`}
    >
      {renderIcon('h-3.5 w-3.5 shrink-0')}
      <span>{label}</span>
    </span>
  );
}

export default RankBadge;
