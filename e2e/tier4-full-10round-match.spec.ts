import { expect, test, type Page } from '@playwright/test';
import {
  BOT_NAMES,
  EXPECTED_DECK_SUM,
  attachRuntimeMonitors,
  completeCurrentRound,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  installVirtualClock,
  readStoredGameState,
  waitForHumanCallTurn,
} from './helpers/tabletop';

async function readMatchOverPodiumText(page: Page): Promise<string> {
  return page.evaluate((botNames) => {
    const expectedPlayers = ['Zara', ...botNames];
    const buttons = Array.from(document.querySelectorAll('button'));
    const playAgainBtn = buttons.find((btn) =>
      /play\s*again|new\s*match|rematch/i.test(btn.textContent ?? ''),
    );
    let node: HTMLElement | null = playAgainBtn?.parentElement ?? null;
    while (node && node.parentElement) {
      const text = node.innerText ?? '';
      if (expectedPlayers.every((name) => text.includes(name))) {
        return text;
      }
      node = node.parentElement;
    }
    return document.body?.innerText ?? '';
  }, [...BOT_NAMES]);
}

test.describe('Tier 4 E2E: Full 10-Round Match Lifecycle & Play Again Reset (T4-E2E-01)', () => {
  test('T4-E2E-01: plays full 10-round match via stepped virtual clock to Match Over Podium and resets cleanly on Play Again', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Zara');
    await fillBotsAndStartMatch(page);

    const roundCalls = [0, 50, 100, 150, 200, 50, 100, 150, 0, 100] as const;
    let previousStarterSeat = -1;
    let finalSnapshot = await readStoredGameState(page, roomCode);
    expect(finalSnapshot).not.toBeNull();
    expect(finalSnapshot?.round).toBe(1);

    for (let roundNum = 1; roundNum <= 10; roundNum += 1) {
      await expect(
        page.getByText(new RegExp(`Round\\s*${roundNum}\\s*\\/\\s*10`, 'i')).first(),
      ).toBeVisible();

      const roundStartSnap = await readStoredGameState(page, roomCode);
      expect(roundStartSnap?.round).toBe(roundNum);
      const currentStarter = roundStartSnap?.roundStarterSeat ?? -1;
      expect(currentStarter).toBeGreaterThanOrEqual(0);
      expect(currentStarter).toBeLessThanOrEqual(3);
      if (roundNum > 1) {
        expect(currentStarter).toBe((previousStarterSeat + 1) % 4);
      }
      previousStarterSeat = currentStarter;

      const { nextState } = await completeCurrentRound(
        page,
        roomCode,
        roundCalls[roundNum - 1],
        true,
      );

      expect(nextState.roundHistory).toHaveLength(roundNum);
      const latestRecord = nextState.roundHistory[roundNum - 1];
      expect(latestRecord.round).toBe(roundNum);
      expect(latestRecord.entries).toHaveLength(4);

      const roundCaptureSum = latestRecord.entries.reduce(
        (acc, entry) => acc + entry.capturedPoints,
        0,
      );
      expect(roundCaptureSum).toBe(EXPECTED_DECK_SUM);

      for (const entry of latestRecord.entries) {
        const expectedAward =
          entry.capturedPoints >= entry.call ? entry.call : 0;
        expect(entry.pointsAwarded).toBe(expectedAward);
      }

      if (roundNum < 10) {
        expect(nextState.phase).not.toBe('MATCH_OVER');
        expect(nextState.round).toBe(roundNum + 1);
      } else {
        expect(nextState.phase).toBe('MATCH_OVER');
        expect(nextState.round).toBeLessThanOrEqual(10);
      }

      finalSnapshot = nextState;
    }

    // Never advances to Round 11/10
    await expect(page.getByText(/Round\s*11\s*\/\s*10/i)).toHaveCount(0);

    // Match Over Podium ranks all 4 players with accurate cumulative scores
    const playAgainBtn = page
      .getByRole('button', { name: /play\s*again|new\s*match|rematch/i })
      .first();
    await expect(playAgainBtn).toBeVisible({ timeout: 10_000 });
    await expect(playAgainBtn).toBeEnabled();

    const podiumText = await readMatchOverPodiumText(page);
    const rankedSeats = [...(finalSnapshot?.seats ?? [])].sort(
      (a, b) => b.totalScore - a.totalScore,
    );
    expect(rankedSeats).toHaveLength(4);

    for (const seat of rankedSeats) {
      expect(podiumText).toContain(seat.username);
      expect(podiumText).toContain(String(seat.totalScore));
    }

    if (rankedSeats[0].totalScore > rankedSeats[3].totalScore) {
      const topIdx = podiumText.indexOf(rankedSeats[0].username);
      const lastIdx = podiumText.indexOf(rankedSeats[3].username);
      const hasWinnerBadge = /#1\b|1st|winner|champion|podium|victory|🏆|🥇/i.test(
        podiumText,
      );
      expect(topIdx).toBeGreaterThanOrEqual(0);
      expect(lastIdx).toBeGreaterThanOrEqual(0);
      expect(topIdx < lastIdx || hasWinnerBadge).toBe(true);
    }

    // Play Again cleanly resets to Round 1/10 with Total Pts = 0 for all 4 players
    await playAgainBtn.click();
    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const resetState = await readStoredGameState(page, roomCode);
    expect(resetState).not.toBeNull();
    expect(resetState?.phase).toBe('BIDDING');
    expect(resetState?.round).toBe(1);
    expect(resetState?.roundHistory).toHaveLength(0);
    expect(resetState?.seats).toHaveLength(4);
    for (const seat of resetState?.seats ?? []) {
      expect(seat.totalScore).toBe(0);
      expect(seat.capturedPoints).toBe(0);
      expect(seat.call).toBeNull();
      expect(seat.hand).toHaveLength(5);
    }

    const newMatchBidTurn = await waitForHumanCallTurn(
      page,
      roomCode,
      20_000,
      true,
    );
    expect(newMatchBidTurn.round).toBe(1);
    expect(newMatchBidTurn.phase).toBe('BIDDING');

    monitors.assertClean();
  });
});
