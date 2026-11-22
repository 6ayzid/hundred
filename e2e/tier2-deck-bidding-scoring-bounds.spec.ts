import { expect, test, type Page } from '@playwright/test';
import {
  advanceClockStepped,
  attachRuntimeMonitors,
  completeCurrentRound,
  createRoomAndEnter,
  EXCLUDED_CARD,
  EXPECTED_DECK_SUM,
  fillBotsAndStartMatch,
  getHandCardButtons,
  installVirtualClock,
  placeQuickCall,
  playCardValue,
  readSessionIdentity,
  readStoredGameState,
  reloadRoomState,
  submitCustomCall,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
  writeStoredGameState,
  type OpaqueGameSnapshot,
} from './helpers/tabletop';

async function attemptInvalidCallInput(
  page: Page,
  rawText: string,
): Promise<void> {
  const customInput = page
    .getByLabel(/custom\s*call|call\s*amount|bid\s*amount/i)
    .or(page.getByPlaceholder(/custom|0\s*[-–]\s*500|call|bid/i))
    .or(page.locator('input[type="number"]:visible'))
    .first();

  await expect(customInput).toBeVisible();
  const inputType = (await customInput.getAttribute('type')) ?? 'text';

  if (inputType === 'number' && !/^-?\d*$/.test(rawText)) {
    await customInput.fill('');
    await customInput.focus();
    await page.keyboard.type(rawText);
  } else {
    await customInput.fill(rawText);
  }

  const submitBtn = page
    .getByRole('button', {
      name: /place\s*call|submit\s*call|set\s*call|submit\s*bid|confirm\s*call|^call$/i,
    })
    .first();

  if ((await submitBtn.count()) > 0 && (await submitBtn.isVisible())) {
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
      return;
    }
  }
  await customInput.press('Enter');
}

async function ensureActiveRoomAfterReload(
  page: Page,
  nickname: string,
  roomCode: string,
): Promise<void> {
  await reloadRoomState(page, roomCode, nickname);
}

