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

/** Soft bubbly card pop onto pastel mat with subtle pitch variation */
export function playCardSound(): void {
  const pitchJitter = 0.94 + Math.random() * 0.14;
  playFilteredNoise(0.045, 2200 * pitchJitter, 0.2, 0);
  playTone(320 * pitchJitter, 0.055, 0.09, 'sine', 0);
  playTone(540 * pitchJitter, 0.045, 0.05, 'triangle', 0.012);
}

/** Soft airy card-slide tick for one-by-one card dealing & stack collection */
export function playDealTickSound(step = 0): void {
  const freq = 2300 + (step % 5) * 160;
  playFilteredNoise(0.028, freq, 0.12, 0);
  playTone(390 + (step % 5) * 26, 0.032, 0.045, 'sine', 0);
}

/** Brisk playful riffle shuffle + deal cascade */
export function playShuffleSound(): void {
  for (let i = 0; i < 8; i += 1) {
    playFilteredNoise(0.032, 1900 + i * 190, 0.14, i * 0.046);
    if (i % 2 === 0) {
      playTone(330 + i * 32, 0.035, 0.045, 'sine', i * 0.046);
    }
  }
}

/** Cute bubbly two-note marimba pop for confirming a call */
export function playCallSound(): void {
  playTone(587.33, 0.08, 0.1, 'sine', 0);
  playTone(880, 0.12, 0.1, 'triangle', 0.045);
}

/** Sparkly ascending chime when a trick is captured */
export function playTrickWinSound(): void {
  playTone(587.33, 0.14, 0.09, 'sine', 0);
  playTone(739.99, 0.16, 0.1, 'triangle', 0.06);
  playTone(880, 0.2, 0.1, 'sine', 0.12);
  playTone(1174.66, 0.24, 0.08, 'sine', 0.18);
}

/** Joyful sparkling arpeggio when a round completes */
export function playRoundSummarySound(): void {
  playTone(523.25, 0.18, 0.09, 'sine', 0);
  playTone(659.25, 0.2, 0.09, 'triangle', 0.07);
  playTone(783.99, 0.24, 0.1, 'sine', 0.14);
  playTone(1046.5, 0.32, 0.09, 'sine', 0.21);
}

/** Cute bouncy pop for banter / chat messages */
export function playChatSound(): void {
  playTone(784, 0.055, 0.06, 'sine', 0);
  playTone(1046.5, 0.06, 0.045, 'sine', 0.03);
}
