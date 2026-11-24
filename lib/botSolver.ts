import {
  DECK_CARDS,
  type CardValue,
  type GameState,
  type SeatIndex,
  type TrickPlay,
} from './types';

const CALL_STEP = 10;
const MIN_CALL = 50;
const MAX_CALL = 500;
const TOTAL_ROUNDS = 10;

export interface BotCallContext {
  round?: number;
  seatIndex?: SeatIndex;
  totalScores?: readonly number[];
  roundStarterSeat?: SeatIndex;
  botName?: string;
}

/**
 * Fast Fisher-Yates shuffle in-place.
 */
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Fast heuristic card choice used inside Monte Carlo rollouts.
 */
function chooseRolloutCard(
  hand: readonly CardValue[],
  currentTrick: readonly TrickPlay[],
  needed: number,
  trickNumber: number,
): CardValue {
  if (hand.length === 1) return hand[0];

  // Hand is kept sorted ascending
  if (needed <= 0) {
    // Call already met: dump highest under-card if following, else lowest
    if (currentTrick.length > 0) {
      let maxCard = 0;
      for (let i = 0; i < currentTrick.length; i += 1) {
        if (currentTrick[i].card > maxCard) maxCard = currentTrick[i].card;
      }
      for (let i = hand.length - 1; i >= 0; i -= 1) {
        if (hand[i] < maxCard) return hand[i];
      }
    }
    return hand[0];
  }

  if (currentTrick.length === 0) {
    const highest = hand[hand.length - 1];
    if (highest === 100 && (needed <= 130 || hand.length <= 3)) return highest;
    if (highest >= 90 && (needed >= 80 || hand.length <= 2)) return highest;
    if (highest >= 75 && trickNumber >= 3) return highest;
    return hand[0];
  }

  let maxCard = 0;
  let pot = 0;
  for (let i = 0; i < currentTrick.length; i += 1) {
    const c = currentTrick[i].card;
    pot += c;
    if (c > maxCard) maxCard = c;
  }

  // Find cheapest winner
  let cheapestWinnerIdx = -1;
  for (let i = 0; i < hand.length; i += 1) {
    if (hand[i] > maxCard) {
      cheapestWinnerIdx = i;
      break;
    }
  }

  if (cheapestWinnerIdx === -1) {
    return hand[0];
  }

  const cheapestWinner = hand[cheapestWinnerIdx];
  if (currentTrick.length === 3) {
    if (pot + cheapestWinner >= needed || pot >= 70) {
      return cheapestWinner;
    }
    return hand[0];
  }

  if (cheapestWinner >= 90 && pot >= 60) {
    return cheapestWinner;
  }
  if (pot >= 80) {
    return hand[hand.length - 1];
  }
  return hand[0];
}

/**
 * Simulates a full 5-trick round from Trick 1 given 4 sorted hands.
 * Returns capturedPoints for each of the 4 seats.
 */
function simulateFullRound(
  hands: [CardValue[], CardValue[], CardValue[], CardValue[]],
  starterSeat: SeatIndex,
  calls: readonly number[],
): [number, number, number, number] {
  const captured: [number, number, number, number] = [0, 0, 0, 0];
  let leader: SeatIndex = starterSeat;

  for (let trick = 1; trick <= 5; trick += 1) {
    const trickPlays: TrickPlay[] = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = ((leader + offset) % 4) as SeatIndex;
      const hand = hands[seat];
      const needed = Math.max(0, calls[seat] - captured[seat]);
      const chosen = chooseRolloutCard(hand, trickPlays, needed, trick);
      const idx = hand.indexOf(chosen);
      if (idx !== -1) hand.splice(idx, 1);
      trickPlays.push({ seatIndex: seat, card: chosen });
    }

    let winner = trickPlays[0];
    let pot = 0;
    for (let i = 0; i < trickPlays.length; i += 1) {
      pot += trickPlays[i].card;
      if (trickPlays[i].card > winner.card) {
        winner = trickPlays[i];
      }
    }
    captured[winner.seatIndex] += pot;
    leader = winner.seatIndex;
  }

  return captured;
}

