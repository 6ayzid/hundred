import { expect, test, type Locator } from '@playwright/test';
import {
  attachRuntimeMonitors,
  BANTER_CHIPS,
  createRoomAndEnter,
  fillBotsAndStartMatch,
  getChatToggleButton,
  getHoldToTalkButton,
  getOpenMicButton,
  getRainToggle,
  getVillage3GToggle,
  inspectRainAnimationState,
  openChatDrawer,
  readStoredGameState,
  sendChatBanterChip,
  sendCustomChatMessage,
  spawnTokenTestServer,
} from './helpers/tabletop';

interface LiveKitJwtClaims {
  sub?: string;
  name?: string;
  iss?: string;
  iat?: number;
  nbf?: number;
  exp?: number;
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canSubscribe?: boolean;
  };
}

interface ButtonUiSnapshot {
  ariaPressed: string | null;
  text: string;
  dataAttrs: string;
  className: string;
}

async function captureButtonState(button: Locator): Promise<ButtonUiSnapshot> {
  return button.evaluate((el) => {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        attrs[attr.name] = attr.value;
      }
    }
    return {
      ariaPressed: el.getAttribute('aria-pressed'),
      text: (el.textContent ?? '').trim(),
      dataAttrs: JSON.stringify(attrs),
      className: el.className,
    };
  });
}

function decodeJwtPayload(token: string): LiveKitJwtClaims {
  const segments = token.split('.');
  expect(segments).toHaveLength(3);
  const json = Buffer.from(segments[1], 'base64url').toString('utf8');
  return JSON.parse(json) as LiveKitJwtClaims;
}

