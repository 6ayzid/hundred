import { expect, test, type Page } from '@playwright/test';
import {
  attachRuntimeMonitors,
  BOT_NAMES,
  classifyCardRgb,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  getHandCardButtons,
  getRainToggle,
  inspectRainAnimationState,
  measureHorizontalOverflow,
  normalizeCssColorToRgb,
  placeQuickCall,
  playCardValue,
  waitForHumanCallTurn,
  waitForHumanPlayTurn,
  type ParsedRgbColor,
} from './helpers/tabletop';

interface SeatHubGeometry {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  hasAvatar: boolean;
  hasCallLabel: boolean;
  hasPtsLabel: boolean;
}

type TierKey =
  | 'brick-red'
  | 'ochre-yellow'
  | 'forest-green'
  | 'cobalt-blue'
  | 'charcoal-gold';

function expectedTierForCard(value: number): TierKey {
  if (value <= 20) return 'brick-red';
  if (value <= 45) return 'ochre-yellow';
  if (value <= 70) return 'forest-green';
  if (value <= 90) return 'cobalt-blue';
  return 'charcoal-gold';
}

async function findSeatHubGeometry(
  page: Page,
  targetName: string,
  otherNames: string[],
): Promise<SeatHubGeometry | null> {
  return page.evaluate(
    ({ name, others }) => {
      const candidates: Array<{ el: HTMLElement; area: number; rect: DOMRect }> =
        [];
      const allElements = document.querySelectorAll<HTMLElement>(
        'section, article, aside, div',
      );

      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 60 || rect.height < 36) continue;
        if (rect.width > window.innerWidth * 0.7) continue;

        const text = el.innerText ?? '';
        if (!text.includes(name)) continue;
        if (!/\bcall\b/i.test(text)) continue;
        if (!/\b(?:pts|points|score|total)\b/i.test(text)) continue;
        if (others.some((other) => text.includes(other))) continue;

        candidates.push({
          el,
          area: rect.width * rect.height,
          rect,
        });
      }

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => a.area - b.area);
      const best = candidates[0];
      const text = best.el.innerText ?? '';
      const hasSvgOrImg = best.el.querySelector('svg, img, canvas') !== null;
      const hasPixelBadge =
        best.el.querySelector('[class*="pixel" i], [data-avatar], [aria-label*="avatar" i]') !==
        null;

      return {
        name,
        x: best.rect.x,
        y: best.rect.y,
        width: best.rect.width,
        height: best.rect.height,
        centerX: best.rect.x + best.rect.width / 2,
        centerY: best.rect.y + best.rect.height / 2,
        hasAvatar: hasSvgOrImg || hasPixelBadge,
        hasCallLabel: /\bcall\b/i.test(text),
        hasPtsLabel: /\b(?:pts|points|score|total)\b/i.test(text),
      };
    },
    { name: targetName, others: otherNames },
  );
}

