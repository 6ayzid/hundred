import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export const EXPECTED_DECK = [
  1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 95, 100,
] as const;

export const EXPECTED_DECK_SET: ReadonlySet<number> = new Set<number>(
  EXPECTED_DECK,
);
export const EXPECTED_DECK_SUM = 966;
export const EXCLUDED_CARD = 85;
export const QUICK_CALL_PILLS = [0, 50, 100, 150, 200, 250, 300] as const;
export const BOT_NAMES = ['Siam', 'Apon', 'Nabil'] as const;
export const BANTER_CHIPS = [
  '100 charlam!',
  'Call koto?',
  'Ei bar baji jitbo!',
  'Chales!',
] as const;
export const LEGACY_FORBIDDEN_TERMS = ['একশো', 'Tangail Hundred'] as const;
export const CANONICAL_TITLE_BANGLA = 'হান্ডেট';
export const CANONICAL_TITLE_ENGLISH = 'Hundred';
export const CANONICAL_FULL_TITLE = 'হান্ডেট (Hundred)';
export const GENERATED_ROOM_CODE_REGEX = /^TNG-[A-Z]{2}\d{2}$/;
export const VALID_ROOM_CODE_REGEX = /^TNG-[A-Z0-9]{2,6}$/;

export interface OpaqueSeatSnapshot {
  seatIndex: number;
  type: 'EMPTY' | 'HUMAN' | 'AI' | string;
  clientId: string | null;
  username: string;
  hand: number[];
  call: number | null;
  capturedPoints: number;
  tricksWon: number;
  totalScore: number;
  isOnline: boolean;
}

export interface OpaqueTrickPlay {
  seatIndex: number;
  card: number;
}

export interface OpaqueRoundSeatResult {
  seatIndex: number;
  username: string;
  call: number;
  capturedPoints: number;
  pointsAwarded: number;
  totalAfter: number;
}

export interface OpaqueRoundRecord {
  round: number;
  entries: OpaqueRoundSeatResult[];
}

export interface OpaqueGameSnapshot {
  matchId?: string;
  roomCode: string;
  version: number;
  phase:
    | 'LOBBY'
    | 'BIDDING'
    | 'PLAYING'
    | 'TRICK_COMPLETE'
    | 'ROUND_SUMMARY'
    | 'MATCH_OVER'
    | string;
  round: number;
  roundStarterSeat: number;
  trickNumber: number;
  trickLeaderSeat: number;
  activeSeat: number;
  turnDeadline: number | null;
  emittedAt?: number;
  seats: OpaqueSeatSnapshot[];
  currentTrick: OpaqueTrickPlay[];
  lastTrickWinnerSeat?: number | null;
  lastTrickPoints?: number;
  roundHistory: OpaqueRoundRecord[];
}

export interface FailedRequestRecord {
  url: string;
  status: number;
  method: string;
  failureText?: string;
}

export interface RuntimeMonitors {
  pageErrors: string[];
  consoleErrors: string[];
  hydrationErrors: string[];
  failedRequests: FailedRequestRecord[];
  assertClean: (allowStatuses?: number[]) => void;
}

export interface SessionIdentity {
  clientId: string | null;
  seatIndex: number | null;
  rawKeys: Record<string, string>;
}

export interface HandCardButton {
  button: Locator;
  value: number;
}

export interface RoundCompletionResult {
  summaryState: OpaqueGameSnapshot;
  nextState: OpaqueGameSnapshot;
}

export interface RainAnimationReport {
  elementCount: number;
  visibleCount: number;
  runningCount: number;
  pausedCount: number;
  hasActiveAnimation: boolean;
  isPaused: boolean;
  playStates: string[];
  animationNames: string[];
}

export interface ParsedRgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
  luminance: number;
  hex: string;
  tierGuess:
    | 'brick-red'
    | 'ochre-yellow'
    | 'forest-green'
    | 'cobalt-blue'
    | 'charcoal-gold'
    | 'neutral';
}

export interface HorizontalOverflowReport {
  scrollWidth: number;
  innerWidth: number;
  hasOverflow: boolean;
}

export interface TokenTestServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSeatSnapshot(value: unknown): value is OpaqueSeatSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.seatIndex === 'number' &&
    typeof value.type === 'string' &&
    typeof value.username === 'string' &&
    Array.isArray(value.hand)
  );
}

function isGameSnapshotObject(value: unknown): value is OpaqueGameSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.roomCode === 'string' &&
    typeof value.phase === 'string' &&
    typeof value.round === 'number' &&
    typeof value.activeSeat === 'number' &&
    Array.isArray(value.seats) &&
    value.seats.every(isSeatSnapshot)
  );
}

function unwrapGameSnapshot(parsed: unknown): OpaqueGameSnapshot | null {
  if (isGameSnapshotObject(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && isGameSnapshotObject(parsed.state)) {
    return parsed.state;
  }
  return null;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSeatIndexValue(raw: string | null): number | null {
  if (raw === null || raw.trim() === '' || raw === 'null' || raw === 'undefined') {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 3) {
    return null;
  }
  return parsed;
}

export function attachRuntimeMonitors(page: Page): RuntimeMonitors {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const hydrationErrors: string[] = [];
  const failedRequests: FailedRequestRecord[] = [];

  page.on('pageerror', (error: Error) => {
    pageErrors.push(error.message || String(error));
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      /hydration failed|did not match|text content does not match|there was an error while hydrating|server-rendered html/i.test(
        text,
      )
    ) {
      hydrationErrors.push(text);
    }
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      failedRequests.push({
        url: response.url(),
        status,
        method: response.request().method(),
      });
    }
  });

  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText ?? 'requestfailed';
    if (errorText === 'net::ERR_ABORTED') {
      return;
    }
    failedRequests.push({
      url: request.url(),
      status: 0,
      method: request.method(),
      failureText: errorText,
    });
  });

  const assertClean = (allowStatuses: number[] = []): void => {
    const allowedSet = new Set<number>(allowStatuses);

    expect(pageErrors, 'Uncaught browser page errors').toEqual([]);
    expect(hydrationErrors, 'React hydration mismatch errors').toEqual([]);

    const unexpectedRequests = failedRequests.filter(
      (req) => !allowedSet.has(req.status),
    );
    expect(
      unexpectedRequests,
      'Unexpected failed HTTP/network requests',
    ).toEqual([]);

    const unexpectedConsoleErrors = consoleErrors.filter((message) => {
      if (allowedSet.size === 0) {
        return true;
      }
      for (const status of allowedSet) {
        if (
          new RegExp(`status of ${status}\\b`, 'i').test(message) &&
          /failed to load resource/i.test(message)
        ) {
          return false;
        }
      }
      return true;
    });

    expect(
      unexpectedConsoleErrors,
      'Unexpected browser console.error messages',
    ).toEqual([]);
  };

  return {
    pageErrors,
    consoleErrors,
    hydrationErrors,
    failedRequests,
    assertClean,
  };
}