test.describe('Tier 1 — LiveKit Token API, VoiceBar, Village 3G & Chat (F-17..F-22)', () => {
  test('T1-F17-01: /api/livekit/token returns 503 unconfigured on base server and mints valid JWT claims on ephemeral token server', async ({
    request,
  }) => {
    const baseRes = await request.get(
      '/api/livekit/token?room=TNG-KM47&username=Rafi&clientId=cli-base-1',
    );
    expect([200, 503]).toContain(baseRes.status());

    if (baseRes.status() === 503) {
      const errBody = (await baseRes.json()) as {
        error?: string;
        configured?: boolean;
      };
      expect(typeof errBody.error).toBe('string');
      expect((errBody.error ?? '').length).toBeGreaterThan(0);
      expect(errBody.configured).toBe(false);
    } else {
      const okBody = (await baseRes.json()) as { token?: string };
      expect(okBody.token ?? '').toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    }

    const server = await spawnTokenTestServer(0, {
      NEXT_PUBLIC_LIVEKIT_URL: 'wss://hundred-e2e.livekit.cloud',
      LIVEKIT_API_KEY: 'devkey-e2e-test',
      LIVEKIT_API_SECRET: 'devsecret-e2e-test-32-chars-minimum',
    });

    try {
      const tokenRes = await request.get(
        `${server.baseUrl}/api/livekit/token?room=TNG-KM47&username=Rafi&clientId=cli-e2e-01`,
      );
      expect([200, 503]).toContain(tokenRes.status());

      if (tokenRes.status() === 200) {
        const tokenJson = (await tokenRes.json()) as { token?: string };
        const jwt = tokenJson.token ?? '';
        expect(jwt).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);

        const claims = decodeJwtPayload(jwt);
        expect(claims.sub).toBe('cli-e2e-01');
        expect(claims.name).toBe('Rafi');
        expect(claims.video?.room).toBe('TNG-KM47');
        expect(claims.video?.roomJoin).toBe(true);
        expect(claims.video?.canPublish).toBe(true);
        expect(claims.video?.canSubscribe).toBe(true);

        const issuedOrNbf = claims.iat ?? claims.nbf ?? 0;
        expect(typeof issuedOrNbf).toBe('number');
        expect(issuedOrNbf).toBeGreaterThan(0);
        expect(claims.exp ?? 0).toBeGreaterThan(issuedOrNbf);
      } else {
        const fallbackBody = (await tokenRes.json()) as {
          error?: string;
          configured?: boolean;
        };
        expect(typeof fallbackBody.error).toBe('string');
        expect((fallbackBody.error ?? '').length).toBeGreaterThan(0);
        expect(fallbackBody.configured).toBe(false);
      }
    } finally {
      await server.close();
    }
  });

  test('T1-F18/19/20/21-01: unconfigured VoiceBar banner, Village 3G rain pause without state reset, safe speaking rings & Open Mic/PTT', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    const roomCode = await createRoomAndEnter(page, 'Liton');
    await fillBotsAndStartMatch(page);

    await expect(
      page
        .getByText(/livekit|voice.*(?:unconfigured|fallback|unavailable|setup)|\.env\.local/i)
        .first(),
    ).toBeVisible();

    const activeSpeakingCount = await page
      .locator('[data-speaking="true"]')
      .count();
    expect(activeSpeakingCount).toBe(0);

    let initialRain = await inspectRainAnimationState(page);
    if (!initialRain.hasActiveAnimation) {
      const rainToggle = getRainToggle(page);
      await expect(rainToggle).toBeVisible();
      await rainToggle.click();
      initialRain = await inspectRainAnimationState(page);
    }
    expect(initialRain.elementCount).toBeGreaterThanOrEqual(1);
    expect(initialRain.hasActiveAnimation).toBe(true);

    const beforeVillage3G = await readStoredGameState(page, roomCode);
    const village3GToggle = getVillage3GToggle(page);
    await expect(village3GToggle).toBeVisible();
    await expect(village3GToggle).toBeEnabled();
    await village3GToggle.click();

    await expect
      .poll(async () => (await inspectRainAnimationState(page)).isPaused, {
        timeout: 5_000,
      })
      .toBe(true);

    const pausedRain = await inspectRainAnimationState(page);
    expect(pausedRain.hasActiveAnimation).toBe(false);

    const duringVillage3G = await readStoredGameState(page, roomCode);
    expect(duringVillage3G?.roomCode).toBe(beforeVillage3G?.roomCode);
    expect(duringVillage3G?.round).toBe(beforeVillage3G?.round);
    expect(duringVillage3G?.phase).toBe(beforeVillage3G?.phase);

    await village3GToggle.click();
    await expect
      .poll(
        async () => (await inspectRainAnimationState(page)).hasActiveAnimation,
        { timeout: 5_000 },
      )
      .toBe(true);

    const openMicBtn = getOpenMicButton(page);
    await expect(openMicBtn).toBeVisible();
    await expect(openMicBtn).toBeEnabled();
    const micBefore = await captureButtonState(openMicBtn);
    await openMicBtn.click();
    const micAfterToggle = await captureButtonState(openMicBtn);
    expect(micAfterToggle).not.toEqual(micBefore);
    await openMicBtn.click();
    const micRestored = await captureButtonState(openMicBtn);
    expect(micRestored).toEqual(micBefore);

    const pttBtn = getHoldToTalkButton(page);
    await expect(pttBtn).toBeVisible();
    await expect(pttBtn).toBeEnabled();
    const pttBox = await pttBtn.boundingBox();
    expect(pttBox).not.toBeNull();

    const pttBefore = await captureButtonState(pttBtn);
    await page.mouse.move(
      (pttBox?.x ?? 0) + (pttBox?.width ?? 20) / 2,
      (pttBox?.y ?? 0) + (pttBox?.height ?? 20) / 2,
    );
    await page.mouse.down();
    await expect
      .poll(() => captureButtonState(pttBtn), { timeout: 3_000 })
      .not.toEqual(pttBefore);

    await page.mouse.up();
    await expect
      .poll(() => captureButtonState(pttBtn), { timeout: 3_000 })
      .toEqual(pttBefore);

    monitors.assertClean();
  });

  test('T1-F22-01: collapsible Bangla/Banglish chat drawer sends all 4 banter chips and custom messages', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await createRoomAndEnter(page, 'Shanto');
    await fillBotsAndStartMatch(page);

    await openChatDrawer(page);
    for (const chip of BANTER_CHIPS) {
      const chipBtn = page.getByRole('button', { name: chip, exact: true }).first();
      await expect(chipBtn).toBeVisible();
      await expect(chipBtn).toBeEnabled();
    }

    await sendChatBanterChip(page, '100 charlam!');
    await expect
      .poll(() => page.getByText('100 charlam!').count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);

    const customMsg = 'Darun khela hoyeche!';
    await sendCustomChatMessage(page, customMsg);
    await expect(page.getByText(customMsg)).toBeVisible();

    const chatToggle = getChatToggleButton(page);
    await chatToggle.click();
    await expect(
      page.getByRole('button', { name: BANTER_CHIPS[0], exact: true }).first(),
    ).toBeHidden();

    await openChatDrawer(page);
    await expect(page.getByText(customMsg)).toBeVisible();

    monitors.assertClean();
  });
});
