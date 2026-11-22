import { expect, test } from '@playwright/test';
import {
  advanceClockStepped,
  attachRuntimeMonitors,
  completeCurrentRound,
  createRoomAndEnter,
  EXCLUDED_CARD,
  EXPECTED_DECK,
  EXPECTED_DECK_SUM,
  fillBotsAndStartMatch,
  getHandCardButtons,
  getQuickCallButton,
  installVirtualClock,
  playCardValue,
  placeQuickCall,
  QUICK_CALL_PILLS,
  readSessionIdentity,
  readStoredGameState,
  submitCustomCall,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
  type OpaqueGameSnapshot,
} from './helpers/tabletop';

test.describe('Tier 1 — Game Engine, Bidding, 5-Trick Loop & Scoring (F-07..F-11)', () => {
  test('T1-F07/08/09/10/11-01: 20-card deal, custom bid, 5-trick loop with 2.2s pause, scoring math & Round 2 rotation', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Arif');
    await fillBotsAndStartMatch(page);

    const identity = await readSessionIdentity(page, roomCode);
    const mySeat = identity.seatIndex ?? 0;

    const dealState = await readStoredGameState(page, roomCode);
    expect(dealState).not.toBeNull();
    expect(dealState?.round).toBe(1);
    expect(dealState?.phase).toBe('BIDDING');
    expect(dealState?.seats).toHaveLength(4);

    const round1Starter = dealState?.roundStarterSeat ?? 0;
    const allDealtCards = dealState?.seats.flatMap((seat) => seat.hand) ?? [];
    for (const seat of dealState?.seats ?? []) {
      expect(seat.hand).toHaveLength(5);
    }
    expect(allDealtCards).toHaveLength(20);
    expect(new Set(allDealtCards).size).toBe(20);
    expect([...allDealtCards].sort((a, b) => a - b)).toEqual([...EXPECTED_DECK]);
    expect(allDealtCards).not.toContain(EXCLUDED_CARD);
    expect(allDealtCards.reduce((sum, val) => sum + val, 0)).toBe(
      EXPECTED_DECK_SUM,
    );

    const bidTurnSnapshot = await waitForHumanCallTurn(
      page,
      roomCode,
      20_000,
      true,
    );
    const handButtons = await getHandCardButtons(page, roomCode);
    expect(handButtons).toHaveLength(5);
    const uiHandValues = handButtons.map((c) => c.value).sort((a, b) => a - b);
    const stateHandValues = [...bidTurnSnapshot.seats[mySeat].hand].sort(
      (a, b) => a - b,
    );
    expect(uiHandValues).toEqual(stateHandValues);

    for (const pillValue of QUICK_CALL_PILLS) {
      const pillBtn = getQuickCallButton(page, pillValue);
      await expect(pillBtn).toBeVisible();
      await expect(pillBtn).toBeEnabled();
    }

    await submitCustomCall(page, 120);

    let playingSnapshot: OpaqueGameSnapshot | null = null;
    for (let step = 0; step < 30; step += 1) {
      const snap = await readStoredGameState(page, roomCode);
      if (snap && snap.phase === 'PLAYING') {
        playingSnapshot = snap;
        break;
      }
      await advanceClockStepped(page, 400, 400);
    }

    expect(playingSnapshot).not.toBeNull();
    expect(playingSnapshot?.phase).toBe('PLAYING');
    expect(playingSnapshot?.seats[mySeat].call).toBe(120);
    for (const seat of playingSnapshot?.seats ?? []) {
      expect(seat.call).not.toBeNull();
      expect(seat.call ?? -1).toBeGreaterThanOrEqual(0);
      expect(seat.call ?? 999).toBeLessThanOrEqual(500);
      expect((seat.call ?? 1) % 10).toBe(0);
    }

    await waitForHumanPlayTurn(page, roomCode, 20_000, true);
    await playCardValue(page, roomCode);

    let trickCompleteSnap: OpaqueGameSnapshot | null = null;
    for (let step = 0; step < 35; step += 1) {
      const snap = await readStoredGameState(page, roomCode);
      if (snap && snap.phase === 'TRICK_COMPLETE') {
        trickCompleteSnap = snap;
        break;
      }
      await advanceClockStepped(page, 200, 200);
    }

    expect(trickCompleteSnap).not.toBeNull();
    expect(trickCompleteSnap?.phase).toBe('TRICK_COMPLETE');
    expect(trickCompleteSnap?.currentTrick).toHaveLength(4);

    const trickCards =
      trickCompleteSnap?.currentTrick.map((play) => play.card) ?? [];
    expect(new Set(trickCards).size).toBe(4);

    const maxCard = Math.max(...trickCards);
    const winningPlay = trickCompleteSnap?.currentTrick.find(
      (play) => play.card === maxCard,
    );
    const trick1Winner = winningPlay?.seatIndex ?? -1;
    expect(trickCompleteSnap?.lastTrickWinnerSeat).toBe(trick1Winner);
    expect(trickCompleteSnap?.lastTrickPoints).toBe(
      trickCards.reduce((sum, val) => sum + val, 0),
    );

    await advanceClockStepped(page, 800, 200);
    const stillPausedSnap = await readStoredGameState(page, roomCode);
    expect(stillPausedSnap?.phase).toBe('TRICK_COMPLETE');

    await advanceClockStepped(page, 2_000, 250);
    const trick2Snap = await readStoredGameState(page, roomCode);
    expect(trick2Snap?.phase).toBe('PLAYING');
    expect(trick2Snap?.trickNumber).toBe(2);
    expect(trick2Snap?.trickLeaderSeat).toBe(trick1Winner);

    const { summaryState, nextState } = await completeCurrentRound(
      page,
      roomCode,
      120,
      true,
    );

    expect(summaryState.round).toBe(1);
    expect(
      summaryState.seats.reduce((sum, seat) => sum + seat.capturedPoints, 0),
    ).toBe(EXPECTED_DECK_SUM);
    expect(
      summaryState.seats.reduce((sum, seat) => sum + seat.tricksWon, 0),
    ).toBe(5);

    for (const seat of summaryState.seats) {
      expect(seat.hand).toHaveLength(0);
      const seatCall = seat.call ?? 0;
      const expectedAward = seat.capturedPoints >= seatCall ? seatCall : 0;
      expect(seat.totalScore).toBe(expectedAward);
    }

    expect(nextState.round).toBe(2);
    expect(nextState.roundStarterSeat).toBe((round1Starter + 1) % 4);
    await expect(page.getByText(/Round\s*2\s*\/\s*10/i).first()).toBeVisible();
    for (const seat of nextState.seats) {
      expect(seat.hand).toHaveLength(5);
    }

    monitors.assertClean();
  });

  test('T1-F09-02: Quick-call pill places exact bid amount and transitions to PLAYING', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Zayed');
    await fillBotsAndStartMatch(page);

    const identity = await readSessionIdentity(page, roomCode);
    const mySeat = identity.seatIndex ?? 0;

    await waitForHumanCallTurn(page, roomCode, 20_000, true);
    await placeQuickCall(page, 150);

    let playingSnap: OpaqueGameSnapshot | null = null;
    for (let step = 0; step < 30; step += 1) {
      const snap = await readStoredGameState(page, roomCode);
      if (snap && snap.phase === 'PLAYING') {
        playingSnap = snap;
        break;
      }
      await advanceClockStepped(page, 400, 400);
    }

    expect(playingSnap).not.toBeNull();
    expect(playingSnap?.seats[mySeat].call).toBe(150);
    expect(playingSnap?.trickNumber).toBe(1);

    monitors.assertClean();
  });
});
