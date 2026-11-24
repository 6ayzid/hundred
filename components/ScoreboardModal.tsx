'use client';

import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { RankBadge } from '@/components/RankBadge';
import { SeatAvatarGraphic } from '@/components/SeatHub';
import { TOTAL_ROUNDS } from '@/lib/gameEngine';
import {
  DEFAULT_LANG,
  formatNum,
  localizeDisplayName,
  TEXTS,
  type Lang,
} from '@/lib/i18n';
import type { GameState } from '@/lib/types';

export interface ScoreboardModalProps {
  state: GameState;
  mySeatIndex?: number | null;
  onClose: () => void;
  lang?: Lang;
}

export function ScoreboardModal({
  state,
  mySeatIndex = null,
  onClose,
  lang = DEFAULT_LANG,
}: ScoreboardModalProps) {
  const t = TEXTS[lang];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.scoreboardHeader}
      data-testid="scoreboard-modal"
      className="pati-table-surface animate-panel-enter fixed inset-0 z-50 flex flex-col text-[#4a2e2b]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#f4cbd5] bg-[#fffaf6]/95 px-4 py-3.5 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-[#ffd88a] bg-[#fff5d6] text-[#e69500]">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-bangla text-xl font-extrabold leading-tight text-[#4a2e2b] sm:text-2xl">
              {t.scoreboardHeader}{' '}
              <span className="text-[#f25c84]">HUNDRED</span>
            </h2>
            <p className="text-xs font-semibold text-[#8c6460]">
              {t.scoreboardSub(state.round, TOTAL_ROUNDS, state.roomCode)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="back-to-table-btn"
          className="inline-flex items-center gap-2 rounded-full bg-[#ff7597] px-4 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#d94f72] transition hover:bg-[#ff6188] active:translate-y-[1px] active:shadow-[0_1px_0_#d94f72] sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t.backToTable}</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...state.seats]
              .sort((a, b) => b.totalScore - a.totalScore || a.seatIndex - b.seatIndex)
              .map((seat, rankIdx, sorted) => {
                const rank =
                  rankIdx > 0 && seat.totalScore === sorted[rankIdx - 1].totalScore
                    ? sorted.findIndex((s) => s.totalScore === seat.totalScore) + 1
                    : rankIdx + 1;
                const hideCall =
                  state.phase === 'BIDDING' && seat.seatIndex !== mySeatIndex;
                const callDisplay =
                  seat.call === null
                    ? '--'
                    : hideCall
                      ? '✓'
                      : formatNum(seat.call, lang);
                const seatName = localizeDisplayName(seat.username, lang);
                return (
                  <div
                    key={seat.seatIndex}
                    data-testid={`scoreboard-rank-${rank}`}
                    className={`glass-pill relative flex items-center gap-3 rounded-3xl p-3.5 ${
                      rank === 1 ? 'ring-2 ring-[#ffc857]' : ''
                    }`}
                  >
                    <div className="absolute right-2.5 top-2.5">
                      <RankBadge
                        rank={rank}
                        variant="compact"
                        lang={lang}
                        testId={`scoreboard-rank-badge-${seat.seatIndex}`}
                      />
                    </div>
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-[#ffe3ea]">
                      <SeatAvatarGraphic seat={seat} size={44} />
                    </div>
                    <div className="min-w-0 pr-10">
                      <div className="truncate text-sm font-bold text-[#4a2e2b]">
                        {seatName}
                      </div>
                      <div
                        className={`text-xl font-black ${
                          seat.totalScore < 0 ? 'text-[#d94f72]' : 'text-[#f25c84]'
                        }`}
                      >
                        {formatNum(seat.totalScore, lang)}
                      </div>
                      <div className="text-[11px] font-semibold text-[#8c6460]">
                        {t.callPrefix} {callDisplay}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="glass-pill overflow-x-auto rounded-3xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b-2 border-[#f4d4dc] bg-[#fff5f7] text-[#6e4946]">
                  <th className="px-4 py-3 font-extrabold uppercase tracking-wider text-[#d94f72]">
                    {t.colRound}
                  </th>
                  {state.seats.map((seat) => (
                    <th key={seat.seatIndex} className="px-4 py-3">
                      <div className="font-bold text-[#4a2e2b]">
                        {localizeDisplayName(seat.username, lang)}
                      </div>
                      <div className="text-[10px] font-semibold text-[#9e7774]">
                        {t.colCallWonTotal}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: TOTAL_ROUNDS }).map((_, idx) => {
                  const roundNum = idx + 1;
                  const record = state.roundHistory.find(
                    (r) => r.round === roundNum,
                  );
                  const isCurrent = roundNum === state.round;
                  return (
                    <tr
                      key={roundNum}
                      className={`border-b border-[#f8e4e9] last:border-b-0 ${
                        isCurrent ? 'bg-[#fff8e0]/75' : 'bg-white/60'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-extrabold text-[#d94f72]">
                        {formatNum(roundNum, lang)}
                      </td>
                      {state.seats.map((seat) => {
                        const entry = record?.entries.find(
                          (e) => e.seatIndex === seat.seatIndex,
                        );
                        if (!entry) {
                          return (
                            <td
                              key={seat.seatIndex}
                              className="px-4 py-2.5 text-[#c9a8ad]"
                            >
                              —
                            </td>
                          );
                        }
                        const hit = entry.capturedPoints >= entry.call;
                        return (
                          <td key={seat.seatIndex} className="px-4 py-2.5">
                            <span className="font-bold text-[#c47d10]">
                              {formatNum(entry.call, lang)}
                            </span>
                            <span className="mx-1 text-[#d9b8bf]">/</span>
                            <span
                              className={`font-extrabold ${
                                hit ? 'text-[#289664]' : 'text-[#d94f72]'
                              }`}
                            >
                              {formatNum(entry.capturedPoints, lang)}
                            </span>
                            <span className="mx-1 text-[#d9b8bf]">/</span>
                            <span
                              className={`font-black ${
                                entry.totalAfter < 0
                                  ? 'text-[#d94f72]'
                                  : 'text-[#4a2e2b]'
                              }`}
                            >
                              {formatNum(entry.totalAfter, lang)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScoreboardModal;