test.describe('Tier 1 — Tabletop Flat-Lay, Atmosphere, SeatHubs & Visiting Cards (F-23..F-27)', () => {
  test('T1-F23/24-01: 90-degree flat-lay has zero hands/bodies and renders pati, chaler bosta, vignette, lantern glow & toggleable rain', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await createRoomAndEnter(page, 'Kabir');
    await fillBotsAndStartMatch(page);

    const handBodyCount = await page
      .locator(
        'img[alt*="hand" i], img[alt*="body" i], [aria-label*="human hand" i], [data-testid*="human-hand" i]',
      )
      .count();
    expect(handBodyCount).toBe(0);

    const overflow = await measureHorizontalOverflow(page);
    expect(overflow.hasOverflow).toBe(false);

    const atmosphere = await page.evaluate(() => {
      const patiEl = document.querySelector('.bg-pati-mat, .pati-weave');
      const bostaEl = document.querySelector('.bg-chaler-bosta');
      const vignetteEl = document.querySelector('.table-vignette');
      const lanternEl = document.querySelector('.lantern-glow');

      const patiBg = patiEl
        ? window.getComputedStyle(patiEl).backgroundImage
        : '';
      const bostaBg = bostaEl
        ? window.getComputedStyle(bostaEl).backgroundImage
        : '';
      const vignetteBg = vignetteEl
        ? window.getComputedStyle(vignetteEl).backgroundImage
        : '';
      const lanternBg = lanternEl
        ? window.getComputedStyle(lanternEl).backgroundImage
        : '';

      return {
        hasPati: patiEl !== null && patiBg !== 'none' && patiBg.length > 0,
        hasBosta: bostaEl !== null && bostaBg !== 'none' && bostaBg.length > 0,
        hasVignette:
          vignetteEl !== null &&
          vignetteBg.includes('radial-gradient'),
        hasLantern:
          lanternEl !== null &&
          lanternBg.includes('radial-gradient') &&
          /255,\s*198,\s*92|245,\s*158,\s*45|92%|top|right/i.test(lanternBg),
      };
    });

    expect(atmosphere.hasPati).toBe(true);
    expect(atmosphere.hasBosta).toBe(true);
    expect(atmosphere.hasVignette).toBe(true);
    expect(atmosphere.hasLantern).toBe(true);

    const rainToggle = getRainToggle(page);
    await expect(rainToggle).toBeVisible();
    let rainState = await inspectRainAnimationState(page);
    if (!rainState.hasActiveAnimation) {
      await rainToggle.click();
      rainState = await inspectRainAnimationState(page);
    }
    expect(rainState.hasActiveAnimation).toBe(true);

    await rainToggle.click();
    await expect
      .poll(async () => (await inspectRainAnimationState(page)).isPaused, {
        timeout: 4_000,
      })
      .toBe(true);

    await rainToggle.click();
    await expect
      .poll(
        async () => (await inspectRainAnimationState(page)).hasActiveAnimation,
        { timeout: 4_000 },
      )
      .toBe(true);

    monitors.assertClean();
  });

  test('T1-F25/26-01: 4 SeatHubs (Top/Left/Right/Bottom-Left) with avatars/backs and Center Trick Arena updates live', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Mehedi');
    await fillBotsAndStartMatch(page);

    const allNames = ['Mehedi', ...BOT_NAMES];
    const hubs: SeatHubGeometry[] = [];

    for (const name of allNames) {
      const others = allNames.filter((n) => n !== name);
      const geom = await findSeatHubGeometry(page, name, others);
      expect(geom, `Missing SeatHub for ${name}`).not.toBeNull();
      if (geom) {
        expect(geom.hasAvatar).toBe(true);
        expect(geom.hasCallLabel).toBe(true);
        expect(geom.hasPtsLabel).toBe(true);
        hubs.push(geom);
      }
    }

    expect(hubs).toHaveLength(4);
    const humanHub = hubs.find((h) => h.name === 'Mehedi');
    const opponentHubs = hubs.filter((h) => h.name !== 'Mehedi');
    expect(opponentHubs).toHaveLength(3);

    const sortedByY = [...opponentHubs].sort((a, b) => a.centerY - b.centerY);
    const topHub = sortedByY[0];
    const sideHubs = sortedByY.slice(1).sort((a, b) => a.centerX - b.centerX);
    const leftHub = sideHubs[0];
    const rightHub = sideHubs[1];

    expect(topHub.centerY).toBeLessThan(leftHub.centerY);
    expect(topHub.centerY).toBeLessThan(rightHub.centerY);
    expect(leftHub.centerX).toBeLessThan(rightHub.centerX);
    expect(humanHub?.centerY ?? 0).toBeGreaterThan(topHub.centerY);
    expect(humanHub?.centerX ?? 9999).toBeLessThan(rightHub.centerX);

    const cardBackCount = await page
      .locator(
        '.card-visiting-back, [data-card-back], [aria-label*="card back" i]',
      )
      .count();
    expect(cardBackCount).toBeGreaterThanOrEqual(3);

    await expect(page.getByText(/Round\s*1\s*\/\s*10/i).first()).toBeVisible();
    await expect(page.getByText(/Total\s*(?:Points|Pts)/i).first()).toBeVisible();
    await expect(page.getByText(/Trick\s*(?:Points|Pts)/i).first()).toBeVisible();

    const arenaMetrics = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>('section, div'),
      ).filter((el) => {
        const txt = el.innerText ?? '';
        return (
          /Round\s*\d+\s*\/\s*10/i.test(txt) &&
          /Total\s*(?:Points|Pts)/i.test(txt) &&
          /Trick\s*(?:Points|Pts)/i.test(txt)
        );
      });
      candidates.sort(
        (a, b) =>
          a.getBoundingClientRect().width * a.getBoundingClientRect().height -
          b.getBoundingClientRect().width * b.getBoundingClientRect().height,
      );
      const arena = candidates[0];
      if (!arena) {
        return { found: false, hasDirectionalArrow: false };
      }
      const scope =
        arena.parentElement &&
        (arena.parentElement.innerText ?? '').length < 700
          ? arena.parentElement
          : arena;
      const hasArrowSvgOrGlyph =
        scope.querySelector(
          'svg, [data-active-arrow], [data-active-seat], [data-turn], [data-direction], [aria-label*="turn" i], [aria-label*="arrow" i], [class*="arrow" i], [class*="turn" i]',
        ) !== null || /[▲▼◀▶↑↓←→↗↘↙↖⬆⬇⬅➡]/.test(scope.innerText ?? '');
      return { found: true, hasDirectionalArrow: hasArrowSvgOrGlyph };
    });
    expect(arenaMetrics.found).toBe(true);
    expect(arenaMetrics.hasDirectionalArrow).toBe(true);

    await waitForHumanCallTurn(page, roomCode);
    await placeQuickCall(page, 50);

    await waitForHumanPlayTurn(page, roomCode);
    const playedValue = await playCardValue(page, roomCode);
    expect(playedValue).toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const text = document.body?.innerText ?? '';
            return /Trick\s*(?:Points|Pts)[\s\S]{0,24}[1-9]\d*/i.test(text);
          }),
        { timeout: 5_000 },
      )
      .toBe(true);

    monitors.assertClean();
  });

  test('T1-F27-01: UNO-style aged visiting cards render corner+center Caveat/Patrick numerals and all 5 distinct color tiers', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    const sampledTiers = new Map<TierKey, ParsedRgbColor>();
    let verifiedCardAnatomy = false;

    for (let dealIdx = 0; dealIdx < 20 && sampledTiers.size < 5; dealIdx += 1) {
      await page.goto('/');
      const roomCode = await createRoomAndEnter(page, `Tier${dealIdx}`);
      await fillBotsAndStartMatch(page);

      const cards = await getHandCardButtons(page, roomCode);
      expect(cards).toHaveLength(5);

      if (!verifiedCardAnatomy) {
        const standardCard = cards.find((c) => c.value <= 90) ?? cards[0];
        const anatomy = await standardCard.button.evaluate(
          (el, expectedVal) => {
            const leafParts: string[] = [];
            const walker = document.createTreeWalker(
              el,
              NodeFilter.SHOW_TEXT,
            );
            let node: Node | null = walker.nextNode();
            while (node) {
              const txt = (node.nodeValue ?? '').trim();
              if (txt.length > 0) {
                for (const part of txt.split(/\s+/).filter(Boolean)) {
                  leafParts.push(part);
                }
              }
              node = walker.nextNode();
            }

            const expectedStr = String(expectedVal);
            let tokens = leafParts.filter((t) => /^\d{1,3}$/.test(t));
            if (
              tokens.length === 0 &&
              leafParts.length === 1 &&
              (leafParts[0] === expectedStr.repeat(3) ||
                leafParts[0] === expectedStr.repeat(4))
            ) {
              const count = leafParts[0].length / expectedStr.length;
              tokens = Array.from({ length: count }, () => expectedStr);
            }

            const fontFamilies = Array.from(el.querySelectorAll('*'))
              .map((child) => window.getComputedStyle(child).fontFamily)
              .concat(window.getComputedStyle(el).fontFamily);
            const buttonBg = window.getComputedStyle(el).backgroundColor;
            return {
              tokens,
              fontFamilies,
              buttonBg,
            };
          },
          standardCard.value,
        );

        expect(anatomy.tokens.length).toBeGreaterThanOrEqual(3);
        for (const token of anatomy.tokens) {
          expect(token).toBe(String(standardCard.value));
        }
        expect(
          anatomy.fontFamilies.some((ff) => /caveat|patrick/i.test(ff)),
        ).toBe(true);
        const normalizedStock = await normalizeCssColorToRgb(
          page,
          anatomy.buttonBg,
        );
        const parsedStock = classifyCardRgb(normalizedStock);
        expect(parsedStock).not.toBeNull();
        if (standardCard.value <= 90 && parsedStock) {
          expect(parsedStock.luminance).toBeGreaterThan(0.65);
        }
        verifiedCardAnatomy = true;
      }

      for (const card of cards) {
        const tier = expectedTierForCard(card.value);
        if (sampledTiers.has(tier)) {
          continue;
        }

        const rawColors = await card.button.evaluate((el) => {
          const list: string[] = [];
          const nodes = [el, ...Array.from(el.querySelectorAll('*'))];
          for (const node of nodes) {
            const style = window.getComputedStyle(node);
            list.push(
              style.backgroundColor,
              style.borderTopColor,
              style.borderColor,
              style.color,
            );
          }
          return list;
        });

        for (const rawColor of rawColors) {
          const normalized = await normalizeCssColorToRgb(page, rawColor);
          const parsed = classifyCardRgb(normalized);
          if (!parsed || parsed.a < 0.5) continue;
          if (parsed.tierGuess === tier) {
            sampledTiers.set(tier, parsed);
            break;
          }
        }
      }
    }

    expect(sampledTiers.size).toBe(5);
    const allHexes = Array.from(sampledTiers.values()).map((c) => c.hex);
    expect(new Set(allHexes).size).toBe(5);

    expect(sampledTiers.get('brick-red')?.tierGuess).toBe('brick-red');
    expect(sampledTiers.get('ochre-yellow')?.tierGuess).toBe('ochre-yellow');
    expect(sampledTiers.get('forest-green')?.tierGuess).toBe('forest-green');
    expect(sampledTiers.get('cobalt-blue')?.tierGuess).toBe('cobalt-blue');
    expect(sampledTiers.get('charcoal-gold')?.tierGuess).toBe('charcoal-gold');

    monitors.assertClean();
  });
});
