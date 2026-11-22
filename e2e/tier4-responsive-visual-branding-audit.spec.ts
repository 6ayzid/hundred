import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  BOT_NAMES,
  CANONICAL_FULL_TITLE,
  CANONICAL_TITLE_BANGLA,
  CANONICAL_TITLE_ENGLISH,
  LEGACY_FORBIDDEN_TERMS,
  attachRuntimeMonitors,
  classifyCardRgb,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  getHandCardButtons,
  getHoldToTalkButton,
  inspectRainAnimationState,
  measureHorizontalOverflow,
  normalizeCssColorToRgb,
  placeQuickCall,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
} from './helpers/tabletop';

interface SeatHubGeometry {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface AtmosphereReport {
  hasPatiWeave: boolean;
  hasChalerBosta: boolean;
  hasRadialOverlay: boolean;
}

interface WebfontReport {
  status: string;
  loadedFamilies: string[];
  registeredFamilies: string[];
}

function expectedTierForCard(
  value: number,
):
  | 'brick-red'
  | 'ochre-yellow'
  | 'forest-green'
  | 'cobalt-blue'
  | 'charcoal-gold' {
  if (value <= 20) return 'brick-red';
  if (value <= 45) return 'ochre-yellow';
  if (value <= 70) return 'forest-green';
  if (value <= 90) return 'cobalt-blue';
  return 'charcoal-gold';
}

async function locateSeatHubsGeometry(
  page: Page,
  playerNames: readonly string[],
): Promise<SeatHubGeometry[]> {
  return page.evaluate((names) => {
    const results: SeatHubGeometry[] = [];
    const candidates = Array.from(
      document.querySelectorAll('div, section, article, aside'),
    );

    for (const playerName of names) {
      let bestEl: HTMLElement | null = null;
      let bestArea = Number.POSITIVE_INFINITY;

      for (const el of candidates) {
        if (!(el instanceof HTMLElement)) continue;
        const text = el.innerText ?? '';
        if (!text.includes(playerName)) continue;
        if (!/(?:Call|Pts|Points|Score|Total)/i.test(text)) continue;
        if (/Round\s*\d+\s*\/\s*10/i.test(text) && text.length > 350) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 28) continue;
        const area = rect.width * rect.height;
        if (area < bestArea) {
          bestArea = area;
          bestEl = el;
        }
      }

      if (bestEl) {
        const rect = bestEl.getBoundingClientRect();
        results.push({
          name: playerName,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
        });
      }
    }

    return results;
  }, [...playerNames]);
}

async function locateCenterArenaBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number; centerX: number; centerY: number } | null> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('div, section'));
    let bestEl: HTMLElement | null = null;
    let bestArea = Number.POSITIVE_INFINITY;

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const text = el.innerText ?? '';
      if (
        /Round\s*\d+\s*\/\s*10/i.test(text) &&
        /Total\s*(?:Points|Pts)/i.test(text) &&
        /Trick\s*(?:Points|Pts)/i.test(text)
      ) {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width > 0 && rect.height > 0 && area < bestArea) {
          bestArea = area;
          bestEl = el;
        }
      }
    }

    if (!bestEl) {
      return null;
    }
    const rect = bestEl.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
    };
  });
}

async function inspectAtmosphereCss(page: Page): Promise<AtmosphereReport> {
  return page.evaluate(() => {
    let hasPatiWeave = false;
    let hasChalerBosta = false;
    let hasRadialOverlay = false;

    for (const el of document.querySelectorAll('*')) {
      const style = window.getComputedStyle(el);
      const bgImg = style.backgroundImage ?? '';
      const cls =
        typeof el.className === 'string' ? el.className : '';

      if (
        cls.includes('bg-pati-mat') ||
        cls.includes('pati-weave') ||
        (bgImg.includes('repeating-linear-gradient') &&
          bgImg.includes('45deg') &&
          bgImg.includes('-45deg'))
      ) {
        hasPatiWeave = true;
      }

      if (
        cls.includes('bg-chaler-bosta') ||
        (bgImg.includes('repeating-linear-gradient') &&
          (bgImg.includes('90deg') || bgImg.includes('0deg')))
      ) {
        hasChalerBosta = true;
      }

      if (
        cls.includes('lantern-glow') ||
        cls.includes('table-vignette') ||
        bgImg.includes('radial-gradient')
      ) {
        hasRadialOverlay = true;
      }
    }

    return { hasPatiWeave, hasChalerBosta, hasRadialOverlay };
  });
}

