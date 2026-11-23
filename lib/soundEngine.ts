'use client';

const SFX_MUTE_KEY = 'hundred_sfx_muted';

let audioCtx: AudioContext | null = null;
let mutedCache: boolean | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioCtor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSfxMuted(): boolean {
  if (mutedCache !== null) return mutedCache;
  if (typeof window === 'undefined') return false;
  try {
    mutedCache = window.localStorage.getItem(SFX_MUTE_KEY) === 'true';
  } catch {
    mutedCache = false;
  }
  return mutedCache;
}

export function setSfxMuted(muted: boolean): void {
  mutedCache = muted;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SFX_MUTE_KEY, String(muted));
    } catch {
      // Ignore storage errors
    }
  }
}

export function unlockAudio(): void {
  getAudioContext();
}

function playFilteredNoise(
  durationSec: number,
  filterFreq: number,
  gainPeak: number,
  delaySec = 0,
): void {
  const ctx = getAudioContext();
  if (!ctx || isSfxMuted()) return;

  const startTime = ctx.currentTime + delaySec;
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / sampleCount) * 4.5);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, startTime);
  filter.Q.setValueAtTime(1.4, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start(startTime);
  src.stop(startTime + durationSec + 0.02);
}

function playTone(
  freq: number,
  durationSec: number,
  gainPeak: number,
  type: OscillatorType = 'triangle',
  delaySec = 0,
): void {
  const ctx = getAudioContext();
  if (!ctx || isSfxMuted()) return;

  const startTime = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

/** Crisp paper card snap onto woven mat with subtle pitch variation */
export function playCardSound(): void {
  const pitchJitter = 0.92 + Math.random() * 0.16;
  playFilteredNoise(0.055, 1900 * pitchJitter, 0.28, 0);
  playFilteredNoise(0.035, 3400 * pitchJitter, 0.12, 0.008);
  playTone(145 * pitchJitter, 0.055, 0.11, 'sine', 0);
}

/** Soft airy card-slide tick for one-by-one card dealing & stack collection */
export function playDealTickSound(step = 0): void {
  const freq = 2100 + (step % 5) * 140;
  playFilteredNoise(0.032, freq, 0.14, 0);
  playTone(220 + (step % 5) * 14, 0.025, 0.04, 'triangle', 0);
}

/** Brisk riffle shuffle + deal cascade */
export function playShuffleSound(): void {
  for (let i = 0; i < 8; i += 1) {
    playFilteredNoise(0.036, 1700 + i * 180, 0.16, i * 0.048);
    if (i % 2 === 0) {
      playTone(160 + i * 12, 0.03, 0.04, 'sine', i * 0.048);
    }
  }
}

/** Clean tactile wooden click + warm chime for confirming a call */
export function playCallSound(): void {
  playFilteredNoise(0.03, 1200, 0.12, 0);
  playTone(480, 0.075, 0.11, 'triangle', 0);
  playTone(720, 0.11, 0.1, 'sine', 0.045);
}

/** Warm acoustic chime when a trick is captured */
export function playTrickWinSound(): void {
  playTone(523.25, 0.16, 0.1, 'triangle', 0);
  playTone(659.25, 0.2, 0.11, 'sine', 0.07);
  playTone(783.99, 0.26, 0.09, 'triangle', 0.14);
}

/** Uplifting chord arpeggio when a round completes */
export function playRoundSummarySound(): void {
  playTone(440, 0.2, 0.09, 'triangle', 0);
  playTone(554.37, 0.22, 0.09, 'sine', 0.08);
  playTone(659.25, 0.26, 0.1, 'triangle', 0.16);
  playTone(880, 0.34, 0.08, 'sine', 0.24);
}

/** Gentle warm pop for banter / chat messages */
export function playChatSound(): void {
  playTone(680, 0.055, 0.06, 'sine', 0);
  playTone(880, 0.05, 0.04, 'sine', 0.03);
}
