import { expect, test, type Page } from '@playwright/test';
import {
  advanceClockStepped,
  attachRuntimeMonitors,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  installVirtualClock,
  placeQuickCall,
  playCardValue,
  readSessionIdentity,
  readStoredGameState,
  reloadRoomState,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
  type OpaqueGameSnapshot,
} from './helpers/tabletop';

interface CenterArenaInspection {
  found: boolean;
  hasRoundBadge: boolean;
  hasTotalPoints: boolean;
  hasTrickPoints: boolean;
  turnIndicatorSignature: string;
  arenaText: string;
}

async function inspectCenterArena(page: Page): Promise<CenterArenaInspection> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('div, section'));
    let arenaEl: HTMLElement | null = null;
    let bestTextLen = Number.POSITIVE_INFINITY;

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const text = el.innerText ?? '';
      if (
        /Round\s*\d+\s*\/\s*10/i.test(text) &&
        /Total\s*(?:Points|Pts)/i.test(text) &&
        /Trick\s*(?:Points|Pts)/i.test(text) &&
        text.length < bestTextLen
      ) {
        arenaEl = el;
        bestTextLen = text.length;
      }
    }

    if (!arenaEl) {
      return {
        found: false,
        hasRoundBadge: false,
        hasTotalPoints: false,
        hasTrickPoints: false,
        turnIndicatorSignature: '',
        arenaText: '',
      };
    }

    let expanded: HTMLElement = arenaEl;
    if (expanded.parentElement) {
      const parentText = expanded.parentElement.innerText ?? '';
      if (parentText.length < 700) {
        expanded = expanded.parentElement;
      }
    }

    const indicatorParts: string[] = [];
    const indicatorNodes = expanded.querySelectorAll(
      '[data-active], [data-active-seat], [data-turn], [data-turn-seat], [data-direction], [aria-current], [aria-label*="turn" i], [aria-label*="arrow" i], [class*="arrow" i], [class*="turn" i], [class*="active" i], svg',
    );
    indicatorNodes.forEach((node, idx) => {
      const style = window.getComputedStyle(node);
      indicatorParts.push(
        [
          idx,
          node.tagName,
          node.getAttribute('data-active') ?? '',
          node.getAttribute('data-active-seat') ?? '',
          node.getAttribute('data-turn') ?? '',
          node.getAttribute('data-direction') ?? '',
          node.getAttribute('aria-current') ?? '',
          node.getAttribute('aria-label') ?? '',
          node.getAttribute('class') ?? '',
          style.opacity,
          style.color,
          style.backgroundColor,
          style.borderColor,
          style.transform,
        ].join('|'),
      );
    });

    const text = expanded.innerText ?? '';
    return {
      found: true,
      hasRoundBadge: /Round\s*\d+\s*\/\s*10/i.test(text),
      hasTotalPoints: /Total\s*(?:Points|Pts)/i.test(text),
      hasTrickPoints: /Trick\s*(?:Points|Pts)/i.test(text),
      turnIndicatorSignature: `${indicatorParts.join(';;')}::${text.replace(/\s+/g, ' ').trim()}`,
      arenaText: text,
    };
  });
}

