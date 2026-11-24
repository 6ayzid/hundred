import fs from 'node:fs';
import path from 'node:path';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { BrandMark } from '@/components/BrandLogo';
import { HundredApp } from '@/components/HundredApp';
import { isLiveKitConfigured, isSupabaseConfigured } from '@/lib/env';
import { DECK_CARDS } from '@/lib/types';

interface HomePageProps {
  searchParams: Promise<{ room?: string | string[] }>;
}

function detectAvailableCardScans(): number[] {
  const cardsDir = path.join(process.cwd(), 'public', 'cards');
  if (!fs.existsSync(cardsDir)) return [];
  return DECK_CARDS.filter((val) =>
    fs.existsSync(path.join(cardsDir, `${val}.png`)),
  );
}

async function HomeShell({ searchParams }: HomePageProps) {
  await connection();
  const params = await searchParams;
  const rawRoom = Array.isArray(params.room) ? params.room[0] : params.room;
  const supabaseConfigured = isSupabaseConfigured();
  const livekitConfigured = isLiveKitConfigured();
  const availableCardScans = detectAvailableCardScans();

  return (
    <HundredApp
      initialRoom={rawRoom ?? ''}
      supabaseConfigured={supabaseConfigured}
      livekitConfigured={livekitConfigured}
      availableCardScans={availableCardScans}
    />
  );
}

function HomeFallback() {
  return (
    <div className="pati-table-surface flex min-h-screen w-full flex-col items-center justify-center gap-2 text-[#4a2e2b]">
      <BrandMark size={56} className="animate-cute-float" />
      <span className="font-bangla text-lg font-bold">হানডেট HUNDRED লোড হচ্ছে…</span>
    </div>
  );
}

export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeShell searchParams={searchParams} />
    </Suspense>
  );
}
