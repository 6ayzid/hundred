'use client';

import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { SeatAvatarGraphic } from '@/components/SeatHub';
import { TOTAL_ROUNDS } from '@/lib/gameEngine';
import type { GameState } from '@/lib/types';

export interface ScoreboardModalProps {
  state: GameState;
  onClose: () => void;
}

export function ScoreboardModal({ state, onClose }: ScoreboardModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full Scoreboard"
      data-testid="scoreboard-modal"
      className="fixed inset-0 z-50 flex flex-col bg-[#120c08]/98 text-[#faf3e6] backdrop-blur-md"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#1a110b] px-4 py-3.5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-400/15 text-amber-300">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-bangla text-xl font-extrabold leading-tight text-[#faf3e6] sm:text-2xl">
              স্কোরবোর্ড — হান্ড্রেট{' '}
              <span className="text-[#e0a943]">HUNDRED</span>
            </h2>
            <p className="text-xs font-medium text-[#d7c4a3]">
              Round {state.round} of {TOTAL_ROUNDS} • Room {state.roomCode}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="back-to-table-btn"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-extrabold text-[#1b1108] transition hover:bg-amber-300 sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Table</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {state.seats.map((seat) => (
              <div
                key={seat.seatIndex}
                className="glass-pill flex items-center gap-3 rounded-2xl p-3.5"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/25">
                  <SeatAvatarGraphic seat={seat} size={44} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-white">
                    {seat.username}
                  </div>
                  <div className="text-xl font-black text-amber-300">
                    {seat.totalScore}
                  </div>
                  <div className="text-[11px] text-[#cbb89d]">
                    Call: {seat.call ?? '--'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/15 bg-[#17100a]">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/15 bg-white/5 text-[#e6d5b8]">
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-amber-300">
                    Round
                  </th>
                  {state.seats.map((seat) => (
                    <th key={seat.seatIndex} className="px-4 py-3">
                      <div className="font-bold text-white">
                        {seat.username}
                      </div>
                      <div className="text-[10px] font-normal text-[#cbb89d]">
                        Call / Won / Total
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
                      className={`border-b border-white/8 ${
                        isCurrent ? 'bg-amber-400/10' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-bold text-amber-300">
                        R{roundNum}
                      </td>
                      {state.seats.map((seat) => {
                        const entry = record?.entries.find(
                          (e) => e.seatIndex === seat.seatIndex,
                        );
                        if (!entry) {
                          return (
                            <td
                              key={seat.seatIndex}
                              className="px-4 py-2.5 text-[#7a6852]"
                            >
                              —
                            </td>
                          );
                        }
                        const hit = entry.capturedPoints >= entry.call;
                        return (
                          <td key={seat.seatIndex} className="px-4 py-2.5">
                            <span className="font-semibold text-amber-200">
                              {entry.call}
                            </span>
                            <span className="mx-1 text-white/25">/</span>
                            <span
                              className={`font-bold ${
                                hit ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {entry.capturedPoints}
                            </span>
                            <span className="mx-1 text-white/25">/</span>
                            <span className="font-extrabold text-white">
                              {entry.totalAfter}
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
