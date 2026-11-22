'use client';

import React from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { getSeatAvatarSrc } from '@/components/SeatHub';
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
      className="fixed inset-0 z-50 flex flex-col bg-[#100a06]/96 text-[#faf3e6] backdrop-blur-xl"
    >
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#1a110b]/95 px-5 py-4 sm:px-10">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/15 text-amber-300">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="title-gold-3d font-bangla text-2xl font-extrabold leading-tight sm:text-3xl">
              স্কোরবোর্ড — একশো HUNDRED
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
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-extrabold text-[#1b1108] shadow-lg transition hover:from-amber-200 hover:to-amber-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Table</span>
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-5 sm:p-10">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* 4-Player Summary Standings Cards */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {state.seats.map((seat) => (
              <div
                key={seat.seatIndex}
                className="glass-pill flex items-center gap-3 rounded-2xl p-4"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-amber-300/60 bg-[#18261f]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSeatAvatarSrc(seat)}
                    alt={seat.username}
                    className="h-full w-full object-cover object-top"
                  />
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

          {/* Rounds 1–10 Breakdown Table */}
          <div className="overflow-x-auto rounded-3xl border border-white/15 bg-[#17100a]/90 shadow-2xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/15 bg-white/5 text-[#e6d5b8]">
                  <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-amber-300">
                    Round
                  </th>
                  {state.seats.map((seat) => (
                    <th key={seat.seatIndex} className="px-5 py-3.5">
                      <div className="font-bold text-white">
                        {seat.username}
                      </div>
                      <div className="text-[11px] font-normal text-[#cbb89d]">
                        Call / Captured / Total
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
                      className={`border-b border-white/8 transition ${
                        isCurrent ? 'bg-amber-400/8' : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="px-5 py-3 font-bold text-amber-300">
                        Round {roundNum}
                      </td>
                      {state.seats.map((seat) => {
                        const entry = record?.entries.find(
                          (e) => e.seatIndex === seat.seatIndex,
                        );
                        if (!entry) {
                          return (
                            <td
                              key={seat.seatIndex}
                              className="px-5 py-3 text-[#7a6852]"
                            >
                              —
                            </td>
                          );
                        }
                        const hit = entry.capturedPoints >= entry.call;
                        return (
                          <td key={seat.seatIndex} className="px-5 py-3">
                            <span className="font-semibold text-amber-200">
                              {entry.call}
                            </span>
                            <span className="mx-1.5 text-white/25">/</span>
                            <span
                              className={`font-bold ${
                                hit ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {entry.capturedPoints}
                            </span>
                            <span className="mx-1.5 text-white/25">/</span>
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