test.describe('Tier 3 Pairwise: Virtual Clocks × Turn Arrows × TRICK_COMPLETE × Reload & Tab Isolation (T3-PW-04, T3-PW-05)', () => {
  test('T3-PW-04: 25s bid timeout (->50), Center Arena turn arrows, 20s play timeout (->min card), and 2.2s TRICK_COMPLETE window', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Kamal');
    await fillBotsAndStartMatch(page);

    const bidTurn = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    expect(bidTurn.phase).toBe('BIDDING');
    expect(bidTurn.activeSeat).toBe(0);
    expect(bidTurn.seats[0].call).toBeNull();

    const arenaAtHumanBid = await inspectCenterArena(page);
    expect(arenaAtHumanBid.found).toBe(true);
    expect(arenaAtHumanBid.hasRoundBadge).toBe(true);
    expect(arenaAtHumanBid.hasTotalPoints).toBe(true);
    expect(arenaAtHumanBid.hasTrickPoints).toBe(true);

    // At +15s (< 25s BID_TIMEOUT_MS), human has NOT timed out yet
    await advanceClockStepped(page, 15_000, 500);
    const midBidTimeout = await readStoredGameState(page, roomCode);
    expect(midBidTimeout?.phase).toBe('BIDDING');
    expect(midBidTimeout?.activeSeat).toBe(0);
    expect(midBidTimeout?.seats[0].call).toBeNull();

    // Advance to 24.2s, then step in 200ms increments until 25s timeout fires (before all 3 bots finish bidding)
    await advanceClockStepped(page, 9_200, 400);
    let postBidTimeout = await readStoredGameState(page, roomCode);
    for (let step = 0; step < 15; step += 1) {
      if (postBidTimeout && postBidTimeout.seats[0].call !== null) {
        break;
      }
      await advanceClockStepped(page, 200, 200);
      postBidTimeout = await readStoredGameState(page, roomCode);
    }

    expect(postBidTimeout?.seats[0].call).toBe(50);
    expect(postBidTimeout?.activeSeat).not.toBe(0);

    const arenaAtBotTurn = await inspectCenterArena(page);
    expect(arenaAtBotTurn.turnIndicatorSignature).not.toBe(
      arenaAtHumanBid.turnIndicatorSignature,
    );

    // Wait for bots to finish bidding and reach human Trick 1 PLAYING turn
    const playTurn = await waitForHumanPlayTurn(page, roomCode, 20_000, true);
    expect(playTurn.phase).toBe('PLAYING');
    expect(playTurn.activeSeat).toBe(0);
    expect(playTurn.seats[0].hand).toHaveLength(5);

    const expectedLowestCard = Math.min(...playTurn.seats[0].hand);

    // At +12s (< 20s PLAY_TIMEOUT_MS), lowest card is still in hand
    await advanceClockStepped(page, 12_000, 500);
    const midPlayTimeout = await readStoredGameState(page, roomCode);
    expect(midPlayTimeout?.phase).toBe('PLAYING');
    expect(midPlayTimeout?.seats[0].hand).toHaveLength(5);
    expect(midPlayTimeout?.seats[0].hand).toContain(expectedLowestCard);

    // Advance to 19.2s, then step in 200ms increments until 20s play timeout auto-plays lowest card
    await advanceClockStepped(page, 7_200, 400);
    let postPlayTimeout = await readStoredGameState(page, roomCode);
    for (let step = 0; step < 15; step += 1) {
      if (postPlayTimeout && postPlayTimeout.seats[0].hand.length < 5) {
        break;
      }
      await advanceClockStepped(page, 200, 200);
      postPlayTimeout = await readStoredGameState(page, roomCode);
    }

    expect(postPlayTimeout?.seats[0].hand).toHaveLength(4);
    expect(postPlayTimeout?.seats[0].hand).not.toContain(expectedLowestCard);

    // Step in 100ms chunks until bots finish Trick 1 and enter 2.2s TRICK_COMPLETE pause
    let trickCompleteSnap: OpaqueGameSnapshot | null = postPlayTimeout;
    for (let step = 0; step < 60; step += 1) {
      if (trickCompleteSnap?.phase === 'TRICK_COMPLETE') {
        break;
      }
      await advanceClockStepped(page, 100, 100);
      trickCompleteSnap = await readStoredGameState(page, roomCode);
    }

    expect(trickCompleteSnap?.phase).toBe('TRICK_COMPLETE');
    expect(trickCompleteSnap?.trickNumber).toBe(1);
    expect(trickCompleteSnap?.currentTrick).toHaveLength(4);

    const trick1Cards = (trickCompleteSnap?.currentTrick ?? []).map(
      (play) => play.card,
    );

    // At +1100ms (< 2200ms TRICK_COMPLETE_MS), trick cards remain visible in TRICK_COMPLETE
    await advanceClockStepped(page, 1_100, 250);
    const midTrickPause = await readStoredGameState(page, roomCode);
    expect(midTrickPause?.phase).toBe('TRICK_COMPLETE');
    expect(midTrickPause?.currentTrick).toHaveLength(4);
    const arenaMidPause = await inspectCenterArena(page);
    for (const cardVal of trick1Cards) {
      expect(arenaMidPause.arenaText).toContain(String(cardVal));
    }

    // At +2500ms total (+1400ms more > 2200ms), Trick 1 clears and Trick 2 begins
    await advanceClockStepped(page, 1_400, 250);
    for (let extra = 0; extra < 6; extra += 1) {
      const check = await readStoredGameState(page, roomCode);
      if (check?.phase === 'PLAYING' && check.trickNumber === 2) {
        break;
      }
      await advanceClockStepped(page, 200, 200);
    }
    const afterTrickPause = await readStoredGameState(page, roomCode);
    expect(afterTrickPause?.phase).toBe('PLAYING');
    expect(afterTrickPause?.trickNumber).toBe(2);
    const trick2Cards = (afterTrickPause?.currentTrick ?? []).map(
      (play) => play.card,
    );
    for (const oldCard of trick1Cards) {
      expect(trick2Cards).not.toContain(oldCard);
    }

    monitors.assertClean();
  });

  test('T3-PW-05: mid-Round-1-Trick-2 page.reload() restoration & multi-tab sessionStorage clientId isolation', async ({
    context,
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Nadia');
    await fillBotsAndStartMatch(page);

    await waitForHumanCallTurn(page, roomCode);
    await placeQuickCall(page, 100);

    await waitForHumanPlayTurn(page, roomCode);
    const playedTrick1 = await playCardValue(page, roomCode);

    // Advance into Trick 2 of Round 1
    await expect
      .poll(
        async () => {
          const s = await readStoredGameState(page, roomCode);
          return s?.phase === 'PLAYING' && s.trickNumber === 2;
        },
        {
          message: 'Expected Round 1 Trick 2 PLAYING phase before reload',
          timeout: 15_000,
        },
      )
      .toBe(true);

    const preIdentity = await readSessionIdentity(page, roomCode);
    const preState = await readStoredGameState(page, roomCode);
    expect((preIdentity.clientId ?? '').length).toBeGreaterThan(0);
    expect(preIdentity.seatIndex).toBe(0);
    expect(preState?.round).toBe(1);
    expect(preState?.trickNumber).toBe(2);
    expect(preState?.seats[0].call).toBe(100);
    expect(preState?.seats[0].hand).not.toContain(playedTrick1);

    // Reload Tab 1 mid-Trick 2 and verify exact session + state restoration
    await reloadRoomState(page, roomCode, 'Nadia');
    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const postIdentity = await readSessionIdentity(page, roomCode);
    const postState = await readStoredGameState(page, roomCode);
    expect(postIdentity.clientId).toBe(preIdentity.clientId);
    expect(postIdentity.seatIndex).toBe(0);
    expect(postState?.roomCode).toBe(roomCode);
    expect(postState?.round).toBe(1);
    expect(postState?.trickNumber ?? 0).toBeGreaterThanOrEqual(2);
    expect(postState?.seats[0].call).toBe(100);
    expect(postState?.version ?? 0).toBeGreaterThanOrEqual(
      preState?.version ?? 0,
    );

    // Verify human can still play Trick 2 cleanly after reload
    await waitForHumanPlayTurn(page, roomCode);
    const handCountBeforeTrick2 =
      (await readStoredGameState(page, roomCode))?.seats[0].hand.length ?? 0;
    await playCardValue(page, roomCode);
    await expect
      .poll(
        async () =>
          (await readStoredGameState(page, roomCode))?.seats[0].hand.length ??
          -1,
        { timeout: 10_000 },
      )
      .toBe(handCountBeforeTrick2 - 1);

    // Multi-tab sessionStorage clientId isolation in same BrowserContext
    const page2 = await context.newPage();
    const monitors2 = attachRuntimeMonitors(page2);
    try {
      await page2.goto('/');
      const tab2Before = await readSessionIdentity(page2, roomCode);
      expect(tab2Before.clientId).not.toBe(preIdentity.clientId);
      expect(tab2Before.seatIndex).toBeNull();

      const roomCode2 = await createRoomAndEnter(page2, 'Rohan');
      const tab2Joined = await readSessionIdentity(page2, roomCode2);
      expect((tab2Joined.clientId ?? '').length).toBeGreaterThan(0);
      expect(tab2Joined.clientId).not.toBe(preIdentity.clientId);
      expect(tab2Joined.seatIndex).toBe(0);

      // Tab 1 identity & room remain untouched
      const tab1Check = await readSessionIdentity(page, roomCode);
      expect(tab1Check.clientId).toBe(preIdentity.clientId);
      expect((await readStoredGameState(page, roomCode))?.roomCode).toBe(
        roomCode,
      );

      monitors2.assertClean();
    } finally {
      await page2.close();
    }

    monitors.assertClean();
  });
});
