import { expect, test } from '@playwright/test';
import {
  addBotsCount,
  attachRuntimeMonitors,
  BOT_NAMES,
  createRoomAndEnter,
  extractRoomCodeFromPage,
  fillBotsAndStartMatch,
  GENERATED_ROOM_CODE_REGEX,
  getAddBotButtons,
  getCopyInviteButton,
  getCreateRoomButton,
  getJoinRoomButton,
  getJoinRoomInput,
  getNicknameInput,
  getStartMatchButton,
  joinRoomViaUi,
  readStoredGameState,
  VALID_ROOM_CODE_REGEX,
} from './helpers/tabletop';

test.describe('Tier 1 — Lobby, Room Codes & AI Bots (F-04, F-05, F-06)', () => {
  test('T1-F04-01: Create Room generates TNG-[A-Z]{2}\\d{2} code, enters Seat 0 lobby, and copies ?room= invite URL', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const nicknameInput = getNicknameInput(page);
    const createBtn = getCreateRoomButton(page);
    const joinInput = getJoinRoomInput(page);
    const joinBtn = getJoinRoomButton(page);

    await expect(nicknameInput).toBeVisible();
    await expect(createBtn).toBeVisible();
    await expect(joinInput).toBeVisible();
    await expect(joinBtn).toBeVisible();

    const roomCode = await createRoomAndEnter(page, 'Rafi');
    expect(roomCode).toMatch(GENERATED_ROOM_CODE_REGEX);
    expect(roomCode).toMatch(VALID_ROOM_CODE_REGEX);
    await expect(page.locator('body')).toContainText(roomCode);
    await expect(page.locator('body')).toContainText('Rafi');

    const copyBtn = getCopyInviteButton(page);
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();

    const copiedUrl = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(copiedUrl).toContain(`?room=${roomCode}`);

    monitors.assertClean();
  });

  test('T1-F05-01: ?room= auto-populates Join Room input across valid partitions and Join transitions into the room', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);

    await page.goto('/?room=TNG-KM47');
    const joinInputKm47 = getJoinRoomInput(page);
    await expect(joinInputKm47).toBeVisible();
    await expect(joinInputKm47).toHaveValue(/TNG-KM47/i);

    await page.goto('/?room=TNG-XX');
    const joinInputXx = getJoinRoomInput(page);
    await expect(joinInputXx).toBeVisible();
    await expect(joinInputXx).toHaveValue(/TNG-XX/i);

    await page.goto('/');
    await joinRoomViaUi(page, 'Mina', 'TNG-42');

    await expect
      .poll(() => extractRoomCodeFromPage(page), { timeout: 10_000 })
      .toBe('TNG-42');

    const snapshot = await readStoredGameState(page, 'TNG-42');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.roomCode).toBe('TNG-42');
    expect(snapshot?.seats).toHaveLength(4);
    expect(snapshot?.seats.some((seat) => seat.username === 'Mina')).toBe(true);

    monitors.assertClean();
  });

  test('T1-F06-01: 4-seat lobby manages AI bots (Siam, Apon, Nabil) and blocks Start Match with fewer than 4 players', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Tariq');
    const initialState = await readStoredGameState(page, roomCode);
    expect(initialState).not.toBeNull();
    expect(initialState?.phase).toBe('LOBBY');
    expect(initialState?.seats).toHaveLength(4);
    expect(initialState?.seats[0].type).toBe('HUMAN');
    expect(initialState?.seats[0].username).toBe('Tariq');
    expect(
      initialState?.seats.filter((seat) => seat.type === 'EMPTY').length,
    ).toBe(3);

    const startBtn = getStartMatchButton(page);
    if (await startBtn.isVisible().catch(() => false)) {
      await expect(startBtn).toBeDisabled();
    }

    await addBotsCount(page, 1);
    const oneBotState = await readStoredGameState(page, roomCode);
    const firstBot = oneBotState?.seats.find((seat) => seat.type === 'AI');
    expect(oneBotState?.seats.filter((seat) => seat.type === 'AI')).toHaveLength(1);
    expect(BOT_NAMES).toContain(firstBot?.username);
    if (await startBtn.isVisible().catch(() => false)) {
      await expect(startBtn).toBeDisabled();
    }

    await addBotsCount(page, 3);
    const threeBotsState = await readStoredGameState(page, roomCode);
    const botNamesInLobby =
      threeBotsState?.seats
        .filter((seat) => seat.type === 'AI')
        .map((seat) => seat.username) ?? [];
    expect(botNamesInLobby).toHaveLength(3);
    expect([...botNamesInLobby].sort()).toEqual([...BOT_NAMES].sort());
    for (const botName of BOT_NAMES) {
      await expect(page.locator('body')).toContainText(botName);
    }
    await expect(startBtn).toBeEnabled();

    await addBotsCount(page, 2);
    const twoBotsState = await readStoredGameState(page, roomCode);
    expect(
      twoBotsState?.seats.filter((seat) => seat.type === 'AI').length,
    ).toBe(2);
    if (await startBtn.isVisible().catch(() => false)) {
      await expect(startBtn).toBeDisabled();
    }
    expect((await getAddBotButtons(page).count()) > 0).toBe(true);

    await addBotsCount(page, 3);
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible({
      timeout: 10_000,
    });
    const startedState = await readStoredGameState(page, roomCode);
    expect(startedState?.phase).toBe('BIDDING');
    expect(startedState?.round).toBe(1);

    monitors.assertClean();
  });

  test('T1-F06-02: Fill Bots & Start fills empty seats with Siam, Apon, Nabil and begins Round 1 immediately', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Nadia');
    await fillBotsAndStartMatch(page);

    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible();
    const state = await readStoredGameState(page, roomCode);
    expect(state).not.toBeNull();
    expect(state?.round).toBe(1);
    expect(state?.phase).toBe('BIDDING');
    const seatNames = state?.seats.map((seat) => seat.username) ?? [];
    expect(seatNames).toContain('Nadia');
    for (const botName of BOT_NAMES) {
      expect(seatNames).toContain(botName);
    }

    monitors.assertClean();
  });
});