/**
 * Computes a near-optimal bid using Monte Carlo rollouts + total-score risk adjustment.
 */
export function computeOptimalBotCall(
  hand: readonly CardValue[],
  existingCalls: readonly (number | null)[] = [],
  context?: BotCallContext,
): number {
  const validHand = hand.filter((c) => DECK_CARDS.includes(c)).sort((a, b) => a - b);
  if (validHand.length === 0) return 0;

  const handSet = new Set<CardValue>(validHand);
  const unknownPool = DECK_CARDS.filter((c) => !handSet.has(c));

  // Estimate opponent calls for simulation
  const simCalls: [number, number, number, number] = [100, 100, 100, 100];
  const botSeat: SeatIndex = context?.seatIndex ?? 0;
  for (let i = 0; i < 4; i += 1) {
    const c = existingCalls[i];
    if (typeof c === 'number' && Number.isFinite(c)) {
      simCalls[i] = c;
    }
  }

  const SIMULATIONS = 150;
  const capturedSamples = new Int32Array(SIMULATIONS);
  const hasOne = handSet.has(1);

  for (let s = 0; s < SIMULATIONS; s += 1) {
    const pool = [...unknownPool];
    shuffleInPlace(pool);

    const hands: [CardValue[], CardValue[], CardValue[], CardValue[]] = [
      [],
      [],
      [],
      [],
    ];
    hands[botSeat] = [...validHand];

    let cursor = 0;
    let starterSeat: SeatIndex = botSeat;
    for (let seat = 0; seat < 4; seat += 1) {
      if (seat === botSeat) continue;
      const oppHand = pool.slice(cursor, cursor + 5).sort((a, b) => a - b);
      cursor += 5;
      hands[seat] = oppHand;
      if (!hasOne && oppHand.includes(1)) {
        starterSeat = seat as SeatIndex;
      }
    }

    const captured = simulateFullRound(hands, starterSeat, simCalls);
    capturedSamples[s] = captured[botSeat];
  }

  // Compute risk factor from totalScore standings & round progress
  let riskFactor = 1.0; // >1 = more aggressive, <1 = more conservative
  const round = context?.round ?? 1;
  const totalScores = context?.totalScores;
  if (totalScores && totalScores.length === 4) {
    const myScore = totalScores[botSeat] ?? 0;
    let maxOppScore = 0;
    for (let i = 0; i < 4; i += 1) {
      if (i !== botSeat && (totalScores[i] ?? 0) > maxOppScore) {
        maxOppScore = totalScores[i] ?? 0;
      }
    }
    const diff = myScore - maxOppScore;
    const roundWeight = Math.min(1, round / TOTAL_ROUNDS);
    if (diff < -100) {
      // Behind: willing to take slightly higher-variance calls
      riskFactor = 1.0 + 0.18 * roundWeight;
    } else if (diff > 100) {
      // Ahead: protect the lead, avoid busting
      riskFactor = 1.0 - 0.18 * roundWeight;
    }
  }

  // Evaluate every valid call c in [0, 10, ..., 500]
  let bestCall = 0;
  let bestUtility = -Infinity;

  for (let c = MIN_CALL; c <= MAX_CALL; c += CALL_STEP) {
    let hits = 0;
    for (let s = 0; s < SIMULATIONS; s += 1) {
      if (capturedSamples[s] >= c) hits += 1;
    }
    const probHit = hits / SIMULATIONS;
    // Expected score with slight risk-adjusted utility
    const bustPenalty = (1 - probHit) * (c * 0.12) / riskFactor;
    const utility = c * Math.pow(probHit, 1 / riskFactor) - bustPenalty;

    if (utility > bestUtility) {
      bestUtility = utility;
      bestCall = c;
    }
  }

  return bestCall;
}

/**
 * Determinizes unknown cards and runs fast Monte Carlo / IS-MCTS rollouts
 * to pick the optimal card for `seatIndex` in `state`.
 */
