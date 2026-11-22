import { expect, test } from '@playwright/test';
import {
  GENERATED_ROOM_CODE_REGEX,
  attachRuntimeMonitors,
  createRoomAndEnter,
  extractRoomCodeFromPage,
  fillBotsAndStartMatch,
  getAddBotButtons,
  getCopyInviteButton,
  getFillBotsAndStartButton,
  getHandCardButtons,
  getJoinRoomButton,
  getJoinRoomInput,
  getNicknameInput,
  openChatDrawer,
  placeQuickCall,
  playCardValue,
  readSessionIdentity,
  readStoredGameState,
  sendChatBanterChip,
  sendCustomChatMessage,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
} from './helpers/tabletop';

test.describe('Tier 4 E2E: Invite URL Join, Cross-Context Identity, Fallback/Presence Banner & Banter (T4-E2E-02)', () => {
  test('T4-E2E-02: Context A creates room & copies ?room= invite -> Context B auto-populates, joins with distinct clientId, chats & plays', async ({
    browser,
  }) => {
    const contextA = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
    });
    const contextB = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
    });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const monitorsA = attachRuntimeMonitors(pageA);
    const monitorsB = attachRuntimeMonitors(pageB);

    try {
      await pageA.goto('/');
      const roomCode = await createRoomAndEnter(pageA, 'Ayesha');
      expect(roomCode).toMatch(GENERATED_ROOM_CODE_REGEX);

      const copyInviteBtn = getCopyInviteButton(pageA);
      await expect(copyInviteBtn).toBeVisible();
      await expect(copyInviteBtn).toBeEnabled();
      await copyInviteBtn.click();

      let copiedInviteRaw = '';
      await expect
        .poll(
          async () => {
            copiedInviteRaw = await pageA.evaluate(() =>
              navigator.clipboard.readText(),
            );
            return copiedInviteRaw.toUpperCase().includes(`ROOM=${roomCode}`);
          },
          {
            message: `Expected clipboard invite link to contain ?room=${roomCode}`,
            timeout: 5_000,
          },
        )
        .toBe(true);

      const parsedInvite = new URL(copiedInviteRaw, pageA.url());
      expect(parsedInvite.searchParams.get('room')?.toUpperCase()).toBe(
        roomCode,
      );

      // Context B opens copied invite URL -> Join input auto-populates roomCode
      await pageB.goto(parsedInvite.toString());
      await expect(pageB).toHaveTitle(/হান্ডেট\s*\(Hundred\)/);

      const joinInputB = getJoinRoomInput(pageB);
      await expect(joinInputB).toBeVisible();
      await expect(joinInputB).toHaveValue(new RegExp(`^${roomCode}$`, 'i'));

      await getNicknameInput(pageB).fill('Tariq');
      const joinBtnB = getJoinRoomButton(pageB);
      await expect(joinBtnB).toBeEnabled();
      await joinBtnB.click();

      await expect
        .poll(async () => extractRoomCodeFromPage(pageB), { timeout: 10_000 })
        .toBe(roomCode);

      const identityA = await readSessionIdentity(pageA, roomCode);
      const identityB = await readSessionIdentity(pageB, roomCode);
      expect((identityA.clientId ?? '').length).toBeGreaterThan(0);
      expect((identityB.clientId ?? '').length).toBeGreaterThan(0);
      expect(identityA.clientId).not.toBe(identityB.clientId);
      expect(identityA.seatIndex).toBe(0);
      expect(identityB.seatIndex).not.toBeNull();

      // Start match (on pageB in local fallback mode, or pageA if cloud host)
      const fillBtnB = getFillBotsAndStartButton(pageB);
      const canStartOnB =
        ((await fillBtnB.isVisible()) && (await fillBtnB.isEnabled())) ||
        (await getAddBotButtons(pageB).count()) > 0;
      if (canStartOnB) {
        await fillBotsAndStartMatch(pageB);
      } else {
        await fillBotsAndStartMatch(pageA);
      }

      await expect(pageB.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible({
        timeout: 15_000,
      });

      // Verify fallback or presence status banner is clearly shown inside active room
      const statusBanner = pageB
        .getByText(
          /local(?:\s*\/\s*bot|\s*&\s*bot|\s+fallback|\s+mode)?|offline|fallback|unconfigured|connected|presence|text\s*(?:&|and)\s*bot|livekit|voice/i,
        )
        .first();
      await expect(statusBanner).toBeVisible();

      // Bangla/Banglish banter chips + custom message in Context B
      await openChatDrawer(pageB);
      await sendChatBanterChip(pageB, 'Call koto?');
      await expect
        .poll(() => pageB.getByText('Call koto?').count(), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(2);

      await sendChatBanterChip(pageB, 'Chales!');
      await expect
        .poll(() => pageB.getByText('Chales!').count(), { timeout: 5_000 })
        .toBeGreaterThanOrEqual(2);

      const customBanter = 'Khela jomese bhai!';
      await sendCustomChatMessage(pageB, customBanter);
      await expect(pageB.getByText(customBanter).first()).toBeVisible();
      await expect(pageB.getByText('Tariq').first()).toBeVisible();

      // Interactive bidding & playable cards in Context B
      const activeControlPage = canStartOnB ? pageB : pageA;
      await waitForHumanCallTurn(activeControlPage, roomCode);
      await placeQuickCall(activeControlPage, 100);

      const playTurnSnap = await waitForHumanPlayTurn(
        activeControlPage,
        roomCode,
      );
      const controlIdentity = await readSessionIdentity(
        activeControlPage,
        roomCode,
      );
      const controlSeat = controlIdentity.seatIndex ?? 0;
      expect(playTurnSnap.seats[controlSeat].call).toBe(100);

      const handButtons = await getHandCardButtons(activeControlPage, roomCode);
      expect(handButtons).toHaveLength(5);

      const playedCard = await playCardValue(activeControlPage, roomCode);
      await expect
        .poll(
          async () => {
            const snap = await readStoredGameState(activeControlPage, roomCode);
            return snap?.seats[controlSeat].hand.length ?? -1;
          },
          { timeout: 10_000 },
        )
        .toBe(4);

      const postSnap = await readStoredGameState(activeControlPage, roomCode);
      expect(postSnap?.seats[controlSeat].hand).not.toContain(playedCard);

      monitorsA.assertClean();
      monitorsB.assertClean();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
