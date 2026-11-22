import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  attachRuntimeMonitors,
  CANONICAL_FULL_TITLE,
  CANONICAL_TITLE_BANGLA,
  CANONICAL_TITLE_ENGLISH,
  LEGACY_FORBIDDEN_TERMS,
} from './helpers/tabletop';

interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readWorkspaceFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function parseMajorMinor(versionRaw: string): { major: number; minor: number } | null {
  const match = /(\d+)\.(\d+)/.exec(versionRaw);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
  };
}

test.describe('Tier 1 — Bootstrap, Env Guards & Branding (F-01, F-02, F-03)', () => {
  test('T1-F01-01: package.json declares required runtime stack, scripts, and TypeScript < 6.1.0', () => {
    const pkg = JSON.parse(readWorkspaceFile('package.json')) as PackageJsonShape;
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const scripts = pkg.scripts ?? {};

    const requiredRuntimeDeps = [
      'next',
      'react',
      'react-dom',
      'tailwindcss',
      '@supabase/supabase-js',
      'livekit-client',
      '@livekit/components-react',
      'livekit-server-sdk',
      'lucide-react',
    ];

    for (const depName of requiredRuntimeDeps) {
      expect(deps[depName], `Missing runtime dependency: ${depName}`).toMatch(
        /\d/,
      );
    }

    const tsRange = devDeps.typescript ?? deps.typescript ?? '';
    expect(tsRange).toMatch(/\d/);
    expect(tsRange).not.toMatch(/\b7\.|\b6\.[1-9]/);

    const installedTsPath = path.resolve(
      process.cwd(),
      'node_modules/typescript/package.json',
    );
    if (fs.existsSync(installedTsPath)) {
      const installedTs = JSON.parse(
        fs.readFileSync(installedTsPath, 'utf8'),
      ) as { version?: string };
      const parsed = parseMajorMinor(installedTs.version ?? '');
      expect(parsed).not.toBeNull();
      if (parsed) {
        expect(parsed.major * 100 + parsed.minor).toBeLessThan(601);
      }
    }

    expect(scripts.build).toContain('next build');
    expect(scripts.start).toContain('next start');
    expect(scripts.lint).toContain('eslint');
    expect(scripts.test).toContain('vitest');
  });

  test('T1-F01-02: GET / returns HTTP 200 SSR HTML and loads cleanly in Chromium with zero runtime errors', async ({
    page,
    request,
  }) => {
    const ssrRes = await request.get('/');
    expect(ssrRes.status()).toBe(200);
    expect(ssrRes.headers()['content-type'] ?? '').toContain('text/html');

    const ssrHtml = await ssrRes.text();
    expect(ssrHtml).toContain(CANONICAL_TITLE_BANGLA);
    expect(ssrHtml).toContain(CANONICAL_TITLE_ENGLISH);
    for (const forbidden of LEGACY_FORBIDDEN_TERMS) {
      expect(ssrHtml).not.toContain(forbidden);
    }

    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await expect(page).toHaveTitle(new RegExp(`${CANONICAL_TITLE_BANGLA}.*${CANONICAL_TITLE_ENGLISH}`));

    const fontCheck = await page.evaluate(async () => {
      await document.fonts.ready;
      const heading = document.querySelector('h1, h2');
      const headingFont = heading
        ? window.getComputedStyle(heading).fontFamily
        : window.getComputedStyle(document.body).fontFamily;
      return {
        status: document.fonts.status,
        headingFont: headingFont.trim(),
      };
    });

    expect(fontCheck.status).toBe('loaded');
    expect(fontCheck.headingFont.length).toBeGreaterThan(0);

    monitors.assertClean();
  });

  test('T1-F02-01: .env.example exposes all 5 required keys and .gitignore protects $HOME dotfiles', () => {
    const envExample = readWorkspaceFile('.env.example');
    const requiredKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_LIVEKIT_URL',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
    ];

    for (const key of requiredKeys) {
      expect(envExample).toMatch(new RegExp(`^${key}=`, 'm'));
    }

    const gitignore = readWorkspaceFile('.gitignore');
    const requiredIgnores = [
      '.agents/',
      '.gemini/',
      '.android/',
      '.gradle/',
      '.bashrc',
      '.profile',
      '.env*',
      '!.env.example',
    ];

    for (const entry of requiredIgnores) {
      expect(gitignore).toContain(entry);
    }
  });

  test('T1-F03-01: UI, document title, and README.md strictly use "হান্ডেট (Hundred)" with zero legacy branding', async ({
    page,
  }) => {
    const monitors = attachRuntimeMonitors(page);
    await page.goto('/');

    await expect(page).toHaveTitle(CANONICAL_FULL_TITLE);

    const visibleText = await page.evaluate(
      () => document.body?.innerText ?? '',
    );
    expect(visibleText).toContain(CANONICAL_TITLE_BANGLA);
    expect(visibleText).toContain(CANONICAL_TITLE_ENGLISH);
    expect(visibleText).toMatch(/হান্ডেট[\s\S]{0,24}Hundred/);

    for (const forbidden of LEGACY_FORBIDDEN_TERMS) {
      expect(visibleText).not.toContain(forbidden);
    }

    const readme = readWorkspaceFile('README.md');
    expect(readme).toContain(CANONICAL_FULL_TITLE);
    expect(readme).toContain(CANONICAL_TITLE_BANGLA);
    expect(readme).toContain(CANONICAL_TITLE_ENGLISH);
    for (const forbidden of LEGACY_FORBIDDEN_TERMS) {
      expect(readme).not.toContain(forbidden);
    }

    monitors.assertClean();
  });
});