export function computeOptimalBotCard(
  state: GameState,
  seatIndex: SeatIndex,
): CardValue {
  const seat = state.seats[seatIndex];
  const hand = [...seat.hand].sort((a, b) => a - b);
  if (hand.length <= 1) {
    return hand[0] ?? DECK_CARDS[0];
  }

  // Collect all known cards: bot's hand + currentTrick
  const currentTrick = Array.isArray(state.currentTrick) ? state.currentTrick : [];

  // Mandatory rule: Trick 1 lead with card 1.
  if (state.trickNumber === 1 && currentTrick.length === 0 && hand.includes(1)) {
    return 1;
  }

  // Fast-path: 4th to play and cheapest winner immediately clinches our call
  const targetCall = seat.call ?? 0;
  const needed = Math.max(0, targetCall - seat.capturedPoints);
  if (needed > 0 && currentTrick.length === 3) {
    let maxCard = 0;
    let pot = 0;
    for (const p of currentTrick) {
      pot += p.card;
      if (p.card > maxCard) maxCard = p.card;
    }
    const cheapestWinner = hand.find((c) => c > maxCard);
    if (cheapestWinner !== undefined && pot + cheapestWinner >= needed) {
      return cheapestWinner;
    }
  }

  const known = new Set<CardValue>(hand);
  for (const play of currentTrick) {
    known.add(play.card);
  }

  // Note: If we don't have full played-card history in GameState, we know how many
  // cards each opponent holds (`state.seats[i].hand.length`).
  // Any card in DECK_CARDS not in `known` is a candidate for opponents' hands
  // (plus already-played cards from earlier tricks, which we exclude by only dealing
  // `opp.hand.length` cards to each opponent).
  const unknownPool = DECK_CARDS.filter((c) => !known.has(c));

  const calls: [number, number, number, number] = [
    state.seats[0].call ?? 0,
    state.seats[1].call ?? 0,
    state.seats[2].call ?? 0,
    state.seats[3].call ?? 0,
  ];
  const baseCaptured: [number, number, number, number] = [
    state.seats[0].capturedPoints,
    state.seats[1].capturedPoints,
    state.seats[2].capturedPoints,
    state.seats[3].capturedPoints,
  ];
  const totalScores: [number, number, number, number] = [
    state.seats[0].totalScore,
    state.seats[1].totalScore,
    state.seats[2].totalScore,
    state.seats[3].totalScore,
  ];

  // Identify who holds card 1 if it's still in unknownPool
  const oneInUnknown = unknownPool.includes(1);
  const starterSeat = state.roundStarterSeat;

  const MAX_DETERMINIZATIONS = 240;
  const TIME_BUDGET_MS = 25;
  const startTime = Date.now();

  const cardScores = new Float64Array(hand.length);
  let determinizations = 0;

  while (
    determinizations < MAX_DETERMINIZATIONS &&
    Date.now() - startTime < TIME_BUDGET_MS
  ) {
    determinizations += 1;
    const pool = [...unknownPool];
    shuffleInPlace(pool);

    // Build determinized opponent hands
    const baseHands: [CardValue[], CardValue[], CardValue[], CardValue[]] = [
      [],
      [],
      [],
      [],
    ];
    baseHands[seatIndex] = [...hand];

    let cursor = 0;
    for (let i = 0; i < 4; i += 1) {
      if (i === seatIndex) continue;
      const neededCount = state.seats[i].hand.length;
      const oppHand = pool.slice(cursor, cursor + neededCount);
      cursor += neededCount;
      baseHands[i] = oppHand;
    }

    // Enforce constraint: if 1 is unplayed and starterSeat is an opponent who hasn't played yet,
    // ensure starterSeat holds 1.
    if (
      oneInUnknown &&
      starterSeat !== seatIndex &&
      state.trickNumber === 1 &&
      state.seats[starterSeat].hand.length > 0 &&
      !baseHands[starterSeat].includes(1)
    ) {
      for (let i = 0; i < 4; i += 1) {
        if (i === seatIndex || i === starterSeat) continue;
        const idx = baseHands[i].indexOf(1);
        if (idx !== -1 && baseHands[starterSeat].length > 0) {
          const swap = baseHands[starterSeat][0];
          baseHands[starterSeat][0] = 1;
          baseHands[i][idx] = swap;
          break;
        }
      }
    }

    for (let i = 0; i < 4; i += 1) {
      baseHands[i].sort((a, b) => a - b);
    }

    // Evaluate each candidate card in `hand`
    for (let cIdx = 0; cIdx < hand.length; cIdx += 1) {
      const candidate = hand[cIdx];
      const simHands: [CardValue[], CardValue[], CardValue[], CardValue[]] = [
        [...baseHands[0]],
        [...baseHands[1]],
        [...baseHands[2]],
        [...baseHands[3]],
      ];
      const simCaptured: [number, number, number, number] = [...baseCaptured];

      // Play `candidate` into currentTrick
      const candPos = simHands[seatIndex].indexOf(candidate);
      if (candPos !== -1) simHands[seatIndex].splice(candPos, 1);

      const trickPlays: TrickPlay[] = [
        ...currentTrick,
        { seatIndex, card: candidate },
      ];

      // Complete current trick
      let nextSeat = ((seatIndex + 1) % 4) as SeatIndex;
      while (trickPlays.length < 4) {
        const oppHand = simHands[nextSeat];
        if (oppHand.length > 0) {
          const needed = Math.max(0, calls[nextSeat] - simCaptured[nextSeat]);
          const chosen = chooseRolloutCard(
            oppHand,
            trickPlays,
            needed,
            state.trickNumber,
          );
          const pos = oppHand.indexOf(chosen);
          if (pos !== -1) oppHand.splice(pos, 1);
          trickPlays.push({ seatIndex: nextSeat, card: chosen });
        }
        nextSeat = ((nextSeat + 1) % 4) as SeatIndex;
      }

      // Resolve current trick
      let winner = trickPlays[0];
      let pot = 0;
      for (let i = 0; i < trickPlays.length; i += 1) {
        pot += trickPlays[i].card;
        if (trickPlays[i].card > winner.card) {
          winner = trickPlays[i];
        }
      }
      simCaptured[winner.seatIndex] += pot;
      let leader = winner.seatIndex;

      // Simulate remaining tricks
      for (let t = state.trickNumber + 1; t <= 5; t += 1) {
        const tPlays: TrickPlay[] = [];
        for (let offset = 0; offset < 4; offset += 1) {
          const s = ((leader + offset) % 4) as SeatIndex;
          const sHand = simHands[s];
          if (sHand.length === 0) continue;
          const needed = Math.max(0, calls[s] - simCaptured[s]);
          const chosen = chooseRolloutCard(sHand, tPlays, needed, t);
          const pos = sHand.indexOf(chosen);
          if (pos !== -1) sHand.splice(pos, 1);
          tPlays.push({ seatIndex: s, card: chosen });
        }
        if (tPlays.length === 0) break;
        let tWinner = tPlays[0];
        let tPot = 0;
        for (let i = 0; i < tPlays.length; i += 1) {
          tPot += tPlays[i].card;
          if (tPlays[i].card > tWinner.card) tWinner = tPlays[i];
        }
        simCaptured[tWinner.seatIndex] += tPot;
        leader = tWinner.seatIndex;
      }

      // Score terminal state: own reward - opponent blocking penalty
      const myCall = calls[seatIndex];
      const myReward = simCaptured[seatIndex] >= myCall ? myCall : 0;
      let oppPenalty = 0;
      for (let i = 0; i < 4; i += 1) {
        if (i === seatIndex) continue;
        if (simCaptured[i] >= calls[i]) {
          // Weight blocking opponents who are higher in totalScore
          const leaderWeight = totalScores[i] >= totalScores[seatIndex] ? 0.25 : 0.15;
          oppPenalty += calls[i] * leaderWeight;
        }
      }

      cardScores[cIdx] += myReward - oppPenalty;
    }
  }

  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < hand.length; i += 1) {
    if (cardScores[i] > bestScore) {
      bestScore = cardScores[i];
      bestIdx = i;
    }
  }

  return hand[bestIdx];
}