async function inspectWebfonts(page: Page): Promise<WebfontReport> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const allFontFaces = Array.from(document.fonts);
    const loadedFamilies = allFontFaces
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family);
    const registeredFamilies = allFontFaces.map((font) => font.family);
    const rootStyle = window.getComputedStyle(document.documentElement);
    for (const varName of [
      '--font-caveat',
      '--font-patrick',
      '--font-bangla',
      '--font-pixel',
    ]) {
      const val = rootStyle.getPropertyValue(varName).trim();
      if (val) {
        registeredFamilies.push(val);
      }
    }
    return {
      status: document.fonts.status,
      loadedFamilies: Array.from(new Set(loadedFamilies)),
      registeredFamilies: Array.from(new Set(registeredFamilies)),
    };
  });
}

function assertZeroForbiddenBranding(text: string, label: string): void {
  for (const term of LEGACY_FORBIDDEN_TERMS) {
    expect(
      text.toLowerCase(),
      `Forbidden legacy branding "${term}" found in ${label}`,
    ).not.toContain(term.toLowerCase());
  }
}

test.describe('Tier 4 E2E: Responsive Desktop/Mobile Layout, Visual/Webfont Audit & Strict Branding (T4-E2E-03)', () => {
  test('T4-E2E-03a: README.md, SSR HTML, and Desktop 1440x900 full visual, geometry, atmosphere, card-tier & hygiene audit', async ({
    page,
    request,
  }) => {
    // 1. Strict branding in README.md and SSR HTTP response
    const readmeText = fs.readFileSync(
      path.resolve(process.cwd(), 'README.md'),
      'utf8',
    );
    expect(readmeText).toContain(CANONICAL_FULL_TITLE);
    assertZeroForbiddenBranding(readmeText, 'README.md');

    const ssrRes = await request.get('/');
    expect(ssrRes.status()).toBe(200);
    const ssrHtml = await ssrRes.text();
    expect(ssrHtml).toContain(CANONICAL_TITLE_BANGLA);
    expect(ssrHtml).toContain(CANONICAL_TITLE_ENGLISH);
    assertZeroForbiddenBranding(ssrHtml, 'SSR HTML');

    // 2. Desktop 1440x900 Lobby & GameTable audit
    const monitors = attachRuntimeMonitors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page).toHaveTitle(/হান্ডেট\s*\(Hundred\)/);
    const lobbyText = await page.evaluate(() => document.body.innerText ?? '');
    expect(lobbyText).toContain(CANONICAL_TITLE_BANGLA);
    expect(lobbyText).toContain(CANONICAL_TITLE_ENGLISH);
    assertZeroForbiddenBranding(lobbyText, 'Desktop Lobby DOM');

    const lobbyOverflow = await measureHorizontalOverflow(page);
    expect(lobbyOverflow.hasOverflow).toBe(false);
    expect(lobbyOverflow.scrollWidth).toBeLessThanOrEqual(
      lobbyOverflow.innerWidth,
    );

    const roomCode = await createRoomAndEnter(page, 'Zarin');
    await fillBotsAndStartMatch(page);

    const tableOverflow = await measureHorizontalOverflow(page);
    expect(tableOverflow.hasOverflow).toBe(false);
    expect(tableOverflow.scrollWidth).toBeLessThanOrEqual(
      tableOverflow.innerWidth,
    );

    const tableText = await page.evaluate(() => document.body.innerText ?? '');
    assertZeroForbiddenBranding(tableText, 'Desktop GameTable DOM');

    // Verify all 4 SeatHubs are rendered in Top/Left/Right/Bottom-Left tabletop arrangement
    const allPlayers = ['Zarin', ...BOT_NAMES] as const;
    const seatHubs = await locateSeatHubsGeometry(page, allPlayers);
    expect(seatHubs).toHaveLength(4);
    for (const hub of seatHubs) {
      expect(hub.x).toBeGreaterThanOrEqual(-2);
      expect(hub.x + hub.width).toBeLessThanOrEqual(1442);
    }

    const minX = Math.min(...seatHubs.map((h) => h.centerX));
    const maxX = Math.max(...seatHubs.map((h) => h.centerX));
    const minY = Math.min(...seatHubs.map((h) => h.centerY));
    const maxY = Math.max(...seatHubs.map((h) => h.centerY));
    expect(maxX - minX).toBeGreaterThanOrEqual(200);
    expect(maxY - minY).toBeGreaterThanOrEqual(120);

    // Center Trick Arena sits inside tabletop center
    const arenaBox = await locateCenterArenaBox(page);
    expect(arenaBox).not.toBeNull();
    if (!arenaBox) {
      throw new Error('Expected Center Trick Arena bounding box on desktop');
    }
    expect(arenaBox.centerX).toBeGreaterThan(minX);
    expect(arenaBox.centerX).toBeLessThan(maxX);

    // Atmosphere CSS & running CSS rain streaks
    const atmosphere = await inspectAtmosphereCss(page);
    expect(atmosphere.hasPatiWeave).toBe(true);
    expect(atmosphere.hasChalerBosta).toBe(true);
    expect(atmosphere.hasRadialOverlay).toBe(true);

    const rainReport = await inspectRainAnimationState(page);
    expect(rainReport.elementCount).toBeGreaterThanOrEqual(1);
    expect(rainReport.hasActiveAnimation).toBe(true);

    // Verify 5 card tier CSS palette tokens classify to the exact 5 UNO tiers
    const tierVarChecks = [
      { cssVar: '--tier-brick-red', expected: 'brick-red' },
      { cssVar: '--tier-ochre-yellow', expected: 'ochre-yellow' },
      { cssVar: '--tier-forest-green', expected: 'forest-green' },
      { cssVar: '--tier-cobalt-blue', expected: 'cobalt-blue' },
      { cssVar: '--tier-charcoal', expected: 'charcoal-gold' },
    ] as const;
    for (const item of tierVarChecks) {
      const rawCssValue = await page.evaluate((varName) => {
        return window
          .getComputedStyle(document.documentElement)
          .getPropertyValue(varName)
          .trim();
      }, item.cssVar);
      const normalized = await normalizeCssColorToRgb(page, rawCssValue);
      const parsed = classifyCardRgb(normalized);
      expect(parsed?.tierGuess).toBe(item.expected);
    }

    // Bid & enter PLAYING so dealt UNO visiting cards are fully interactive & visible
    await waitForHumanCallTurn(page, roomCode);
    await placeQuickCall(page, 50);
    await waitForHumanPlayTurn(page, roomCode);

    const handCards = await getHandCardButtons(page, roomCode);
    expect(handCards).toHaveLength(5);

    for (const card of handCards) {
      const expectedTier = expectedTierForCard(card.value);
      const rawColors = await card.button.evaluate((btn) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const toRgba = (raw: string): string => {
          if (!ctx || !raw || raw === 'transparent') {
            return 'transparent';
          }
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = raw;
          ctx.fillRect(0, 0, 1, 1);
          const data = ctx.getImageData(0, 0, 1, 1).data;
          if (data[3] === 0) {
            return 'transparent';
          }
          const alpha = Number((data[3] / 255).toFixed(3));
          return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${alpha})`;
        };
        const colors: string[] = [];
        const nodes: Element[] = [btn, ...Array.from(btn.querySelectorAll('*'))];
        for (const node of nodes) {
          const style = window.getComputedStyle(node);
          colors.push(
            toRgba(style.backgroundColor),
            toRgba(style.borderColor),
            toRgba(style.color),
          );
        }
        return colors;
      });
      const matchedTier = rawColors.some((c) => {
        const parsed = classifyCardRgb(c);
        return parsed !== null && parsed.a > 0.1 && parsed.tierGuess === expectedTier;
      });
      expect(matchedTier).toBe(true);
    }

    // Webfonts loaded (Caveat, Patrick Hand, Noto Sans Bengali, Silkscreen)
    const fonts = await inspectWebfonts(page);
    expect(fonts.status).toBe('loaded');
    expect(fonts.loadedFamilies.length).toBeGreaterThan(0);
    const joinedRegistered = fonts.registeredFamilies.join(' | ');
    expect(joinedRegistered).toMatch(/caveat/i);
    expect(joinedRegistered).toMatch(/patrick/i);
    expect(joinedRegistered).toMatch(/bengali|bangla/i);
    expect(joinedRegistered).toMatch(/silkscreen|pixel/i);

    monitors.assertClean();
  });

  test('T4-E2E-03b: Mobile 390x844 (hasTouch: true) zero horizontal overflow, thumb-friendly PTT, 4 SeatHubs & clean runtime', async ({
    browser,
  }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
    });
    const mobilePage = await mobileContext.newPage();
    const monitors = attachRuntimeMonitors(mobilePage);

    try {
      await mobilePage.goto('/');
      await expect(mobilePage).toHaveTitle(/হান্ডেট\s*\(Hundred\)/);

      const lobbyOverflow = await measureHorizontalOverflow(mobilePage);
      expect(lobbyOverflow.hasOverflow).toBe(false);
      expect(lobbyOverflow.scrollWidth).toBeLessThanOrEqual(390);

      const roomCode = await createRoomAndEnter(mobilePage, 'Tasnim');
      await fillBotsAndStartMatch(mobilePage);

      const tableOverflow = await measureHorizontalOverflow(mobilePage);
      expect(tableOverflow.hasOverflow).toBe(false);
      expect(tableOverflow.scrollWidth).toBeLessThanOrEqual(390);

      const mobileBodyText = await mobilePage.evaluate(
        () => document.body.innerText ?? '',
      );
      assertZeroForbiddenBranding(mobileBodyText, 'Mobile GameTable DOM');

      // All 4 SeatHubs fit inside 390px mobile width
      const mobileHubs = await locateSeatHubsGeometry(mobilePage, [
        'Tasnim',
        ...BOT_NAMES,
      ]);
      expect(mobileHubs).toHaveLength(4);
      for (const hub of mobileHubs) {
        expect(hub.x).toBeGreaterThanOrEqual(-2);
        expect(hub.x + hub.width).toBeLessThanOrEqual(392);
      }

      // Center Trick Arena fits cleanly inside mobile viewport
      const mobileArena = await locateCenterArenaBox(mobilePage);
      expect(mobileArena).not.toBeNull();
      if (!mobileArena) {
        throw new Error('Expected Center Trick Arena bounding box on mobile');
      }
      expect(mobileArena.x).toBeGreaterThanOrEqual(-2);
      expect(mobileArena.x + mobileArena.width).toBeLessThanOrEqual(392);

      // Thumb-friendly Hold-to-Talk (PTT) touch target >= 44x40px
      const pttBtn = getHoldToTalkButton(mobilePage);
      await expect(pttBtn).toBeVisible();
      const pttBox = await pttBtn.boundingBox();
      expect(pttBox).not.toBeNull();
      if (!pttBox) {
        throw new Error('Expected Hold-to-Talk button bounding box on mobile');
      }
      expect(pttBox.width).toBeGreaterThanOrEqual(44);
      expect(pttBox.height).toBeGreaterThanOrEqual(40);

      // Bid & verify 5 hand cards stay bounded inside mobile width
      await waitForHumanCallTurn(mobilePage, roomCode);
      await placeQuickCall(mobilePage, 50);
      await waitForHumanPlayTurn(mobilePage, roomCode);

      const mobileCards = await getHandCardButtons(mobilePage, roomCode);
      expect(mobileCards).toHaveLength(5);
      for (const card of mobileCards) {
        const cardBox = await card.button.boundingBox();
        expect(cardBox).not.toBeNull();
        if (!cardBox) {
          throw new Error(`Expected bounding box for mobile card ${card.value}`);
        }
        expect(cardBox.x).toBeGreaterThanOrEqual(-2);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(392);
      }

      monitors.assertClean();
    } finally {
      await mobileContext.close();
    }
  });
});
