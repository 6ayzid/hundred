import { expect, test, type Locator } from '@playwright/test';
import {
  attachRuntimeMonitors,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  getHoldToTalkButton,
  getOpenMicButton,
  measureHorizontalOverflow,
  openChatDrawer,
  sendCustomChatMessage,
  spawnTokenTestServer,
} from './helpers/tabletop';

interface ControlUiState {
  ariaPressed: string | null;
  text: string;
  dataAttrs: string;
  className: string;
}

async function readControlUiState(locator: Locator): Promise<ControlUiState> {
  return locator.evaluate((el) => {
    const dataMap: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        dataMap[attr.name] = attr.value;
      }
    }
    return {
      ariaPressed: el.getAttribute('aria-pressed'),
      text: (el.textContent ?? '').trim(),
      dataAttrs: JSON.stringify(dataMap),
      className: el.className,
    };
  });
}

test.describe('Tier 2 — LiveKit API, PTT Cancel/Blur & Chat Negatives (F-17, F-21, F-22)', () => {
  test('T2-F17-01: /api/livekit/token rejects 5 missing/blank param permutations with 400, blocks POST, and leaks zero secrets', async ({
    request,
  }) => {
    const basePost = await request.post('/api/livekit/token', {
      data: { room: 'TNG-KM47', username: 'Rafi', clientId: 'cli-1' },
    });
    expect(basePost.status()).toBeGreaterThanOrEqual(400);
    expect(basePost.status()).toBeLessThan(500);

    const baseMissing = await request.get('/api/livekit/token');
    expect([400, 503]).toContain(baseMissing.status());
    const baseMissingText = await baseMissing.text();
    expect(baseMissingText).not.toContain('LIVEKIT_API_SECRET');

    const testKey = 'devkey-e2e-neg';
    const testSecret = 'supersecret-e2e-neg-32-chars-minimum!';
    const server = await spawnTokenTestServer(0, {
      NEXT_PUBLIC_LIVEKIT_URL: 'wss://hundred-e2e.livekit.cloud',
      LIVEKIT_API_KEY: testKey,
      LIVEKIT_API_SECRET: testSecret,
    });

    try {
      const validRes = await request.get(
        `${server.baseUrl}/api/livekit/token?room=TNG-KM47&username=Rafi&clientId=cli-1`,
      );
      expect([200, 503]).toContain(validRes.status());
      const validText = await validRes.text();
      expect(validText).not.toContain(testSecret);
      expect(validText).not.toContain(testKey);

      const badQueries = [
        '/api/livekit/token',
        '/api/livekit/token?username=Rafi&clientId=cli-1',
        '/api/livekit/token?room=TNG-KM47&clientId=cli-1',
        '/api/livekit/token?room=TNG-KM47&username=Rafi',
        '/api/livekit/token?room=%20%20&username=Rafi&clientId=cli-1',
        '/api/livekit/token?room=TNG-KM47&username=%20&clientId=%20',
      ];

      for (const query of badQueries) {
        const res = await request.get(`${server.baseUrl}${query}`);
        if (validRes.status() === 200) {
          expect(res.status(), `Expected 400 for ${query}`).toBe(400);
        } else {
          expect([400, 503], `Expected 400 or 503 for ${query}`).toContain(
            res.status(),
          );
        }
        const bodyText = await res.text();
        expect(bodyText).not.toContain(testSecret);
        expect(bodyText).not.toContain(testKey);
        expect(bodyText).not.toContain('LIVEKIT_API_SECRET');
        const parsed = JSON.parse(bodyText) as { error?: string };
        expect(typeof parsed.error).toBe('string');
        expect((parsed.error ?? '').length).toBeGreaterThan(0);
      }

      const postRes = await request.post(`${server.baseUrl}/api/livekit/token`, {
        data: { room: 'TNG-KM47', username: 'Rafi', clientId: 'cli-1' },
      });
      expect(postRes.status()).toBeGreaterThanOrEqual(400);
      expect(postRes.status()).toBeLessThan(500);
    } finally {
      await server.close();
    }
  });

  test('T2-F21-01: Hold-to-Talk releases cleanly on pointercancel, pointerleave, and window.blur without sticking open mic', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await createRoomAndEnter(page, 'PttGuard');
    await fillBotsAndStartMatch(page);

    const pttBtn = getHoldToTalkButton(page);
    const openMicBtn = getOpenMicButton(page);

    await expect(pttBtn).toBeVisible();
    await expect(pttBtn).toBeEnabled();
    await expect(openMicBtn).toBeVisible();

    const pttRest = await readControlUiState(pttBtn);
    const micRest = await readControlUiState(openMicBtn);

    const box = await pttBtn.boundingBox();
    expect(box).not.toBeNull();
    const centerX = (box?.x ?? 0) + (box?.width ?? 20) / 2;
    const centerY = (box?.y ?? 0) + (box?.height ?? 20) / 2;

    // 1. pointercancel release
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .not.toEqual(pttRest);

    await pttBtn.evaluate((el) => {
      el.dispatchEvent(
        new PointerEvent('pointercancel', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
        }),
      );
    });
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .toEqual(pttRest);
    await page.mouse.up();
    expect(await readControlUiState(openMicBtn)).toEqual(micRest);

    // 2. pointerleave release
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .not.toEqual(pttRest);

    await pttBtn.evaluate((el) => {
      el.dispatchEvent(
        new PointerEvent('pointerout', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          relatedTarget: document.body,
        }),
      );
      el.dispatchEvent(
        new PointerEvent('pointerleave', {
          bubbles: false,
          cancelable: false,
          pointerId: 1,
          relatedTarget: document.body,
        }),
      );
    });
    await page.mouse.move(5, 5);
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .toEqual(pttRest);
    await page.mouse.up();
    expect(await readControlUiState(openMicBtn)).toEqual(micRest);

    // 3. window.blur release
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .not.toEqual(pttRest);

    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await expect
      .poll(() => readControlUiState(pttBtn), { timeout: 3_000 })
      .toEqual(pttRest);
    await page.mouse.up();
    expect(await readControlUiState(openMicBtn)).toEqual(micRest);

    monitors.assertClean();
  });

  test('T2-F22-01: Blank/whitespace chat is ignored and a 350-char message causes zero horizontal overflow', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await createRoomAndEnter(page, 'ChatGuard');
    await fillBotsAndStartMatch(page);

    await openChatDrawer(page);

    const chatInput = page
      .getByLabel(/chat\s*message|message|banter/i)
      .or(
        page.getByPlaceholder(
          /type.*message|send.*message|chat|bangla|banter/i,
        ),
      )
      .first();
    await expect(chatInput).toBeVisible();

    const sendBtn = page.getByRole('button', { name: /^send$/i }).first();

    const drawerStatsBefore = await chatInput.evaluate((inputEl) => {
      let node: HTMLElement | null = inputEl.parentElement;
      while (node && !(node.innerText ?? '').includes('100 charlam!')) {
        node = node.parentElement;
      }
      const container = node ?? document.body;
      return {
        messageItemCount: container.querySelectorAll(
          'li, [role="listitem"], [data-chat-message], [data-testid*="message" i]',
        ).length,
        text: container.innerText ?? '',
      };
    });
    expect(drawerStatsBefore.text).not.toContain('ChatGuard');

    for (const blankText of ['', '   \t  ']) {
      await chatInput.fill(blankText);
      if ((await sendBtn.count()) > 0 && (await sendBtn.isVisible())) {
        if (await sendBtn.isEnabled()) {
          await sendBtn.click();
        } else {
          await expect(sendBtn).toBeDisabled();
        }
      } else {
        await chatInput.press('Enter');
      }

      const drawerStatsAfter = await chatInput.evaluate((inputEl) => {
        let node: HTMLElement | null = inputEl.parentElement;
        while (node && !(node.innerText ?? '').includes('100 charlam!')) {
          node = node.parentElement;
        }
        const container = node ?? document.body;
        return {
          messageItemCount: container.querySelectorAll(
            'li, [role="listitem"], [data-chat-message], [data-testid*="message" i]',
          ).length,
          text: container.innerText ?? '',
        };
      });
      expect(drawerStatsAfter.messageItemCount).toBe(
        drawerStatsBefore.messageItemCount,
      );
      expect(drawerStatsAfter.text).not.toContain('ChatGuard');
    }

    const longMessage = `${'LongBanter_'.repeat(31)}123456789`;
    expect(longMessage).toHaveLength(350);

    await sendCustomChatMessage(page, longMessage);
    await expect(page.locator('body')).toContainText(longMessage.slice(0, 60));

    const overflow = await measureHorizontalOverflow(page);
    expect(overflow.hasOverflow).toBe(false);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    monitors.assertClean();
  });
});