const LEGACY_WIN_PROB = [
  1.0, 0.85, 0.72, 0.58, 0.45, 0.34, 0.25, 0.18, 0.12, 0.08, 0.05, 0.03, 0.01,
  0, 0, 0,
] as const;

/**
 * Legacy heuristic bidding (used for Nabil).
 */
export function computeLegacyBotCall(
  hand: readonly CardValue[],
  existingCalls: readonly (number | null)[] = [],
): number {
  const validHand = hand.filter((c) => DECK_CARDS.includes(c));
  if (validHand.length === 0) return 0;

  const handSet = new Set<number>(validHand);
  let expectedTotal = 0;

  for (const card of validHand) {
    let higherOutsideCount = 0;
    for (const deckCard of DECK_CARDS) {
      if (deckCard > card && !handSet.has(deckCard)) {
        higherOutsideCount += 1;
      }
    }
    const winProb =
      higherOutsideCount < LEGACY_WIN_PROB.length
        ? LEGACY_WIN_PROB[higherOutsideCount]
        : 0;
    expectedTotal += winProb * (card + 105);
  }

  if (handSet.has(1)) expectedTotal += 8;
  const highCardCount = validHand.filter((c) => c >= 80).length;
  if (highCardCount >= 2) expectedTotal += (highCardCount - 1) * 10;

  const validCalls = existingCalls.filter(
    (c): c is number => typeof c === 'number' && Number.isFinite(c),
  );
  if (validCalls.length > 0) {
    const avgCall = validCalls.reduce((s, v) => s + v, 0) / validCalls.length;
    if (avgCall >= 240 && expectedTotal > 50) expectedTotal -= 15;
    else if (avgCall <= 60 && validCalls.length >= 2 && expectedTotal > 0) {
      expectedTotal += 10;
    }
  }

  const rounded = Math.round((expectedTotal * 0.88) / CALL_STEP) * CALL_STEP;
  return Math.max(MIN_CALL, Math.min(MAX_CALL, rounded));
}