export function getNicknameInput(page: Page): Locator {
  return page
    .getByLabel(/nickname|your name|player name|নাম/i)
    .or(page.getByPlaceholder(/nickname|your name|enter.*name|নাম/i))
    .first();
}

export function getCreateRoomButton(page: Page): Locator {
  return page.getByRole('button', { name: /create\s*room/i }).first();
}

export function getJoinRoomInput(page: Page): Locator {
  return page
    .getByLabel(/room\s*code|join\s*room/i)
    .or(page.getByPlaceholder(/room\s*code|tng-|enter.*room|join/i))
    .first();
}

export function getJoinRoomButton(page: Page): Locator {
  return page.getByRole('button', { name: /join\s*room/i }).first();
}

export function getCopyInviteButton(page: Page): Locator {
  return page
    .getByRole('button', {
      name: /copy.*invite|copy.*link|copy.*url|copy.*room|invite/i,
    })
    .first();
}

export async function extractRoomCodeFromPage(
  page: Page,
): Promise<string | null> {
  const storageAndDomResult = await page.evaluate(() => {
    const isValidSnap = (val: unknown): val is { roomCode: string } => {
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        return false;
      }
      const rec = val as Record<string, unknown>;
      return (
        typeof rec.roomCode === 'string' &&
        typeof rec.phase === 'string' &&
        typeof rec.round === 'number' &&
        Array.isArray(rec.seats) &&
        rec.seats.length === 4
      );
    };

    const storagePattern = /^eksho_state_(TNG-[A-Z0-9]{2,6})$/i;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const keyMatch = storagePattern.exec(key);
      if (!keyMatch?.[1]) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isValidSnap(parsed)) {
          return {
            storedCode: parsed.roomCode.trim().toUpperCase(),
            onPreRoomEntryForm: false,
            domCode: null,
          };
        }
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'state' in parsed &&
          isValidSnap((parsed as { state: unknown }).state)
        ) {
          return {
            storedCode: (parsed as { state: { roomCode: string } }).state.roomCode
              .trim()
              .toUpperCase(),
            onPreRoomEntryForm: false,
            domCode: null,
          };
        }
      } catch {
        // Ignore corrupt JSON entries
      }
    }

    const isVisibleEl = (el: Element | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number.parseFloat(style.opacity || '1') <= 0.01
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const visibleButtons = Array.from(
      document.querySelectorAll('button'),
    ).filter(isVisibleEl);

    const hasCreateRoomBtn = visibleButtons.some((btn) =>
      /create\s*room/i.test(btn.textContent ?? ''),
    );
    const hasJoinRoomBtn = visibleButtons.some((btn) =>
      /join\s*room/i.test(btn.textContent ?? ''),
    );
    const hasActiveRoomControls = visibleButtons.some((btn) =>
      /add\s*bot|add\s*ai|\+\s*bot|fill\s*bots|start\s*match|start\s*game|copy.*invite|copy.*link|leave\s*room/i.test(
        btn.textContent ?? '',
      ),
    );
    const bodyText = document.body?.innerText ?? '';
    const hasRoundProgress = /Round\s*\d+\s*\/\s*10/i.test(bodyText);

    const onPreRoomEntryForm =
      hasCreateRoomBtn &&
      hasJoinRoomBtn &&
      !hasActiveRoomControls &&
      !hasRoundProgress;

    if (onPreRoomEntryForm) {
      return {
        storedCode: null,
        onPreRoomEntryForm: true,
        domCode: null,
      };
    }

    const explicitRoomNode = document.querySelector(
      '[data-room-code], [data-testid*="room-code" i]',
    );
    const explicitAttr =
      explicitRoomNode?.getAttribute('data-room-code') ??
      explicitRoomNode?.textContent ??
      '';
    const explicitMatch = /\b(TNG-[A-Z0-9]{2,6})\b/i.exec(explicitAttr);
    if (explicitMatch?.[1]) {
      return {
        storedCode: null,
        onPreRoomEntryForm: false,
        domCode: explicitMatch[1].toUpperCase(),
      };
    }

    const sanitizedText = bodyText.replace(
      /(?:e\.g\.|example|format|sample|placeholder)\s*[:=-]?\s*TNG-[A-Z0-9]{2,6}/gi,
      '',
    );
    const textMatch = /\b(TNG-[A-Z0-9]{2,6})\b/.exec(sanitizedText);
    return {
      storedCode: null,
      onPreRoomEntryForm: false,
      domCode: textMatch?.[1]?.toUpperCase() ?? null,
    };
  });

  if (
    storageAndDomResult.storedCode &&
    VALID_ROOM_CODE_REGEX.test(storageAndDomResult.storedCode)
  ) {
    return storageAndDomResult.storedCode;
  }

  if (storageAndDomResult.onPreRoomEntryForm) {
    return null;
  }

  const currentUrl = page.url();
  try {
    const parsedUrl = new URL(currentUrl);
    const paramRoom = parsedUrl.searchParams.get('room');
    if (paramRoom) {
      const normalized = paramRoom.trim().toUpperCase();
      if (VALID_ROOM_CODE_REGEX.test(normalized)) {
        return normalized;
      }
    }
    const pathMatch = /\/(TNG-[A-Z0-9]{2,6})(?:\/|$)/i.exec(parsedUrl.pathname);
    if (pathMatch?.[1]) {
      return pathMatch[1].toUpperCase();
    }
  } catch {
    // Ignore malformed URLs such as about:blank
  }

  return storageAndDomResult.domCode;
}

export function getAddBotButtons(page: Page): Locator {
  return page.getByRole('button', { name: /add\s*bot|add\s*ai|\+\s*bot/i });
}

export function getRemoveBotButtons(page: Page): Locator {
  return page.getByRole('button', { name: /remove(\s*bot)?|kick/i });
}

export function getFillBotsAndStartButton(page: Page): Locator {
  return page
    .getByRole('button', {
      name: /fill\s*bots\s*(?:&|and|\+)?\s*start(?:\s*match|\s*game)?/i,
    })
    .first();
}

export function getStartMatchButton(page: Page): Locator {
  return page
    .getByRole('button', { name: /start\s*match|start\s*game|^start$/i })
    .filter({ hasNotText: /fill\s*bots|add\s*bot/i })
    .first();
}