test.describe('Tier 2 — Deck, Bidding, Turn & Scoring Boundary/Negative Cases (F-07, F-09, F-10, F-11)', () => {
  test('T2-F07-01: 5 fresh deals (100 dealt cards) exclude 85, include 1 and 100, and sum to 966 per deal', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    let totalCardsDealt = 0;
    let totalExcludedCount = 0;
    let totalSumAcrossDeals = 0;

    for (let deal = 0; deal < 5; deal += 1) {
      await page.goto('/');
      const roomCode = await createRoomAndEnter(page, `DeckCheck${deal}`);
      await fillBotsAndStartMatch(page);

      const snapshot = await readStoredGameState(page, roomCode);
      expect(snapshot).not.toBeNull();
      const cards = snapshot?.seats.flatMap((seat) => seat.hand) ?? [];

      expect(cards).toHaveLength(20);
      expect(new Set(cards).size).toBe(20);
      expect(cards).toContain(1);
      expect(cards).toContain(100);
      expect(cards).not.toContain(EXCLUDED_CARD);

      const dealSum = cards.reduce((sum, val) => sum + val, 0);
      expect(dealSum).toBe(EXPECTED_DECK_SUM);

      totalCardsDealt += cards.length;
      totalExcludedCount += cards.filter((c) => c === EXCLUDED_CARD).length;
      totalSumAcrossDeals += dealSum;
    }

    expect(totalCardsDealt).toBe(100);
    expect(totalExcludedCount).toBe(0);
    expect(totalSumAcrossDeals).toBe(EXPECTED_DECK_SUM * 5);

    monitors.assertClean();
  });

  test('T2-F09-01: Bidding rejects 45, 510, -10, empty, and non-numeric input while accepting boundary 0 and 500', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCodeA = await createRoomAndEnter(page, 'BidBoundA');
    await fillBotsAndStartMatch(page);
    const identityA = await readSessionIdentity(page, roomCodeA);
    const mySeatA = identityA.seatIndex ?? 0;

    await waitForHumanCallTurn(page, roomCodeA, 20_000, true);

    for (const badBid of ['45', '510', '-10', '', 'abc']) {
      await attemptInvalidCallInput(page, badBid);
      const afterBad = await readStoredGameState(page, roomCodeA);
      expect(afterBad?.phase).toBe('BIDDING');
      expect(afterBad?.activeSeat).toBe(mySeatA);
      expect(afterBad?.seats[mySeatA].call).toBeNull();
    }

    await submitCustomCall(page, 0);
    await expect
      .poll(
        async () => (await readStoredGameState(page, roomCodeA))?.seats[mySeatA].call,
        { timeout: 5_000 },
      )
      .toBe(0);

    await page.goto('/');
    const roomCodeB = await createRoomAndEnter(page, 'BidBoundB');
    await fillBotsAndStartMatch(page);
    const identityB = await readSessionIdentity(page, roomCodeB);
    const mySeatB = identityB.seatIndex ?? 0;

    await waitForHumanCallTurn(page, roomCodeB, 20_000, true);
    await submitCustomCall(page, 500);
    await expect
      .poll(
        async () => (await readStoredGameState(page, roomCodeB))?.seats[mySeatB].call,
        { timeout: 5_000 },
      )
      .toBe(500);

    monitors.assertClean();
  });

  test('T2-F10-01: Out-of-turn card clicks during BIDDING, bot turns, and TRICK_COMPLETE produce zero state mutation', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'TurnGuard');
    await fillBotsAndStartMatch(page);
    const identity = await readSessionIdentity(page, roomCode);
    const mySeat = identity.seatIndex ?? 0;

    await waitForHumanCallTurn(page, roomCode, 20_000, true);
    const biddingCards = await getHandCardButtons(page, roomCode);
    expect(biddingCards).toHaveLength(5);
    await biddingCards[0].button.click({ force: true });

    const stillBidding = await readStoredGameState(page, roomCode);
    expect(stillBidding?.phase).toBe('BIDDING');
    expect(stillBidding?.seats[mySeat].hand).toHaveLength(5);
    expect(stillBidding?.currentTrick).toHaveLength(0);

    await placeQuickCall(page, 100);

    let playingSnap: OpaqueGameSnapshot | null = null;
    for (let step = 0; step < 30; step += 1) {
      const snap = await readStoredGameState(page, roomCode);
      if (snap && snap.phase === 'PLAYING') {
        playingSnap = snap;
        break;
      }
      await advanceClockStepped(page, 400, 400);
    }
    expect(playingSnap?.phase).toBe('PLAYING');

    if (playingSnap && playingSnap.activeSeat === mySeat) {
      await playCardValue(page, roomCode);
    }

    const botTurnSnap = await readStoredGameState(page, roomCode);
    if (botTurnSnap && botTurnSnap.phase === 'PLAYING' && botTurnSnap.activeSeat !== mySeat) {
      const handLenBefore = botTurnSnap.seats[mySeat].hand.length;
      const trickLenBefore = botTurnSnap.currentTrick.length;
      const botTurnCards = await getHandCardButtons(page, roomCode);
      if (botTurnCards.length > 0) {
        await botTurnCards[0].button.click({ force: true });
      }
      const afterOutOfTurnClick = await readStoredGameState(page, roomCode);
      expect(afterOutOfTurnClick?.seats[mySeat].hand).toHaveLength(handLenBefore);
      expect(afterOutOfTurnClick?.currentTrick).toHaveLength(trickLenBefore);
    }

    let trickCompleteSnap: OpaqueGameSnapshot | null = null;
    for (let step = 0; step < 45; step += 1) {
      const snap = await readStoredGameState(page, roomCode);
      if (!snap) break;
      if (snap.phase === 'TRICK_COMPLETE') {
        trickCompleteSnap = snap;
        break;
      }
      if (snap.phase === 'PLAYING' && snap.activeSeat === mySeat) {
        await playCardValue(page, roomCode);
        continue;
      }
      await advanceClockStepped(page, 200, 200);
    }

    expect(trickCompleteSnap?.phase).toBe('TRICK_COMPLETE');
    const handDuringPause = trickCompleteSnap?.seats[mySeat].hand.length ?? 0;
    const pauseCards = await getHandCardButtons(page, roomCode);
    if (pauseCards.length > 0) {
      await pauseCards[0].button.click({ force: true });
    }
    const afterPauseClick = await readStoredGameState(page, roomCode);
    expect(afterPauseClick?.phase).toBe('TRICK_COMPLETE');
    expect(afterPauseClick?.seats[mySeat].hand).toHaveLength(handDuringPause);

    monitors.assertClean();
  });

  test('T2-F11-01: Natural call=500 -> +0, call=0 -> +0, and Trick-5 boundary mutations verify over-capture (150>100->+100), exact-capture (100===100->+100), and under-capture (95<100->+0)', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);

    let room500 = '';
    let seat500 = 0;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.goto('/');
      room500 = await createRoomAndEnter(page, `MaxBid${attempt}`);
      await fillBotsAndStartMatch(page);
      const id = await readSessionIdentity(page, room500);
      seat500 = id.seatIndex ?? 0;
      const deal = await readStoredGameState(page, room500);
      const highCards =
        deal?.seats[seat500].hand.filter((card) => card >= 60).length ?? 0;
      if (highCards <= 1) {
        break;
      }
      if (attempt === 9 && deal) {
        const allCards = deal.seats.flatMap((s) => s.hand).sort((a, b) => a - b);
        const lowFive = allCards.slice(0, 5);
        const restFifteen = allCards.slice(5);
        const adjusted: OpaqueGameSnapshot = {
          ...deal,
          version: deal.version + 1,
          seats: deal.seats.map((s, idx) => {
            if (idx === seat500) {
              return { ...s, hand: lowFive };
            }
            const botOffset = idx < seat500 ? idx : idx - 1;
            return {
              ...s,
              hand: restFifteen.slice(botOffset * 5, (botOffset + 1) * 5),
            };
          }),
        };
        await writeStoredGameState(page, room500, adjusted);
        await ensureActiveRoomAfterReload(page, `MaxBid${attempt}`, room500);
      }
    }

    const round500 = await completeCurrentRound(page, room500, 500, true);
    expect(round500.summaryState.seats[seat500].call).toBe(500);
    expect(round500.summaryState.seats[seat500].capturedPoints).toBeLessThan(500);
    expect(round500.summaryState.seats[seat500].totalScore).toBe(0);

    await page.goto('/');
    const roomZero = await createRoomAndEnter(page, 'ZeroBid');
    await fillBotsAndStartMatch(page);
    const idZero = await readSessionIdentity(page, roomZero);
    const seatZero = idZero.seatIndex ?? 0;

    const roundZero = await completeCurrentRound(page, roomZero, 0, true);
    expect(roundZero.summaryState.seats[seatZero].call).toBe(0);
    expect(roundZero.summaryState.seats[seatZero].totalScore).toBe(0);

    await page.goto('/');
    const roomBoundary = await createRoomAndEnter(page, 'BoundaryHost');
    await fillBotsAndStartMatch(page);
    const baseState = await readStoredGameState(page, roomBoundary);
    expect(baseState).not.toBeNull();

    if (baseState) {
      // Partition 1: Over-capture (capturedPoints = 150 > call = 100 -> awards 100, NOT 150)
      const browserNow = await page.evaluate(() => Date.now());
      const overCaptureState: OpaqueGameSnapshot = {
        ...baseState,
        version: baseState.version + 20,
        phase: 'PLAYING',
        round: 1,
        roundStarterSeat: 0,
        trickNumber: 5,
        trickLeaderSeat: 1,
        activeSeat: 0,
        turnDeadline: browserNow + 60_000,
        emittedAt: browserNow,
        currentTrick: [
          { seatIndex: 1, card: 5 },
          { seatIndex: 2, card: 20 },
          { seatIndex: 3, card: 25 },
        ],
        lastTrickWinnerSeat: null,
        lastTrickPoints: 0,
        roundHistory: [],
        seats: [
          {
            ...baseState.seats[0],
            hand: [100],
            call: 100,
            capturedPoints: 0,
            tricksWon: 0,
            totalScore: 0,
          },
          {
            ...baseState.seats[1],
            hand: [],
            call: 100,
            capturedPoints: 300,
            tricksWon: 2,
            totalScore: 0,
          },
          {
            ...baseState.seats[2],
            hand: [],
            call: 100,
            capturedPoints: 300,
            tricksWon: 1,
            totalScore: 0,
          },
          {
            ...baseState.seats[3],
            hand: [],
            call: 100,
            capturedPoints: 216,
            tricksWon: 1,
            totalScore: 0,
          },
        ],
      };

      await writeStoredGameState(page, roomBoundary, overCaptureState);
      await ensureActiveRoomAfterReload(page, 'BoundaryHost', roomBoundary);

      await waitForHumanPlayTurn(page, roomBoundary, 15_000, true);
      const playedOver = await playCardValue(page, roomBoundary, 100);
      expect(playedOver).toBe(100);

      let overSummary: OpaqueGameSnapshot | null = null;
      for (let step = 0; step < 30; step += 1) {
        const snap = await readStoredGameState(page, roomBoundary);
        if (snap && snap.phase === 'ROUND_SUMMARY') {
          overSummary = snap;
          break;
        }
        await advanceClockStepped(page, 300, 300);
      }

      expect(overSummary).not.toBeNull();
      expect(overSummary?.seats[0].call).toBe(100);
      expect(overSummary?.seats[0].capturedPoints).toBe(150);
      expect(overSummary?.seats[0].totalScore).toBe(100);

      // Partition 2: Exact boundary match (capturedPoints = 100 === call = 100 -> awards 100)
      const browserNowExact = await page.evaluate(() => Date.now());
      const exactCaptureState: OpaqueGameSnapshot = {
        ...overCaptureState,
        version: (overSummary?.version ?? overCaptureState.version) + 20,
        phase: 'PLAYING',
        round: 1,
        trickNumber: 5,
        trickLeaderSeat: 1,
        activeSeat: 0,
        turnDeadline: browserNowExact + 60_000,
        emittedAt: browserNowExact,
        currentTrick: [
          { seatIndex: 1, card: 5 },
          { seatIndex: 2, card: 15 },
          { seatIndex: 3, card: 25 },
        ],
        roundHistory: [],
        seats: [
          {
            ...overCaptureState.seats[0],
            hand: [55],
            call: 100,
            capturedPoints: 0,
            tricksWon: 0,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[1],
            hand: [],
            capturedPoints: 300,
            tricksWon: 2,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[2],
            hand: [],
            capturedPoints: 300,
            tricksWon: 1,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[3],
            hand: [],
            capturedPoints: 266,
            tricksWon: 1,
            totalScore: 0,
          },
        ],
      };

      await writeStoredGameState(page, roomBoundary, exactCaptureState);
      await ensureActiveRoomAfterReload(page, 'BoundaryHost', roomBoundary);

      await waitForHumanPlayTurn(page, roomBoundary, 15_000, true);
      const playedExact = await playCardValue(page, roomBoundary, 55);
      expect(playedExact).toBe(55);

      let exactSummary: OpaqueGameSnapshot | null = null;
      for (let step = 0; step < 30; step += 1) {
        const snap = await readStoredGameState(page, roomBoundary);
        if (snap && snap.phase === 'ROUND_SUMMARY') {
          exactSummary = snap;
          break;
        }
        await advanceClockStepped(page, 300, 300);
      }

      expect(exactSummary).not.toBeNull();
      expect(exactSummary?.seats[0].call).toBe(100);
      expect(exactSummary?.seats[0].capturedPoints).toBe(100);
      expect(exactSummary?.seats[0].totalScore).toBe(100);

      // Partition 3: Under-capture (capturedPoints = 95 < call = 100 -> awards 0)
      const browserNowAfter = await page.evaluate(() => Date.now());
      const underCaptureState: OpaqueGameSnapshot = {
        ...overCaptureState,
        version: (exactSummary?.version ?? exactCaptureState.version) + 20,
        phase: 'PLAYING',
        round: 1,
        trickNumber: 5,
        trickLeaderSeat: 1,
        activeSeat: 0,
        turnDeadline: browserNowAfter + 60_000,
        emittedAt: browserNowAfter,
        currentTrick: [
          { seatIndex: 1, card: 5 },
          { seatIndex: 2, card: 15 },
          { seatIndex: 3, card: 25 },
        ],
        roundHistory: [],
        seats: [
          {
            ...overCaptureState.seats[0],
            hand: [50],
            call: 100,
            capturedPoints: 0,
            tricksWon: 0,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[1],
            hand: [],
            capturedPoints: 300,
            tricksWon: 2,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[2],
            hand: [],
            capturedPoints: 300,
            tricksWon: 1,
            totalScore: 0,
          },
          {
            ...overCaptureState.seats[3],
            hand: [],
            capturedPoints: 271,
            tricksWon: 1,
            totalScore: 0,
          },
        ],
      };

      await writeStoredGameState(page, roomBoundary, underCaptureState);
      await ensureActiveRoomAfterReload(page, 'BoundaryHost', roomBoundary);

      await waitForHumanPlayTurn(page, roomBoundary, 15_000, true);
      const playedUnder = await playCardValue(page, roomBoundary, 50);
      expect(playedUnder).toBe(50);

      let underSummary: OpaqueGameSnapshot | null = null;
      for (let step = 0; step < 30; step += 1) {
        const snap = await readStoredGameState(page, roomBoundary);
        if (snap && snap.phase === 'ROUND_SUMMARY') {
          underSummary = snap;
          break;
        }
        await advanceClockStepped(page, 300, 300);
      }

      expect(underSummary).not.toBeNull();
      expect(underSummary?.seats[0].call).toBe(100);
      expect(underSummary?.seats[0].capturedPoints).toBe(95);
      expect(underSummary?.seats[0].totalScore).toBe(0);
    }

    monitors.assertClean();
  });
});