/**
 * Legacy heuristic card play (used for Nabil).
 */
export function computeLegacyBotCard(
  state: GameState,
  seatIndex: SeatIndex,
): CardValue {
  const seat = state.seats[seatIndex];
  const sorted = [...seat.hand].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted[0] ?? DECK_CARDS[0];

  const needed = Math.max(0, (seat.call ?? 0) - seat.capturedPoints);
  const currentTrick = Array.isArray(state.currentTrick) ? state.currentTrick : [];

  if (needed === 0) {
    if (currentTrick.length > 0) {
      const currentMax = Math.max(...currentTrick.map((p) => p.card));
      const under = sorted.filter((c) => c < currentMax);
      if (under.length > 0) return under[under.length - 1];
    }
    return sorted[0];
  }

  if (currentTrick.length === 0) {
    const highest = sorted[sorted.length - 1];
    if (highest === 100 && (needed <= 130 || sorted.length <= 3)) return highest;
    if (highest >= 90 && (needed >= 80 || sorted.length <= 2)) return highest;
    if (highest >= 75 && state.trickNumber >= 3) return highest;
    return sorted[0];
  }

  const currentMax = Math.max(...currentTrick.map((p) => p.card));
  let currentPot = 0;
  for (const p of currentTrick) currentPot += p.card;
  const winners = sorted.filter((c) => c > currentMax);
  if (winners.length === 0) return sorted[0];

  const cheapestWinner = winners[0];
  if (currentTrick.length === 3) {
    return currentPot + cheapestWinner >= needed || currentPot >= 70
      ? cheapestWinner
      : sorted[0];
  }
  if (cheapestWinner >= 90 && currentPot >= 60) return cheapestWinner;
  if (currentPot >= 80) return sorted[sorted.length - 1];
  return sorted[0];
}
