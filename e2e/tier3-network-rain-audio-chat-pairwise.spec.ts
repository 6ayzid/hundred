import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  BANTER_CHIPS,
  attachRuntimeMonitors,
  createRoomAndEnter,
  extractRoomCodeFromPage,
  fillBotsAndStartMatch,
  getChatToggleButton,
  getHandCardButtons,
  getHoldToTalkButton,
  getJoinRoomButton,
  getJoinRoomInput,
  getNicknameInput,
  getOpenMicButton,
  getRainToggle,
  getVillage3GToggle,
  inspectRainAnimationState,
  openChatDrawer,
  placeQuickCall,
  playCardValue,
  readStoredGameState,
  sendChatBanterChip,
  sendCustomChatMessage,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
} from './helpers/tabletop';

async function readToggleControlSnapshot(control: Locator): Promise<string> {
  return control.evaluate((el) => {
    return JSON.stringify({
      ariaPressed: el.getAttribute('aria-pressed') ?? '',
      ariaLabel: el.getAttribute('aria-label') ?? '',
      dataActive: el.getAttribute('data-active') ?? '',
      dataState: el.getAttribute('data-state') ?? '',
      text: (el.textContent ?? '').trim(),
      className: el.className,
    });
  });
}

async function countChatDrawerOccurrences(
  page: Page,
  phrase: string,
): Promise<number> {
  return page.evaluate((target) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const chipButton = buttons.find(
      (btn) => (btn.textContent ?? '').trim() === '100 charlam!',
    );
    let container: HTMLElement | null = chipButton?.parentElement ?? null;
    while (container && container.parentElement) {
      const text = container.innerText ?? '';
      if (
        text.includes('100 charlam!') &&
        text.includes('Call koto?') &&
        text.includes('Chales!') &&
        container.querySelectorAll('input, textarea').length > 0
      ) {
        break;
      }
      container = container.parentElement;
    }
    const scopeText = (container ?? document.body).innerText ?? '';
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = scopeText.indexOf(target, searchFrom);
      if (idx === -1) break;
      count += 1;
      searchFrom = idx + target.length;
    }
    return count;
  }, phrase);
}