export async function createRoomAndEnter(
  page: Page,
  nickname: string,
): Promise<string> {
  const nicknameInput = getNicknameInput(page);
  await expect(nicknameInput).toBeVisible();
  await nicknameInput.fill(nickname);

  const createBtn = getCreateRoomButton(page);
  await expect(createBtn).toBeEnabled();
  await createBtn.click();

  const virtualClockActive = await isVirtualClockActive(page);
  let resolvedRoomCode: string | null = null;
  await expect
    .poll(
      async () => {
        if (virtualClockActive) {
          await page.clock.runFor(50);
        }
        const code = await extractRoomCodeFromPage(page);
        if (!code || !VALID_ROOM_CODE_REGEX.test(code)) {
          return false;
        }
        const stored = await readStoredGameState(page, code);
        const hasSeatLobbyUi =
          (await getAddBotButtons(page).count()) > 0 ||
          (await getFillBotsAndStartButton(page).isVisible().catch(() => false)) ||
          (await getStartMatchButton(page).isVisible().catch(() => false)) ||
          (stored !== null && stored.seats.length === 4);

        if (!hasSeatLobbyUi) {
          return false;
        }
        resolvedRoomCode = code;
        return true;
      },
      {
        message: 'Expected room creation to produce a TNG-XXXX code and Seat 0 lobby view',
        timeout: 15_000,
      },
    )
    .toBe(true);

  if (!resolvedRoomCode) {
    throw new Error('Failed to extract room code after creating room');
  }
  return resolvedRoomCode;
}

export async function joinRoomViaUi(
  page: Page,
  nickname: string,
  roomCodeInput: string,
  options?: { allowDisabled?: boolean },
): Promise<void> {
  const nicknameInput = getNicknameInput(page);
  await expect(nicknameInput).toBeVisible();
  await nicknameInput.fill(nickname);

  const roomInput = getJoinRoomInput(page);
  await expect(roomInput).toBeVisible();
  await roomInput.fill(roomCodeInput);

  const joinBtn = getJoinRoomButton(page);
  await expect(joinBtn).toBeVisible();
  if (options?.allowDisabled) {
    if (await joinBtn.isEnabled()) {
      await joinBtn.click();
    }
    return;
  }

  await expect(joinBtn).toBeEnabled();
  await joinBtn.click();
}

async function countCurrentBots(page: Page): Promise<number> {
  const roomCode = await extractRoomCodeFromPage(page);
  if (roomCode) {
    const snapshot = await readStoredGameState(page, roomCode);
    if (snapshot) {
      return snapshot.seats.filter((seat) => seat.type === 'AI').length;
    }
  }

  const removeCount = await getRemoveBotButtons(page).count();
  if (removeCount > 0) {
    return removeCount;
  }

  return page.evaluate((botNames) => {
    const text = document.body?.innerText ?? '';
    return botNames.filter((name) => new RegExp(`\\b${name}\\b`).test(text))
      .length;
  }, [...BOT_NAMES]);
}

export async function addBotsCount(
  page: Page,
  targetBots: number,
): Promise<void> {
  const clampedTarget = Math.max(0, Math.min(3, targetBots));

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const current = await countCurrentBots(page);
    if (current === clampedTarget) {
      return;
    }

    if (current < clampedTarget) {
      const addBtns = getAddBotButtons(page);
      const count = await addBtns.count();
      let clicked = false;
      for (let i = 0; i < count; i += 1) {
        const candidate = addBtns.nth(i);
        if ((await candidate.isVisible()) && (await candidate.isEnabled())) {
          await candidate.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        throw new Error(
          `Cannot add more bots: currently ${current}, target ${clampedTarget}`,
        );
      }
    } else {
      const removeBtns = getRemoveBotButtons(page);
      const count = await removeBtns.count();
      let clicked = false;
      for (let i = 0; i < count; i += 1) {
        const candidate = removeBtns.nth(i);
        if ((await candidate.isVisible()) && (await candidate.isEnabled())) {
          await candidate.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        throw new Error(
          `Cannot remove bots: currently ${current}, target ${clampedTarget}`,
        );
      }
    }

    await expect
      .poll(() => countCurrentBots(page), { timeout: 5_000 })
      .not.toBe(current);
  }

  await expect
    .poll(() => countCurrentBots(page), { timeout: 5_000 })
    .toBe(clampedTarget);
}

export async function fillBotsAndStartMatch(page: Page): Promise<void> {
  const startBtn = getStartMatchButton(page);
  const fillAndStartBtn = getFillBotsAndStartButton(page);

  const startVisible = await startBtn.isVisible().catch(() => false);
  const startEnabled = startVisible
    ? await startBtn.isEnabled().catch(() => false)
    : false;

  if (startEnabled) {
    await startBtn.click();
  } else if (
    (await fillAndStartBtn.isVisible().catch(() => false)) &&
    (await fillAndStartBtn.isEnabled().catch(() => false))
  ) {
    await fillAndStartBtn.click();
  } else {
    for (let step = 0; step < 3; step += 1) {
      const readyNow =
        (await startBtn.isVisible().catch(() => false)) &&
        (await startBtn.isEnabled().catch(() => false));
      if (readyNow) break;

      const addBtns = getAddBotButtons(page);
      const addCount = await addBtns.count();
      let added = false;
      for (let i = 0; i < addCount; i += 1) {
        const btn = addBtns.nth(i);
        if ((await btn.isVisible()) && (await btn.isEnabled())) {
          await btn.click();
          added = true;
          break;
        }
      }
      if (!added) break;
    }

    await expect(startBtn).toBeEnabled({ timeout: 5_000 });
    await startBtn.click();
  }

  const virtualClockActive = await isVirtualClockActive(page);
  await expect
    .poll(
      async () => {
        if (virtualClockActive) {
          await page.clock.runFor(50);
        }
        const code = await extractRoomCodeFromPage(page);
        if (code) {
          const snapshot = await readStoredGameState(page, code);
          if (snapshot && snapshot.phase !== 'LOBBY') {
            return true;
          }
        }
        return page
          .getByText(/Round\s*1\s*\/\s*10/i)
          .first()
          .isVisible()
          .catch(() => false);
      },
      {
        message: 'Expected match to transition out of LOBBY into Round 1/10',
        timeout: 15_000,
      },
    )
    .toBe(true);
}

export async function reloadRoomState(
  page: Page,
  roomCode: string,
  nickname?: string,
): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();
  const virtualClockActive = await isVirtualClockActive(page);
  const preReloadState = await readStoredGameState(page, normalizedCode);
  const preIdentity = await readSessionIdentity(page, normalizedCode);
  const resolvedNickname =
    nickname ??
    preReloadState?.seats[preIdentity.seatIndex ?? 0]?.username ??
    'HostPlayer';

  await page.reload({ waitUntil: 'domcontentloaded' });
  if (virtualClockActive) {
    await page.clock.runFor(100);
  }

  const isTableOrRoomVisible = async (): Promise<boolean> => {
    if (virtualClockActive) {
      await page.clock.runFor(50);
    }
    const roundVisible = await page
      .getByText(/Round\s*\d+\s*\/\s*10/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (roundVisible) {
      return true;
    }
    const lobbySeatsVisible =
      (await getAddBotButtons(page).count()) > 0 ||
      (await getFillBotsAndStartButton(page).isVisible().catch(() => false)) ||
      (await getStartMatchButton(page).isVisible().catch(() => false));
    return lobbySeatsVisible;
  };

  for (let check = 0; check < 6; check += 1) {
    if (await isTableOrRoomVisible()) {
      return;
    }
    if (!virtualClockActive) {
      await page.waitForTimeout(150);
    }
  }

  const currentUrl = page.url();
  if (!currentUrl.toUpperCase().includes(`ROOM=${normalizedCode}`)) {
    await page.goto(`/?room=${encodeURIComponent(normalizedCode)}`, {
      waitUntil: 'domcontentloaded',
    });
    if (virtualClockActive) {
      await page.clock.runFor(100);
    }
    for (let check = 0; check < 6; check += 1) {
      if (await isTableOrRoomVisible()) {
        return;
      }
      if (!virtualClockActive) {
        await page.waitForTimeout(150);
      }
    }
  }

  const joinBtnVisible = await getJoinRoomButton(page)
    .isVisible()
    .catch(() => false);
  if (joinBtnVisible) {
    await joinRoomViaUi(page, resolvedNickname, normalizedCode);
    if (virtualClockActive) {
      await page.clock.runFor(100);
    }
  }
}

export async function readStoredGameState(
  page: Page,
  roomCode: string,
): Promise<OpaqueGameSnapshot | null> {
  const normalized = roomCode.trim().toUpperCase();
  const raw = await page.evaluate(
    ({ exact, upper }) => {
      return (
        window.localStorage.getItem(`eksho_state_${exact}`) ??
        window.localStorage.getItem(`eksho_state_${upper}`)
      );
    },
    { exact: roomCode, upper: normalized },
  );

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return unwrapGameSnapshot(parsed);
  } catch {
    return null;
  }
}

