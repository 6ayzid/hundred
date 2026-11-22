import { expect, test } from '@playwright/test';
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
  sendCustomChatMessage,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
} from './helpers/tabletop';

test.describe('Tier 1 — Sync, Storage, Session Identity & Shot-Clocks (F-12..F-16)', () => {
  test('T1-F12/13/14/16-01: local fallback sync, sessionStorage isolation, monotonic version, chat non-echo & reload recovery', async ({
    context,
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Faisal');
    const identityA = await readSessionIdentity(page, roomCode);

    expect(typeof identityA.clientId).toBe('string');
    expect((identityA.clientId ?? '').length).toBeGreaterThan(0);
    expect(identityA.seatIndex).toBe(0);

    const lobbySnap = await readStoredGameState(page, roomCode);
    expect(lobbySnap).not.toBeNull();
    expect(lobbySnap?.roomCode).toBe(roomCode);
    expect(lobbySnap?.seats[0].clientId).toBe(identityA.clientId);
    expect(lobbySnap?.version).toBeGreaterThanOrEqual(1);

    await fillBotsAndStartMatch(page);
    const startSnap = await readStoredGameState(page, roomCode);
    const v1 = startSnap?.version ?? 0;
    expect(v1).toBeGreaterThanOrEqual(1);

    await waitForHumanCallTurn(page, roomCode);
    await placeQuickCall(page, 100);

    await expect
      .poll(
        async () => {
          const snap = await readStoredGameState(page, roomCode);
          return snap?.seats[0].call ?? null;
        },
        { timeout: 10_000 },
      )
      .toBe(100);

    const postBidSnap = await readStoredGameState(page, roomCode);
    const v2 = postBidSnap?.version ?? 0;
    expect(v2).toBeGreaterThan(v1);

    await waitForHumanPlayTurn(page, roomCode);
    await playCardValue(page, roomCode);

    await expect
      .poll(
        async () => {
          const snap = await readStoredGameState(page, roomCode);
          return snap?.seats[0].hand.length ?? 5;
        },
        { timeout: 10_000 },
      )
      .toBe(4);

    const postPlaySnap = await readStoredGameState(page, roomCode);
    const v3 = postPlaySnap?.version ?? 0;
    expect(v3).toBeGreaterThan(v2);

    const uniqueChatText = 'SyncCheckSingleEcho99';
    await sendCustomChatMessage(page, uniqueChatText);
    await expect(page.getByText(uniqueChatText)).toHaveCount(1);

    const tab2 = await context.newPage();
    try {
      await tab2.goto('/');
      const room2 = await createRoomAndEnter(tab2, 'Nusrat');
      const identityTab2 = await readSessionIdentity(tab2, room2);
      expect((identityTab2.clientId ?? '').length).toBeGreaterThan(0);
      expect(identityTab2.clientId).not.toBe(identityA.clientId);
    } finally {
      await tab2.close();
    }

    await reloadRoomState(page, roomCode, 'Faisal');
    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const identityAfterReload = await readSessionIdentity(page, roomCode);
    expect(identityAfterReload.clientId).toBe(identityA.clientId);
    expect(identityAfterReload.seatIndex).toBe(0);

    const snapAfterReload = await readStoredGameState(page, roomCode);
    expect(snapAfterReload).not.toBeNull();
    expect(snapAfterReload?.roomCode).toBe(roomCode);
    expect(snapAfterReload?.version).toBeGreaterThanOrEqual(v3);
    expect(snapAfterReload?.seats[0].call).toBe(100);

    monitors.assertClean();
  });

  test('T1-F15-01: 25s bidding shot-clock auto-calls 50 and 20s play shot-clock auto-plays lowest card', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await installVirtualClock(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'ClockUser');
    await fillBotsAndStartMatch(page);

    const identity = await readSessionIdentity(page, roomCode);
    const mySeat = identity.seatIndex ?? 0;

    const bidSnap = await waitForHumanCallTurn(page, roomCode, 20_000, true);
    expect(bidSnap.turnDeadline).not.toBeNull();
    expect(bidSnap.turnDeadline ?? 0).toBeGreaterThan(0);
    expect(bidSnap.seats[mySeat].call).toBeNull();

    await advanceClockStepped(page, 18_000, 500);
    const beforeBidExpiry = await readStoredGameState(page, roomCode);
    expect(beforeBidExpiry?.seats[mySeat].call).toBeNull();

    await advanceClockStepped(page, 7_500, 500);
    for (let extra = 0; extra < 6; extra += 1) {
      const check = await readStoredGameState(page, roomCode);
      if (check && check.seats[mySeat].call !== null) {
        break;
      }
      await advanceClockStepped(page, 500, 500);
    }

    const afterBidExpiry = await readStoredGameState(page, roomCode);
    expect(afterBidExpiry?.seats[mySeat].call).toBe(50);

    const playSnap = await waitForHumanPlayTurn(page, roomCode, 20_000, true);
    const handBefore = [...playSnap.seats[mySeat].hand];
    const lowestCard = Math.min(...handBefore);
    expect(playSnap.turnDeadline).not.toBeNull();
    expect(playSnap.turnDeadline ?? 0).toBeGreaterThan(0);
    expect(handBefore).toHaveLength(5);

    await advanceClockStepped(page, 14_000, 500);
    const beforePlayExpiry = await readStoredGameState(page, roomCode);
    expect(beforePlayExpiry?.seats[mySeat].hand).toHaveLength(5);

    await advanceClockStepped(page, 6_500, 500);
    for (let extra = 0; extra < 6; extra += 1) {
      const check = await readStoredGameState(page, roomCode);
      if (check && check.seats[mySeat].hand.length < handBefore.length) {
        break;
      }
      await advanceClockStepped(page, 500, 500);
    }

    const afterPlayExpiry = await readStoredGameState(page, roomCode);
    const handAfter = afterPlayExpiry?.seats[mySeat].hand ?? [];
    expect(handAfter).toHaveLength(handBefore.length - 1);
    expect(handAfter).not.toContain(lowestCard);

    monitors.assertClean();
  });
});