test.describe('Tier 3 Pairwise: Village 3G × Rain × Audio Controls & ?room= Join + Banter (T3-PW-02, T3-PW-03)', () => {
  test('T3-PW-02: Village 3G × Rain × Open Mic / Hold-to-Talk pairwise state matrix preserves explicit Rain OFF', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Shuvo');
    await fillBotsAndStartMatch(page);

    const village3gBtn = getVillage3GToggle(page);
    const rainBtn = getRainToggle(page);
    const openMicBtn = getOpenMicButton(page);
    const pttBtn = getHoldToTalkButton(page);

    await expect(village3gBtn).toBeVisible();
    await expect(rainBtn).toBeVisible();
    await expect(openMicBtn).toBeVisible();
    await expect(pttBtn).toBeVisible();

    // Baseline: Rain active, Village 3G off
    const baselineRain = await inspectRainAnimationState(page);
    expect(baselineRain.elementCount).toBeGreaterThanOrEqual(1);
    expect(baselineRain.hasActiveAnimation).toBe(true);
    expect(baselineRain.isPaused).toBe(false);

    const village3gOffSnap = await readToggleControlSnapshot(village3gBtn);
    const rainOnSnap = await readToggleControlSnapshot(rainBtn);
    const micIdleSnap = await readToggleControlSnapshot(openMicBtn);
    const pttIdleSnap = await readToggleControlSnapshot(pttBtn);

    // Pairwise State A: Village 3G ON -> pauses CSS rain without changing match
    await village3gBtn.click();
    const village3gOnSnap = await readToggleControlSnapshot(village3gBtn);
    expect(village3gOnSnap).not.toBe(village3gOffSnap);

    await expect
      .poll(async () => (await inspectRainAnimationState(page)).isPaused, {
        timeout: 5_000,
      })
      .toBe(true);
    const rainUnder3g = await inspectRainAnimationState(page);
    expect(rainUnder3g.hasActiveAnimation).toBe(false);

    // Audio controls under Village 3G ON: Open Mic toggle & Hold-to-Talk press/release
    await openMicBtn.click();
    const micActiveUnder3g = await readToggleControlSnapshot(openMicBtn);
    expect(micActiveUnder3g).not.toBe(micIdleSnap);
    await openMicBtn.click();
    expect(await readToggleControlSnapshot(openMicBtn)).toBe(micIdleSnap);

    const pttBox3g = await pttBtn.boundingBox();
    expect(pttBox3g).not.toBeNull();
    if (!pttBox3g) {
      throw new Error('Expected Hold-to-Talk button bounding box under Village 3G');
    }
    await page.mouse.move(
      pttBox3g.x + pttBox3g.width / 2,
      pttBox3g.y + pttBox3g.height / 2,
    );
    await page.mouse.down();
    const pttActive3g = await readToggleControlSnapshot(pttBtn);
    expect(pttActive3g).not.toBe(pttIdleSnap);
    await page.mouse.up();
    expect(await readToggleControlSnapshot(pttBtn)).toBe(pttIdleSnap);

    // Explicitly turn Rain OFF while Village 3G is ON, then turn Village 3G OFF
    await rainBtn.click();
    const rainOffSnap = await readToggleControlSnapshot(rainBtn);
    expect(rainOffSnap).not.toBe(rainOnSnap);

    await village3gBtn.click();
    expect(await readToggleControlSnapshot(village3gBtn)).toBe(
      village3gOffSnap,
    );

    // Explicit Rain OFF preference MUST remain respected after Village 3G turns OFF
    const rainAfter3gOff = await inspectRainAnimationState(page);
    expect(rainAfter3gOff.hasActiveAnimation).toBe(false);
    expect(rainAfter3gOff.isPaused).toBe(true);

    // Turn Rain explicitly back ON while Village 3G is OFF
    await rainBtn.click();
    await expect
      .poll(
        async () =>
          (await inspectRainAnimationState(page)).hasActiveAnimation,
        { timeout: 5_000 },
      )
      .toBe(true);

    // Audio controls under Village 3G OFF + Rain ON
    await openMicBtn.click();
    expect(await readToggleControlSnapshot(openMicBtn)).not.toBe(micIdleSnap);
    await openMicBtn.click();
    expect(await readToggleControlSnapshot(openMicBtn)).toBe(micIdleSnap);

    const pttBoxNormal = await pttBtn.boundingBox();
    expect(pttBoxNormal).not.toBeNull();
    if (!pttBoxNormal) {
      throw new Error('Expected Hold-to-Talk button bounding box in normal mode');
    }
    await page.mouse.move(
      pttBoxNormal.x + pttBoxNormal.width / 2,
      pttBoxNormal.y + pttBoxNormal.height / 2,
    );
    await page.mouse.down();
    expect(await readToggleControlSnapshot(pttBtn)).not.toBe(pttIdleSnap);
    await page.mouse.up();
    expect(await readToggleControlSnapshot(pttBtn)).toBe(pttIdleSnap);

    // Match state stays completely intact across atmosphere & audio transitions
    const snapshot = await readStoredGameState(page, roomCode);
    expect(snapshot?.roomCode).toBe(roomCode);
    expect(snapshot?.round).toBe(1);
    expect(snapshot?.phase).not.toBe('LOBBY');

    monitors.assertClean();
  });

  test('T3-PW-03: ?room=tng-42 URL auto-fill × Join × Bangla banter drawer × interactive bidding & card play', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/?room=tng-42');

    const joinInput = getJoinRoomInput(page);
    await expect(joinInput).toBeVisible();
    await expect(joinInput).toHaveValue(/^tng-42$/i);

    const nicknameInput = getNicknameInput(page);
    await expect(nicknameInput).toBeVisible();
    await nicknameInput.fill('Nadia');

    const joinBtn = getJoinRoomButton(page);
    await expect(joinBtn).toBeEnabled();
    await joinBtn.click();

    await expect
      .poll(async () => extractRoomCodeFromPage(page), { timeout: 10_000 })
      .toBe('TNG-42');

    await fillBotsAndStartMatch(page);

    // Send all 4 Bangla/Banglish banter chips + custom message
    await openChatDrawer(page);
    for (const chip of BANTER_CHIPS) {
      await sendChatBanterChip(page, chip);
      await expect
        .poll(() => countChatDrawerOccurrences(page, chip), {
          timeout: 5_000,
        })
        .toBeGreaterThanOrEqual(2);
    }

    const customLine = 'TNG-42 te darun khela!';
    await sendCustomChatMessage(page, customLine);
    await expect(page.getByText(customLine).first()).toBeVisible();

    // Collapse and re-open drawer -> message history preserved
    await getChatToggleButton(page).click();
    await expect(
      page.getByRole('button', { name: BANTER_CHIPS[0], exact: true }).first(),
    ).toBeHidden();
    await openChatDrawer(page);
    await expect(page.getByText(customLine).first()).toBeVisible();

    // Interactive bidding and Trick 1 card play alongside chat
    await waitForHumanCallTurn(page, 'TNG-42');
    await placeQuickCall(page, 100);

    await waitForHumanPlayTurn(page, 'TNG-42');
    const handBefore = await getHandCardButtons(page, 'TNG-42');
    expect(handBefore).toHaveLength(5);

    const playedCard = await playCardValue(page, 'TNG-42');
    await expect
      .poll(
        async () => {
          const state = await readStoredGameState(page, 'TNG-42');
          return state?.seats[0].hand.length ?? -1;
        },
        { timeout: 10_000 },
      )
      .toBe(4);

    const postPlay = await readStoredGameState(page, 'TNG-42');
    expect(postPlay?.seats[0].hand).not.toContain(playedCard);
    expect(postPlay?.seats[0].call).toBe(100);

    monitors.assertClean();
  });
});