export async function writeStoredGameState(
  page: Page,
  roomCode: string,
  state: OpaqueGameSnapshot,
): Promise<void> {
  const normalized = roomCode.trim().toUpperCase();
  await page.evaluate(
    ({ exact, upper, nextState }) => {
      const targetKey =
        window.localStorage.getItem(`eksho_state_${exact}`) !== null
          ? `eksho_state_${exact}`
          : `eksho_state_${upper}`;
      const existingRaw = window.localStorage.getItem(targetKey);
      let payload: unknown = nextState;

      if (existingRaw) {
        try {
          const parsed: unknown = JSON.parse(existingRaw);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            'state' in parsed &&
            typeof (parsed as { state: unknown }).state === 'object'
          ) {
            payload = {
              ...(parsed as Record<string, unknown>),
              state: nextState,
            };
          }
        } catch {
          payload = nextState;
        }
      }

      window.localStorage.setItem(targetKey, JSON.stringify(payload));
    },
    { exact: roomCode, upper: normalized, nextState: state },
  );
}

export async function readSessionIdentity(
  page: Page,
  roomCode?: string,
): Promise<SessionIdentity> {
  const normalizedRoom = roomCode?.trim().toUpperCase() ?? '';
  const data = await page.evaluate((targetRoom) => {
    const rawKeys: Record<string, string> = {};
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      const val = window.sessionStorage.getItem(key);
      if (val !== null) {
        rawKeys[key] = val;
      }
    }

    let clientId: string | null =
      rawKeys.clientId ??
      rawKeys.eksho_client_id ??
      (targetRoom ? rawKeys[`eksho_client_id_${targetRoom}`] : undefined) ??
      null;
    let seatRaw: string | null =
      rawKeys.seatIndex ??
      rawKeys.eksho_seat_index ??
      (targetRoom ? rawKeys[`eksho_seat_${targetRoom}`] : undefined) ??
      null;

    if ((!clientId || seatRaw === null) && targetRoom) {
      for (const [key, val] of Object.entries(rawKeys)) {
        if (key.toUpperCase().includes(targetRoom)) {
          try {
            const parsed: unknown = JSON.parse(val);
            if (typeof parsed === 'object' && parsed !== null) {
              const obj = parsed as Record<string, unknown>;
              if (!clientId && typeof obj.clientId === 'string') {
                clientId = obj.clientId;
              }
              if (
                seatRaw === null &&
                (typeof obj.seatIndex === 'number' ||
                  typeof obj.seatIndex === 'string')
              ) {
                seatRaw = String(obj.seatIndex);
              }
            }
          } catch {
            // Non-JSON session value
          }
        }
      }
    }

    if (!clientId) {
      for (const [key, val] of Object.entries(rawKeys)) {
        if (/client_?id/i.test(key) && val.trim().length > 0) {
          clientId = val.trim();
          break;
        }
      }
    }

    if (seatRaw === null) {
      for (const [key, val] of Object.entries(rawKeys)) {
        if (/seat_?(index)?/i.test(key) && val.trim().length > 0) {
          seatRaw = val.trim();
          break;
        }
      }
    }

    return { clientId, seatRaw, rawKeys };
  }, normalizedRoom);

  return {
    clientId: data.clientId,
    seatIndex: parseSeatIndexValue(data.seatRaw),
    rawKeys: data.rawKeys,
  };
}

export async function installVirtualClock(
  page: Page,
  time?: number | string | Date,
): Promise<void> {
  const initialEpochMs =
    time === undefined
      ? Date.now()
      : typeof time === 'number'
        ? time
        : time instanceof Date
          ? time.getTime()
          : new Date(time).getTime();

  await page.clock.install({ time: initialEpochMs });
  const pauseEpochMs = await page.evaluate((fallbackMs) => {
    const pwClock = (
      globalThis as {
        __pwClock?: { controller?: { _innerPause?: () => void } };
      }
    ).__pwClock;
    pwClock?.controller?._innerPause?.();
    return Math.max(fallbackMs, Date.now());
  }, initialEpochMs);
  await page.clock.pauseAt(pauseEpochMs);
}

async function isVirtualClockActive(page: Page): Promise<boolean> {
  return page.evaluate(
    () => !String(window.setTimeout).includes('[native code]'),
  );
}

export async function advanceClockStepped(
  page: Page,
  totalMs: number,
  stepMs = 400,
): Promise<void> {
  if (totalMs <= 0) {
    return;
  }
  const safeStep = Math.max(50, stepMs);
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(safeStep, remaining);
    await page.clock.runFor(chunk);
    remaining -= chunk;
  }
}

