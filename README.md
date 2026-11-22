# হান্ড্রেট HUNDRED

**হান্ড্রেট HUNDRED** (Bangla: **হান্ড্রেট**, English: **Hundred**) is a 4-player UNO-inspired Bangladeshi top-down flat-lay multiplayer trick-taking card game with serverless Supabase Realtime host failover and LiveKit voice chat.

## Game Overview & Rules

- **4-Player Rooms & AI Bots:** Create rooms (`TNG-XX` + 2 digits, e.g. `TNG-KM47`) with shareable `?room=` invite links, or add named AI bots (`Siam`, `Apon`, `Nabil`) to empty seats so 1–3 humans can start immediately.
- **20-Card Unique Deck:** `[1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 95, 100]` (`85` excluded; total deck sum `966`).
- **10-Round Match Lifecycle:**
  1. **DEAL:** Shuffle and deal 5 unique cards to each of the 4 seats (`0..3`).
  2. **CALL (Bidding):** Players sequentially declare their expected captured point sum (`0` to `500` in steps of `10`, with quick-call pills `0, 50, 100, 150, 200, 250, 300` and custom input).
  3. **TRICK PLAY (5 Tricks):** Each player lays 1 card per turn; the highest card wins all 4 cards (ties are impossible) and leads the next trick.
  4. **SCORING:** Sum face values of captured cards. If `capturedPoints >= call`, add `call` to `totalScore`; otherwise add `0`.
- **Serverless Multiplayer & Failover:** Uses a single Supabase Realtime Presence + Broadcast channel (`eksho:${roomCode}`), `sessionStorage` `clientId` + `seatIndex` self-echo protection, lowest-`seatIndex` deterministic host migration, `25s` bidding / `20s` play shot-clocks with `>2500ms` stall watchdog, and `localStorage` (`eksho_state_${roomCode}`) + `REQUEST_SYNC` reconnect recovery.
- **LiveKit Voice & Village 3G Mode:** Server-minted JWT tokens (`/api/livekit/token`), `echoCancellation`/`noiseSuppression`/`autoGainControl` + `dtx: true`, **Village 3G / Low-Data Mode** capping audio at `16000` bps (16kbps Opus mono) while pausing CSS rain animations, live `isSpeaking` avatar rings, Open Mic + mobile Hold-to-Talk, and a collapsible Bangla/Banglish banter chat drawer.
- **Graceful Local Fallback:** Runs cleanly in local & bot fallback mode with text chat when `.env.local` cloud keys are not configured.

## Environment Variables (`.env.example`)

Copy `.env.example` to `.env.local` to enable cloud Supabase sync and LiveKit voice:

```bash
cp .env.example .env.local
```

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL for Realtime Presence & Broadcast (`eksho:${roomCode}`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous key for browser Realtime channel access |
| `NEXT_PUBLIC_LIVEKIT_URL` | Public | LiveKit Cloud WebSocket URL (`wss://...`) |
| `LIVEKIT_API_KEY` | Server | LiveKit API key used by `app/api/livekit/token/route.ts` |
| `LIVEKIT_API_SECRET` | Server | LiveKit API secret used to sign room JWTs |

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Verification Commands

```bash
# 1. Generate Next.js route types & run strict TypeScript check
npx next typegen && npx tsc --noEmit

# 2. Lint codebase
npm run lint

# 3. Run Vitest unit & component test suite
npm run test

# 4. Build production bundle
npm run build

# 5. Run Playwright E2E suite (against production server)
npx playwright test
```
