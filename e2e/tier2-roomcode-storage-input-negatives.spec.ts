import { expect, test } from '@playwright/test';
import {
  addBotsCount,
  attachRuntimeMonitors,
  createRoomAndEnter,
  extractRoomCodeFromPage,
  fillBotsAndStartMatch,
  getAddBotButtons,
  getCreateRoomButton,
  getJoinRoomButton,
  getJoinRoomInput,
  getNicknameInput,
  joinRoomViaUi,
  readStoredGameState,
} from './helpers/tabletop';

test.describe('Tier 2 — Room Code Normalization, Input Validation & Storage Recovery (F-04, F-05, F-16)', () => {
  test('T2-F04-01: Valid room code normalization handles lowercase, whitespace, short codes, and pasted ?room= URLs', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    const validInputs: Array<{ raw: string; expected: string }> = [
      { raw: 'tng-42', expected: 'TNG-42' },
      { raw: 'TNG-XX', expected: 'TNG-XX' },
      { raw: 'TNG-KM47', expected: 'TNG-KM47' },
      { raw: '  tng-ab12  ', expected: 'TNG-AB12' },
      { raw: 'https://example.com/?room=tng-zz99', expected: 'TNG-ZZ99' },
    ];

    for (const item of validInputs) {
      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });

      await joinRoomViaUi(page, 'NormUser', item.raw);

      await expect
        .poll(() => extractRoomCodeFromPage(page), { timeout: 8_000 })
        .toBe(item.expected);

      const snapshot = await readStoredGameState(page, item.expected);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.roomCode).toBe(item.expected);
      expect(snapshot?.phase).toBe('LOBBY');
      expect(snapshot?.seats).toHaveLength(4);
      expect(
        snapshot?.seats.some((seat) => seat.username === 'NormUser'),
      ).toBe(true);
    }

    await page.goto('/?room=tng-zz99');
    await expect(getJoinRoomInput(page)).toHaveValue(/tng-zz99/i);
    await expect(getNicknameInput(page)).toBeVisible();
    await expect(getJoinRoomButton(page)).toBeVisible();

    monitors.assertClean();
  });

  test('T2-F04-02: Invalid room codes are rejected without entering a seat lobby or creating storage state', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    const invalidCodes = [
      '',
      'BAD',
      'TNG-',
      'TNG-1',
      'TNG-ABCDEFG',
      'TNG-bad/code',
      'TNG-42?x=1',
    ];

    await page.goto('/');

    for (const badCode of invalidCodes) {
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });

      await joinRoomViaUi(page, 'Rafi', badCode, { allowDisabled: true });

      const activeRoom = await extractRoomCodeFromPage(page);
      expect(activeRoom).toBeNull();
      await expect(getJoinRoomInput(page)).toBeVisible();
      await expect(getCreateRoomButton(page)).toBeVisible();
      expect(await getAddBotButtons(page).count()).toBe(0);

      const storedKeysCount = await page.evaluate(() => {
        let count = 0;
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith('eksho_state_')) {
            count += 1;
          }
        }
        return count;
      });
      expect(storedKeysCount).toBe(0);
    }

    await page.goto('/?room=BAD');
    await expect(getCreateRoomButton(page)).toBeVisible();
    expect(await getAddBotButtons(page).count()).toBe(0);

    monitors.assertClean();
  });

  test('T2-F05-01: Blank nicknames are blocked while Bangla Unicode "রাফি" and colliding "Siam" work cleanly', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const nicknameInput = getNicknameInput(page);
    const createBtn = getCreateRoomButton(page);

    for (const blank of ['', '   ']) {
      await nicknameInput.fill(blank);
      if (await createBtn.isEnabled()) {
        await createBtn.click();
      }
      expect(await extractRoomCodeFromPage(page)).toBeNull();
      await expect(getCreateRoomButton(page)).toBeVisible();

      await joinRoomViaUi(page, blank, 'TNG-KM47', { allowDisabled: true });
      expect(await extractRoomCodeFromPage(page)).toBeNull();
      await expect(getJoinRoomButton(page)).toBeVisible();
    }

    const banglaRoom = await createRoomAndEnter(page, 'রাফি');
    const banglaSnap = await readStoredGameState(page, banglaRoom);
    expect(banglaSnap).not.toBeNull();
    expect(banglaSnap?.phase).toBe('LOBBY');
    expect(banglaSnap?.seats).toHaveLength(4);
    expect(banglaSnap?.seats[0].type).toBe('HUMAN');
    expect(banglaSnap?.seats[0].username).toBe('রাফি');
    await expect(page.locator('body')).toContainText('রাফি');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });

    const collidingRoom = await createRoomAndEnter(page, 'Siam');
    await addBotsCount(page, 3);
    const collidingSnap = await readStoredGameState(page, collidingRoom);
    expect(collidingSnap?.seats[0].type).toBe('HUMAN');
    expect(collidingSnap?.seats[0].username).toBe('Siam');
    expect(
      collidingSnap?.seats.filter((seat) => seat.type === 'AI').length,
    ).toBe(3);

    await fillBotsAndStartMatch(page);
    const startedColliding = await readStoredGameState(page, collidingRoom);
    expect(startedColliding?.phase).toBe('BIDDING');
    expect(startedColliding?.seats[0].type).toBe('HUMAN');

    monitors.assertClean();
  });

  test('T2-F16-01: Corrupt JSON and invalid schema in localStorage with empty sessionStorage recover cleanly', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await page.evaluate(() => {
      window.localStorage.setItem(
        'eksho_state_TNG-KM47',
        '{not-valid-json!!!',
      );
      window.sessionStorage.clear();
    });

    await page.goto('/?room=TNG-KM47');
    await expect(getJoinRoomInput(page)).toBeVisible();
    await expect(getJoinRoomInput(page)).toHaveValue(/TNG-KM47/i);
    await expect(getJoinRoomButton(page)).toBeVisible();

    await page.evaluate(() => {
      window.localStorage.setItem(
        'eksho_state_TNG-KM47',
        JSON.stringify({ corrupt: true, seats: 'bad', round: -99 }),
      );
      window.sessionStorage.clear();
    });

    await page.goto('/?room=TNG-KM47');
    await expect(getNicknameInput(page)).toBeVisible();
    await joinRoomViaUi(page, 'RecoveredHost', 'TNG-KM47');

    await expect
      .poll(() => extractRoomCodeFromPage(page), { timeout: 8_000 })
      .toBe('TNG-KM47');

    const recovered = await readStoredGameState(page, 'TNG-KM47');
    expect(recovered).not.toBeNull();
    expect(recovered?.roomCode).toBe('TNG-KM47');
    expect(recovered?.phase).toBe('LOBBY');
    expect(recovered?.seats).toHaveLength(4);
    expect(
      recovered?.seats.some((seat) => seat.username === 'RecoveredHost'),
    ).toBe(true);
    await expect(page.locator('body')).toContainText('RecoveredHost');
    await expect(page.locator('body')).toContainText('TNG-KM47');

    monitors.assertClean();
  });
});