export function getQuickCallButton(page: Page, amount: number): Locator {
  return page
    .locator('button:not([data-card]):not([data-card-value])')
    .filter({
      hasText: new RegExp(`^\\s*(?:Call\\s+)?${amount}\\s*$`, 'i'),
    })
    .first();
}

export async function placeQuickCall(
  page: Page,
  amount: number,
): Promise<void> {
  const pill = getQuickCallButton(page, amount);
  await expect(pill).toBeVisible();
  await expect(pill).toBeEnabled();
  await pill.click();
}

export async function submitCustomCall(
  page: Page,
  amountRaw: number | string,
): Promise<void> {
  const customInput = page
    .getByLabel(/custom\s*call|call\s*amount|bid\s*amount/i)
    .or(page.getByPlaceholder(/custom|0\s*[-–]\s*500|call|bid/i))
    .or(page.locator('input[type="number"]:visible'))
    .first();

  await expect(customInput).toBeVisible();
  await customInput.fill(String(amountRaw));

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

export async function getHandCardButtons(
  page: Page,
  roomCode?: string,
): Promise<HandCardButton[]> {
  const visibleButtons = page.locator('button:visible');
  const snapshot = roomCode ? await readStoredGameState(page, roomCode) : null;
  const trickCards = snapshot
    ? snapshot.currentTrick.map((play) => play.card)
    : [];

  const candidates = await visibleButtons.evaluateAll(
    (elements, params) => {
      const deckSet = new Set<number>(params.deck);
      const quickPillTexts = new Set<string>([
        '0',
        '50',
        '100',
        '150',
        '200',
        '250',
        '300',
      ]);
      const results: Array<{ visibleIndex: number; value: number }> = [];

      for (let idx = 0; idx < elements.length; idx += 1) {
        const el = elements[idx];
        const rawText = (el.textContent ?? '').trim();
        const ariaLabel = (el.getAttribute('aria-label') ?? '').trim();
        const dataCard =
          el.getAttribute('data-card') ??
          el.getAttribute('data-card-value') ??
          el.getAttribute('data-value');

        if (/charlam|koto|baji|chales/i.test(rawText)) {
          continue;
        }

        let inQuickCallTray = false;
        let ancestor: HTMLElement | null = el.parentElement;
        for (let depth = 0; depth < 3 && ancestor; depth += 1) {
          const siblingButtons = Array.from(
            ancestor.querySelectorAll('button'),
          );
          const pillMatches = siblingButtons.filter((btn) =>
            quickPillTexts.has((btn.textContent ?? '').trim()),
          ).length;
          const hasNonDeckPill = siblingButtons.some((btn) => {
            const txt = (btn.textContent ?? '').trim();
            return (
              txt === '0' ||
              txt === '150' ||
              txt === '200' ||
              txt === '250' ||
              txt === '300'
            );
          });
          if (pillMatches >= 4 && hasNonDeckPill) {
            inQuickCallTray = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (inQuickCallTray) {
          continue;
        }

        let inTrickArena = false;
        let arenaWalk: HTMLElement | null = el.parentElement;
        for (let depth = 0; depth < 4 && arenaWalk; depth += 1) {
          const hint = `${arenaWalk.getAttribute('data-testid') ?? ''} ${arenaWalk.getAttribute('aria-label') ?? ''}`;
          if (/trick[-_\s]?arena|center[-_\s]?arena|trick[-_\s]?slot/i.test(hint)) {
            inTrickArena = true;
            break;
          }
          arenaWalk = arenaWalk.parentElement;
        }
        if (inTrickArena) {
          continue;
        }

        const extractCardTokens = (root: Element): string[] => {
          const collected: string[] = [];
          const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
          );
          let currentNode: Node | null = walker.nextNode();
          while (currentNode) {
            const textChunk = (currentNode.nodeValue ?? '').trim();
            if (textChunk.length > 0) {
              const parts = textChunk.split(/\s+/).filter(Boolean);
              for (const part of parts) {
                collected.push(part);
              }
            }
            currentNode = walker.nextNode();
          }

          if (collected.length === 1 && /^\d{2,9}$/.test(collected[0])) {
            const single = collected[0];
            if (!deckSet.has(Number.parseInt(single, 10))) {
              const sortedDeckDesc = [...params.deck].sort((a, b) => b - a);
              for (const d of sortedDeckDesc) {
                const dStr = String(d);
                if (
                  single === dStr.repeat(3) ||
                  single === dStr.repeat(4) ||
                  single === dStr.repeat(2)
                ) {
                  const count = single.length / dStr.length;
                  return Array.from({ length: count }, () => dStr);
                }
              }
            }
          }

          return collected;
        };

        const tokens = extractCardTokens(el);
        const numericTokens = tokens.filter((token) => /^\d{1,3}$/.test(token));
        let parsedValue: number | null = null;

        if (dataCard && /^\d{1,3}$/.test(dataCard.trim())) {
          parsedValue = Number.parseInt(dataCard.trim(), 10);
        } else {
          const ariaMatch = /(?:play\s+)?card\s+(\d{1,3})\b/i.exec(ariaLabel);
          if (ariaMatch?.[1]) {
            parsedValue = Number.parseInt(ariaMatch[1], 10);
          } else if (
            numericTokens.length >= 1 &&
            numericTokens.every((token) => token === numericTokens[0])
          ) {
            parsedValue = Number.parseInt(numericTokens[0], 10);
          }
        }

        if (parsedValue === null || !deckSet.has(parsedValue)) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        const isPortraitCard =
          rect.height > rect.width * 1.05 && rect.height >= 50;
        const hasCardLabel = /\bcard\b/i.test(ariaLabel) || dataCard !== null;
        const hasRepeatedCorners = numericTokens.length >= 2;

        let insideHandContainer = false;
        let handWalk: HTMLElement | null = el.parentElement;
        for (let depth = 0; depth < 3 && handWalk; depth += 1) {
          const hint = `${handWalk.getAttribute('data-testid') ?? ''} ${handWalk.getAttribute('aria-label') ?? ''} ${handWalk.className ?? ''}`;
          if (/\bhand\b/i.test(hint)) {
            insideHandContainer = true;
            break;
          }
          handWalk = handWalk.parentElement;
        }

        if (
          !hasRepeatedCorners &&
          !hasCardLabel &&
          !isPortraitCard &&
          !insideHandContainer
        ) {
          continue;
        }

        if (
          params.trickCards.includes(parsedValue) &&
          !hasCardLabel &&
          !insideHandContainer &&
          el.hasAttribute('disabled')
        ) {
          continue;
        }

        results.push({ visibleIndex: idx, value: parsedValue });
      }

      return results;
    },
    { deck: [...EXPECTED_DECK], trickCards },
  );

  return candidates.map((item) => ({
    button: visibleButtons.nth(item.visibleIndex),
    value: item.value,
  }));
}

export async function waitForHumanCallTurn(
  page: Page,
  roomCode: string,
  maxWaitMs = 20_000,
  clockInstalled?: boolean,
): Promise<OpaqueGameSnapshot> {
  const virtualClockActive =
    clockInstalled ?? (await isVirtualClockActive(page));
  const identity = await readSessionIdentity(page, roomCode);
  const mySeat = identity.seatIndex ?? 0;

  const startRealMs = Date.now();
  let virtualElapsedMs = 0;

  while (
    virtualClockActive
      ? virtualElapsedMs <= maxWaitMs
      : Date.now() - startRealMs <= maxWaitMs
  ) {
    const snapshot = await readStoredGameState(page, roomCode);
    if (snapshot) {
      if (snapshot.phase === 'BIDDING' && snapshot.activeSeat === mySeat) {
        const pillVisible = await getQuickCallButton(page, 50)
          .isVisible()
          .catch(() => false);
        if (pillVisible) {
          return snapshot;
        }
      }
      if (snapshot.phase === 'MATCH_OVER') {
        throw new Error(
          `Expected human BIDDING turn in room ${roomCode}, but match is already MATCH_OVER`,
        );
      }
    }

    if (virtualClockActive) {
      await advanceClockStepped(page, 400, 400);
      virtualElapsedMs += 400;
    } else {
      await page.waitForTimeout(200);
    }
  }

  const latest = await readStoredGameState(page, roomCode);
  throw new Error(
    `Timed out waiting for human BIDDING turn (seat ${mySeat}) in room ${roomCode}. Latest snapshot: ${JSON.stringify(
      latest
        ? {
            phase: latest.phase,
            round: latest.round,
            activeSeat: latest.activeSeat,
          }
        : null,
    )}`,
  );
}

export async function waitForHumanPlayTurn(
  page: Page,
  roomCode: string,
  maxWaitMs = 20_000,
  clockInstalled?: boolean,
): Promise<OpaqueGameSnapshot> {
  const virtualClockActive =
    clockInstalled ?? (await isVirtualClockActive(page));
  const identity = await readSessionIdentity(page, roomCode);
  const mySeat = identity.seatIndex ?? 0;

  const startRealMs = Date.now();
  let virtualElapsedMs = 0;

  while (
    virtualClockActive
      ? virtualElapsedMs <= maxWaitMs
      : Date.now() - startRealMs <= maxWaitMs
  ) {
    const snapshot = await readStoredGameState(page, roomCode);
    if (snapshot) {
      if (snapshot.phase === 'PLAYING' && snapshot.activeSeat === mySeat) {
        const handCards = await getHandCardButtons(page, roomCode);
        for (const card of handCards) {
          if (await card.button.isEnabled().catch(() => false)) {
            return snapshot;
          }
        }
      }
      if (
        snapshot.phase === 'ROUND_SUMMARY' ||
        snapshot.phase === 'MATCH_OVER'
      ) {
        throw new Error(
          `Expected human PLAYING turn, but reached ${snapshot.phase} (round ${snapshot.round}, trick ${snapshot.trickNumber})`,
        );
      }
    }

    if (virtualClockActive) {
      await advanceClockStepped(page, 400, 400);
      virtualElapsedMs += 400;
    } else {
      await page.waitForTimeout(200);
    }
  }

  const latest = await readStoredGameState(page, roomCode);
  throw new Error(
    `Timed out waiting for human PLAYING turn (seat ${mySeat}) in room ${roomCode}. Latest snapshot: ${JSON.stringify(
      latest
        ? {
            phase: latest.phase,
            round: latest.round,
            trickNumber: latest.trickNumber,
            activeSeat: latest.activeSeat,
          }
        : null,
    )}`,
  );
}

export async function playCardValue(
  page: Page,
  roomCode: string,
  value?: number,
): Promise<number> {
  const handCards = await getHandCardButtons(page, roomCode);
  if (handCards.length === 0) {
    throw new Error(`No hand card buttons visible in room ${roomCode}`);
  }

  const enabledCards: HandCardButton[] = [];
  for (const item of handCards) {
    if (await item.button.isEnabled().catch(() => false)) {
      enabledCards.push(item);
    }
  }

  const pool = enabledCards.length > 0 ? enabledCards : handCards;
  let chosen: HandCardButton | undefined;

  if (value !== undefined) {
    chosen = pool.find((item) => item.value === value);
    if (!chosen) {
      throw new Error(
        `Card ${value} not found in playable hand [${pool
          .map((item) => item.value)
          .join(', ')}]`,
      );
    }
  } else {
    chosen = [...pool].sort((a, b) => a.value - b.value)[0];
  }

  if (!chosen) {
    throw new Error('Unable to select a playable hand card');
  }

  await expect(chosen.button).toBeEnabled();
  await chosen.button.click();
  return chosen.value;
}

export async function completeCurrentRound(
  page: Page,
  roomCode: string,
  humanCall = 50,
  clockInstalled?: boolean,
): Promise<RoundCompletionResult> {
  const virtualClockActive =
    clockInstalled ?? (await isVirtualClockActive(page));
  const identity = await readSessionIdentity(page, roomCode);
  const mySeat = identity.seatIndex ?? 0;

  let snapshot = await readStoredGameState(page, roomCode);
  if (!snapshot) {
    throw new Error(`Missing stored game state for room ${roomCode}`);
  }

  const startingRound = snapshot.round;
  let lastActionKey = '';

  for (let iter = 0; iter < 240; iter += 1) {
    snapshot = await readStoredGameState(page, roomCode);
    if (!snapshot) {
      throw new Error(`Lost game state mid-round for room ${roomCode}`);
    }

    if (
      snapshot.phase === 'ROUND_SUMMARY' ||
      snapshot.phase === 'MATCH_OVER' ||
      snapshot.round > startingRound
    ) {
      break;
    }

    if (snapshot.phase === 'BIDDING' && snapshot.activeSeat === mySeat) {
      const actionKey = `BID:${snapshot.round}:${snapshot.version}`;
      if (actionKey !== lastActionKey) {
        const isQuickPill = (QUICK_CALL_PILLS as readonly number[]).includes(
          humanCall,
        );
        if (isQuickPill) {
          const pillVisible = await getQuickCallButton(page, humanCall)
            .isVisible()
            .catch(() => false);
          if (pillVisible) {
            await placeQuickCall(page, humanCall);
            lastActionKey = actionKey;
            continue;
          }
        } else {
          await submitCustomCall(page, humanCall);
          lastActionKey = actionKey;
          continue;
        }
      }
    } else if (
      snapshot.phase === 'PLAYING' &&
      snapshot.activeSeat === mySeat
    ) {
      const actionKey = `PLAY:${snapshot.round}:${snapshot.trickNumber}:${snapshot.version}`;
      if (actionKey !== lastActionKey) {
        const handCards = await getHandCardButtons(page, roomCode);
        const hasPlayable = await (async (): Promise<boolean> => {
          for (const card of handCards) {
            if (await card.button.isEnabled().catch(() => false)) {
              return true;
            }
          }
          return false;
        })();
        if (hasPlayable) {
          await playCardValue(page, roomCode);
          lastActionKey = actionKey;
          continue;
        }
      }
    }

    if (virtualClockActive) {
      await advanceClockStepped(page, 400, 400);
    } else {
      await page.waitForTimeout(250);
    }
  }

  const summaryState = await readStoredGameState(page, roomCode);
  if (!summaryState) {
    throw new Error(`Missing post-round state for room ${roomCode}`);
  }
  if (
    summaryState.phase !== 'ROUND_SUMMARY' &&
    summaryState.phase !== 'MATCH_OVER' &&
    summaryState.round === startingRound
  ) {
    throw new Error(
      `Round ${startingRound} did not finish within step budget. Current state: ${JSON.stringify(
        {
          phase: summaryState.phase,
          round: summaryState.round,
          trickNumber: summaryState.trickNumber,
          activeSeat: summaryState.activeSeat,
        },
      )}`,
    );
  }

  if (summaryState.phase === 'ROUND_SUMMARY') {
    const nextRoundBtn = page
      .getByRole('button', {
        name: /next\s*round|continue|finish\s*match|view\s*(?:results|podium)/i,
      })
      .first();

    if (
      (await nextRoundBtn.isVisible().catch(() => false)) &&
      (await nextRoundBtn.isEnabled().catch(() => false))
    ) {
      await nextRoundBtn.click();
    } else {
      for (let waitStep = 0; waitStep < 16; waitStep += 1) {
        const current = await readStoredGameState(page, roomCode);
        if (!current || current.phase !== 'ROUND_SUMMARY') {
          break;
        }
        if (virtualClockActive) {
          await advanceClockStepped(page, 400, 400);
        } else {
          await page.waitForTimeout(350);
        }
      }
    }
  }

  let nextState = summaryState;
  await expect
    .poll(
      async () => {
        const latest = await readStoredGameState(page, roomCode);
        if (!latest) return false;
        if (
          latest.phase === 'MATCH_OVER' ||
          latest.round > startingRound
        ) {
          nextState = latest;
          return true;
        }
        if (virtualClockActive && latest.phase === 'ROUND_SUMMARY') {
          await advanceClockStepped(page, 400, 400);
        }
        return false;
      },
      {
        message: `Expected round ${startingRound} summary to advance to next round or MATCH_OVER`,
        timeout: 15_000,
      },
    )
    .toBe(true);

  return { summaryState, nextState };
}

export function getVillage3GToggle(page: Page): Locator {
  return page
    .getByRole('button', { name: /village\s*3g|low[\s-]*data/i })
    .or(page.getByRole('switch', { name: /village\s*3g|low[\s-]*data/i }))
    .first();
}

export function getRainToggle(page: Page): Locator {
  return page
    .getByRole('button', { name: /rain/i })
    .or(page.getByRole('switch', { name: /rain/i }))
    .first();
}

export function getOpenMicButton(page: Page): Locator {
  return page
    .getByRole('button', {
      name: /open\s*mic|mute\s*mic|unmute\s*mic|\bmute\b|\bunmute\b|mic\s*(?:on|off)/i,
    })
    .first();
}

export function getHoldToTalkButton(page: Page): Locator {
  return page
    .getByRole('button', {
      name: /hold[\s-]*to[\s-]*talk|push[\s-]*to[\s-]*talk|\bptt\b/i,
    })
    .first();
}

export function getChatToggleButton(page: Page): Locator {
  return page
    .getByRole('button', { name: /chat|banter|messages/i })
    .first();
}

export async function openChatDrawer(page: Page): Promise<void> {
  const firstChip = page.getByRole('button', { name: BANTER_CHIPS[0] }).first();
  if (await firstChip.isVisible().catch(() => false)) {
    return;
  }
  const toggleBtn = getChatToggleButton(page);
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();
  await expect(firstChip).toBeVisible({ timeout: 5_000 });
}

export async function sendChatBanterChip(
  page: Page,
  chip: string,
): Promise<void> {
  await openChatDrawer(page);
  const chipBtn = page
    .getByRole('button', { name: chip, exact: true })
    .or(page.getByRole('button', { name: new RegExp(escapeRegExp(chip), 'i') }))
    .first();
  await expect(chipBtn).toBeVisible();
  await expect(chipBtn).toBeEnabled();
  await chipBtn.click();
}

export async function sendCustomChatMessage(
  page: Page,
  text: string,
): Promise<void> {
  await openChatDrawer(page);
  const chatInput = page
    .getByLabel(/chat\s*message|message|banter/i)
    .or(
      page.getByPlaceholder(/type.*message|send.*message|chat|bangla|banter/i),
    )
    .first();

  await expect(chatInput).toBeVisible();
  await chatInput.fill(text);

  const sendBtn = page.getByRole('button', { name: /^send$/i }).first();
  if ((await sendBtn.count()) > 0 && (await sendBtn.isVisible())) {
    if (await sendBtn.isEnabled()) {
      await sendBtn.click();
      return;
    }
  }
  await chatInput.press('Enter');
}

export async function inspectRainAnimationState(
  page: Page,
): Promise<RainAnimationReport> {
  return page.evaluate(() => {
    const candidates = new Set<Element>();
    for (const el of document.querySelectorAll(
      '[class*="rain" i], [data-rain], [data-testid*="rain" i], [aria-label*="rain" i]',
    )) {
      candidates.add(el);
    }

    for (const el of document.querySelectorAll('*')) {
      const style = window.getComputedStyle(el);
      if (
        style.animationName &&
        style.animationName !== 'none' &&
        /rain|streak|drop/i.test(style.animationName)
      ) {
        candidates.add(el);
      }
    }

    let visibleCount = 0;
    let runningCount = 0;
    let pausedCount = 0;
    const playStates: string[] = [];
    const animationNames: string[] = [];

    const checkStyle = (style: CSSStyleDeclaration, isVisible: boolean) => {
      if (!style.animationName || style.animationName === 'none') {
        return;
      }
      animationNames.push(style.animationName);
      const states = style.animationPlayState
        .split(',')
        .map((s) => s.trim().toLowerCase());
      for (const state of states) {
        playStates.push(state);
        if (isVisible && state === 'running') {
          runningCount += 1;
        } else if (state === 'paused') {
          pausedCount += 1;
        }
      }
    };

    for (const el of candidates) {
      const style = window.getComputedStyle(el);
      const opacity = Number.parseFloat(style.opacity || '1');
      const isVisible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        opacity > 0.01;
      if (isVisible) {
        visibleCount += 1;
      }

      checkStyle(style, isVisible);
      checkStyle(window.getComputedStyle(el, '::before'), isVisible);
      checkStyle(window.getComputedStyle(el, '::after'), isVisible);
    }

    const rootRainAttr = document
      .querySelector('[data-rain], [data-low-data], [data-village-3g]')
      ?.getAttribute('data-rain');

    const hasActiveAnimation = runningCount > 0;
    const isPaused =
      !hasActiveAnimation &&
      (pausedCount > 0 || visibleCount === 0 || rootRainAttr === 'paused');

    return {
      elementCount: candidates.size,
      visibleCount,
      runningCount,
      pausedCount,
      hasActiveAnimation,
      isPaused,
      playStates,
      animationNames,
    };
  });
}

export function classifyCardRgb(rgbStr: string): ParsedRgbColor | null {
  const trimmed = rgbStr.trim();
  if (!trimmed || trimmed === 'transparent') {
    return null;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  const commaMatch =
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i.exec(
      trimmed,
    );
  const spaceMatch =
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?%?))?\s*\)$/i.exec(
      trimmed,
    );
  const srgbMatch =
    /^color\(srgb\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?%?))?\s*\)$/i.exec(
      trimmed,
    );

  if (commaMatch) {
    r = Math.round(Number.parseFloat(commaMatch[1]));
    g = Math.round(Number.parseFloat(commaMatch[2]));
    b = Math.round(Number.parseFloat(commaMatch[3]));
    a = commaMatch[4] !== undefined ? Number.parseFloat(commaMatch[4]) : 1;
  } else if (spaceMatch) {
    r = Math.round(Number.parseFloat(spaceMatch[1]));
    g = Math.round(Number.parseFloat(spaceMatch[2]));
    b = Math.round(Number.parseFloat(spaceMatch[3]));
    if (spaceMatch[4] !== undefined) {
      a = spaceMatch[4].endsWith('%')
        ? Number.parseFloat(spaceMatch[4]) / 100
        : Number.parseFloat(spaceMatch[4]);
    }
  } else if (srgbMatch) {
    r = Math.round(Number.parseFloat(srgbMatch[1]) * 255);
    g = Math.round(Number.parseFloat(srgbMatch[2]) * 255);
    b = Math.round(Number.parseFloat(srgbMatch[3]) * 255);
    if (srgbMatch[4] !== undefined) {
      a = srgbMatch[4].endsWith('%')
        ? Number.parseFloat(srgbMatch[4]) / 100
        : Number.parseFloat(srgbMatch[4]);
    }
  } else {
    return null;
  }

  const clampByte = (n: number): number => Math.max(0, Math.min(255, n));
  r = clampByte(r);
  g = clampByte(g);
  b = clampByte(b);
  a = Math.max(0, Math.min(1, a));

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const toHex = (n: number): string => n.toString(16).padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

  let tierGuess: ParsedRgbColor['tierGuess'] = 'neutral';
  if (r < 85 && g < 85 && b < 95) {
    tierGuess = 'charcoal-gold';
  } else if (
    r > 125 &&
    g >= 80 &&
    b < Math.min(r, g) - 25 &&
    g > r * 0.55
  ) {
    tierGuess = 'ochre-yellow';
  } else if (r > g + 30 && r > b + 30) {
    tierGuess = 'brick-red';
  } else if (g > r + 15 && g > b + 15) {
    tierGuess = 'forest-green';
  } else if (b > r + 25 && b > g + 15) {
    tierGuess = 'cobalt-blue';
  }

  return { r, g, b, a, luminance, hex, tierGuess };
}

