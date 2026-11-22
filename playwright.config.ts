import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const CHROMIUM_EXECUTABLE_PATH =
  '/opt/ms-playwright/chromium-1255/chrome-linux64/chrome';

const resolvedExecutablePath = fs.existsSync(CHROMIUM_EXECUTABLE_PATH)
  ? CHROMIUM_EXECUTABLE_PATH
  : undefined;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
    launchOptions: {
      executablePath: resolvedExecutablePath,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
  webServer: {
    command: 'npm run start -- -H 127.0.0.1 -p 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
