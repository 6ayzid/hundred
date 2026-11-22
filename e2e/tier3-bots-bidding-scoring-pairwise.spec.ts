import { expect, test } from '@playwright/test';
import {
  BOT_NAMES,
  EXPECTED_DECK_SUM,
  addBotsCount,
  attachRuntimeMonitors,
  completeCurrentRound,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  getStartMatchButton,
  installVirtualClock,
  placeQuickCall,
  readSessionIdentity,
  readStoredGameState,
  waitForHumanCallTurn,
  type OpaqueGameSnapshot,
} from './helpers/tabletop';

function sumCapturedPoints(snapshot: OpaqueGameSnapshot, roundIdx: number): number {
  const record = snapshot.roundHistory[roundIdx];
  if (!record) {
    return -1;
  }
  return record.entries.reduce((acc, entry) => acc + entry.capturedPoints, 0);
}

test.describe('Tier 3 Pairwise: Bot Counts × Bidding Calls × Rotating Starter & 966 Scoring (T3-PW-01)', () => {
  test('pairwise bot churn {1,2,3}, calls {0, 150}, rotating roundStarterSeat, and exact 966 round sum', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Tariq');
    const identity = await readSessionIdentity(page, roomCode);
    expect(identity.seatIndex).toBe(0);

    // Step 1: Bot count = 1 (2/4 seats filled -> cannot start yet)
    await addBotsCount(page, 1);
    const oneBotState = await readStoredGameState(page, roomCode);
    expect(oneBotState?.seats.filter((s) => s.type === 'AI').length).toBe(1);
    expect(oneBotState?.seats.filter((s) => s.type === 'EMPTY').length).toBe(2);
    const startBtn = getStartMatchButton(page);
    if (await startBtn.isVisible()) {
      await expect(startBtn).toBeDisabled();
    } else {
      await expect(startBtn).toBeHidden();
    }

    // Step 2: Bot count = 2 (3/4 seats filled -> still <4 players)
    await addBotsCount(page, 2);
    const twoBotState = await readStoredGameState(page, roomCode);
    expect(twoBotState?.seats.filter((s) => s.type === 'AI').length).toBe(2);
    expect(twoBotState?.seats.filter((s) => s.type === 'EMPTY').length).toBe(1);
    if (await startBtn.isVisible()) {
      await expect(startBtn).toBeDisabled();
    }

    // Step 3: Remove back to 1 bot, then scale up to 3 bots (all BOT_NAMES visible)
    await addBotsCount(page, 1);
    const reducedState = await readStoredGameState(page, roomCode);
    expect(reducedState?.seats.filter((s) => s.type === 'AI').length).toBe(1);

    await addBotsCount(page, 3);
    const fullLobbyState = await readStoredGameState(page, roomCode);
    expect(fullLobbyState?.seats.filter((s) => s.type === 'AI').length).toBe(3);
    expect(fullLobbyState?.seats.filter((s) => s.type === 'EMPTY').length).toBe(0);
    for (const botName of BOT_NAMES) {
      await expect(page.getByText(botName).first()).toBeVisible();
    }

    // Start match into Round 1/10
    await fillBotsAndStartMatch(page);
    const r1Turn = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    const round1Starter = r1Turn.roundStarterSeat;
    expect(round1Starter).toBeGreaterThanOrEqual(0);
    expect(round1Starter).toBeLessThanOrEqual(3);

    // Pairwise Call = 0 in Round 1
    await placeQuickCall(page, 0);
    const r1Result = await completeCurrentRound(page, roomCode, 0, true);
    const r1Record = r1Result.nextState.roundHistory[0];
    expect(r1Record.round).toBe(1);
    expect(r1Record.entries).toHaveLength(4);
    expect(sumCapturedPoints(r1Result.nextState, 0)).toBe(EXPECTED_DECK_SUM);

    const r1HumanEntry = r1Record.entries.find((e) => e.seatIndex === 0);
    expect(r1HumanEntry?.call).toBe(0);
    expect(r1HumanEntry?.pointsAwarded).toBe(0);
    for (const entry of r1Record.entries) {
      const expectedAward =
        entry.capturedPoints >= entry.call ? entry.call : 0;
      expect(entry.pointsAwarded).toBe(expectedAward);
    }

    // Round 2: verify roundStarterSeat rotated by +1 (mod 4) before human bids
    const r2Turn = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    expect(r2Turn.round).toBe(2);
    expect(r2Turn.roundStarterSeat).toBe((round1Starter + 1) % 4);
    if (r2Turn.roundStarterSeat !== 0) {
      expect(r2Turn.seats[r2Turn.roundStarterSeat].call).not.toBeNull();
    } else {
      expect(r2Turn.activeSeat).toBe(0);
    }

    // Pairwise Call = 150 in Round 2
    await placeQuickCall(page, 150);
    const r2Result = await completeCurrentRound(page, roomCode, 150, true);
    const r2Record = r2Result.nextState.roundHistory[1];
    expect(r2Record.round).toBe(2);
    expect(sumCapturedPoints(r2Result.nextState, 1)).toBe(EXPECTED_DECK_SUM);
    const r2HumanEntry = r2Record.entries.find((e) => e.seatIndex === 0);
    expect(r2HumanEntry?.call).toBe(150);
    expect(r2HumanEntry?.pointsAwarded).toBe(
      (r2HumanEntry?.capturedPoints ?? -1) >= 150 ? 150 : 0,
    );

    monitors.assertClean();
  });

  test('pairwise 1-bot start via Fill Bots & Start with high call 300 and rotating Round 2 starter', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Meera');
    await addBotsCount(page, 1);
    const preStart = await readStoredGameState(page, roomCode);
    expect(preStart?.seats.filter((s) => s.type === 'AI').length).toBe(1);

    await fillBotsAndStartMatch(page);
    const r1Turn = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    expect(r1Turn.seats.filter((s) => s.type === 'AI').length).toBe(3);

    // Pairwise Call = 300 in Round 1
    await placeQuickCall(page, 300);
    const r1Result = await completeCurrentRound(page, roomCode, 300, true);
    const r1Record = r1Result.nextState.roundHistory[0];
    expect(sumCapturedPoints(r1Result.nextState, 0)).toBe(EXPECTED_DECK_SUM);

    const humanEntry = r1Record.entries.find((e) => e.seatIndex === 0);
    expect(humanEntry?.call).toBe(300);
    const expectedHumanAward =
      (humanEntry?.capturedPoints ?? -1) >= 300 ? 300 : 0;
    expect(humanEntry?.pointsAwarded).toBe(expectedHumanAward);
    expect(r1Result.nextState.seats[0].totalScore).toBe(expectedHumanAward);
    expect(r1Result.nextState.round).toBe(2);
    expect(r1Result.nextState.roundStarterSeat).toBe(
      (r1Turn.roundStarterSeat + 1) % 4,
    );

    monitors.assertClean();
  });

  test('pairwise 2-bot start via Fill Bots & Start with mid call 150 and exact cumulative scoring', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Rafi');
    await addBotsCount(page, 2);
    const twoBots = await readStoredGameState(page, roomCode);
    expect(twoBots?.seats.filter((s) => s.type === 'AI').length).toBe(2);

    await fillBotsAndStartMatch(page);
    const r1Turn = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    expect(r1Turn.seats.filter((s) => s.type === 'AI').length).toBe(3);

    await placeQuickCall(page, 150);
    const r1Result = await completeCurrentRound(page, roomCode, 150, true);
    const r1Record = r1Result.nextState.roundHistory[0];
    expect(sumCapturedPoints(r1Result.nextState, 0)).toBe(EXPECTED_DECK_SUM);

    for (const entry of r1Record.entries) {
      const seat = r1Result.nextState.seats[entry.seatIndex];
      const awarded = entry.capturedPoints >= entry.call ? entry.call : 0;
      expect(entry.pointsAwarded).toBe(awarded);
      expect(seat.totalScore).toBe(entry.totalAfter);
    }

    await expect(page.getByText(/Round\s*2\s*\/\s*10/i).first()).toBeVisible();
    monitors.assertClean();
  });
});