export async function normalizeCssColorToRgb(
  page: Page,
  cssColor: string,
): Promise<string> {
  return page.evaluate((raw) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return raw;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const alpha = Number((data[3] / 255).toFixed(3));
    return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${alpha})`;
  }, cssColor);
}

export async function measureHorizontalOverflow(
  page: Page,
): Promise<HorizontalOverflowReport> {
  return page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    return {
      scrollWidth,
      innerWidth,
      hasOverflow: scrollWidth > innerWidth,
    };
  });
}

function checkHttpReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function allocateAvailablePort(preferredPort: number): Promise<number> {
  const tryListen = (targetPort: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.unref();
      probe.once('error', (err) => {
        reject(err);
      });
      probe.listen(targetPort, '127.0.0.1', () => {
        const addr = probe.address();
        const boundPort =
          typeof addr === 'object' && addr !== null ? addr.port : targetPort;
        probe.close(() => resolve(boundPort));
      });
    });

  if (preferredPort > 0) {
    return tryListen(preferredPort).catch(() => tryListen(0));
  }
  return tryListen(0);
}

export async function spawnTokenTestServer(
  port = 0,
  envOverrides: Record<string, string | undefined> = {},
): Promise<TokenTestServerHandle> {
  const boundPort = await allocateAvailablePort(port);
  const nextBinPath = path.resolve(
    process.cwd(),
    'node_modules/next/dist/bin/next',
  );
  const baseUrl = `http://127.0.0.1:${boundPort}`;

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete childEnv[key];
    } else {
      childEnv[key] = value;
    }
  }

  const child = spawn(
    process.execPath,
    [nextBinPath, 'start', '-H', '127.0.0.1', '-p', String(boundPort)],
    {
      cwd: process.cwd(),
      env: childEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let logs = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    logs += chunk.toString('utf8');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    logs += chunk.toString('utf8');
  });

  let exited = false;
  let exitCode: number | null = null;
  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const close = async (): Promise<void> => {
    if (exited) {
      return;
    }
    const exitPromise = new Promise<void>((resolve) => {
      child.once('close', () => resolve());
    });

    try {
      if (child.pid !== undefined) {
        process.kill(-child.pid, 'SIGTERM');
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        // Process already exited
      }
    }

    await Promise.race([
      exitPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);

    if (!exited) {
      try {
        if (child.pid !== undefined) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // Already exited
      }
      await Promise.race([
        exitPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }
  };

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) {
      await close();
      throw new Error(
        `Isolated Next.js token test server on port ${boundPort} exited early (code=${exitCode}):\n${logs}`,
      );
    }
    const ready = await checkHttpReady(`${baseUrl}/`);
    if (ready) {
      return { baseUrl, close };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }

  await close();
  throw new Error(
    `Timed out waiting for isolated Next.js token test server on ${baseUrl}:\n${logs}`,
  );
}
