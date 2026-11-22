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

/** Crisp paper card snap onto woven mat */
export function playCardSound(): void {
  playFilteredNoise(0.065, 1600, 0.24, 0);
  playTone(170, 0.045, 0.08, 'sine', 0);
}

/** Brisk riffle shuffle + deal taps */
export function playShuffleSound(): void {
  for (let i = 0; i < 6; i += 1) {
    playFilteredNoise(0.04, 1800 + i * 160, 0.14, i * 0.055);
  }
}

/** Clean tactile click for confirming a call */
export function playCallSound(): void {
  playTone(520, 0.07, 0.12, 'triangle', 0);
  playTone(680, 0.08, 0.1, 'triangle', 0.05);
}

/** Warm two-note chime when a trick is captured */
export function playTrickWinSound(): void {
  playTone(523.25, 0.14, 0.11, 'triangle', 0);
  playTone(659.25, 0.2, 0.12, 'triangle', 0.08);
}

/** Pleasant chord when a round completes */
export function playRoundSummarySound(): void {
  playTone(440, 0.18, 0.1, 'triangle', 0);
  playTone(554.37, 0.2, 0.1, 'triangle', 0.09);
  playTone(659.25, 0.28, 0.11, 'triangle', 0.18);
}

/** Soft pop for banter / chat messages */
export function playChatSound(): void {
  playTone(760, 0.06, 0.07, 'sine', 0);
}
