'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSoundReturn {
  isMuted: boolean;
  toggleMute: () => void;
  playThrow: () => void;
  playBounce: (intensity: number) => void;
  playRoll: () => void;
  playResult: () => void;
}

// ---------------------------------------------------------------------------
// Sound file paths (served from /public)
// ---------------------------------------------------------------------------

const SOUND_FILES = ['/sounds/dice-roll-1.mp3', '/sounds/dice-roll-2.mp3'];

// ---------------------------------------------------------------------------
// Singleton AudioContext & preloaded buffers
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;
const audioBuffers: AudioBuffer[] = [];
let buffersLoaded = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

async function preloadBuffers(): Promise<void> {
  if (buffersLoaded) return;
  const ctx = getAudioContext();
  const results = await Promise.allSettled(
    SOUND_FILES.map(async (path) => {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    }),
  );
  for (const result of results) {
    if (result.status === 'fulfilled') {
      audioBuffers.push(result.value);
    }
  }
  buffersLoaded = true;
}

/** Play a random dice sound with given volume and optional playback rate. */
function playRandomDiceSound(ctx: AudioContext, volume: number, rate = 1.0) {
  if (audioBuffers.length === 0) return;
  const buffer = audioBuffers[Math.floor(Math.random() * audioBuffers.length)];
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const MUTE_KEY = 'pp-dice-muted';

function loadMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Shared mute state across all hook instances
// ---------------------------------------------------------------------------

let sharedMuted = loadMuted();
const mutedListeners = new Set<(muted: boolean) => void>();

function setSharedMuted(muted: boolean) {
  sharedMuted = muted;
  saveMuted(muted);
  for (const listener of mutedListeners) {
    listener(muted);
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSound(): UseSoundReturn {
  // Start with false during SSR to avoid hydration mismatch,
  // then sync from shared state after mount
  const [isMuted, setIsMuted] = useState(false);
  const lastBounceTime = useRef(0);

  // Subscribe to shared mute state changes, sync initial value, and preload
  useEffect(() => {
    setIsMuted(sharedMuted);
    const listener = (muted: boolean) => setIsMuted(muted);
    mutedListeners.add(listener);
    // Preload audio buffers on first mount
    void preloadBuffers();
    return () => {
      mutedListeners.delete(listener);
    };
  }, []);

  const toggleMute = useCallback(() => {
    setSharedMuted(!sharedMuted);
  }, []);

  // Throw: play a dice sound at normal speed
  const playThrow = useCallback(() => {
    if (sharedMuted) return;
    const ctx = getAudioContext();
    playRandomDiceSound(ctx, 0.6, 1.0 + (Math.random() - 0.5) * 0.2);
  }, []);

  // Bounce: throttled short dice hit, higher pitch for stronger bounces
  const playBounce = useCallback((intensity: number) => {
    if (sharedMuted) return;
    const now = performance.now();
    // Throttle: max one bounce sound every 80ms
    if (now - lastBounceTime.current < 80) return;
    lastBounceTime.current = now;

    const ctx = getAudioContext();
    const clamped = Math.max(0, Math.min(1, intensity));
    // Softer volume for bounces, scale with intensity
    const volume = 0.15 + clamped * 0.3;
    // Higher playback rate for stronger impacts
    const rate = 1.2 + clamped * 0.8;
    playRandomDiceSound(ctx, volume, rate);
  }, []);

  // Roll: same as throw but slightly quieter
  const playRoll = useCallback(() => {
    if (sharedMuted) return;
    const ctx = getAudioContext();
    playRandomDiceSound(ctx, 0.4, 0.9 + Math.random() * 0.3);
  }, []);

  // Result: no-op (sound plays on throw, not on result)
  const playResult = useCallback(() => {
    // intentionally silent
  }, []);

  return { isMuted, toggleMute, playThrow, playBounce, playRoll, playResult };
}
