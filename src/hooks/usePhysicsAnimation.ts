'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhysicsFrame } from '@/lib/types';

// ---------------------------------------------------------------------------
// Playback store — mutable data read by useFrame inside the Canvas
// ---------------------------------------------------------------------------

export interface PhysicsPlaybackStore {
  frames: PhysicsFrame[][] | null;
  /**
   * Set to 0 when frames arrive. The first useFrame call that sees 0
   * initializes it to the current time — this ensures the timer starts
   * only after the Dice components are actually mounted in the Canvas.
   */
  startTime: number;
  fps: number;
  isPlaying: boolean;
  /** Per-dice last-step tracking for bounce detection dedup. */
  lastBounceStep: Map<string, number>;
  onBounce?: (intensity: number) => void;
  onStart?: () => void;
  onComplete?: () => void;
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UsePhysicsAnimationReturn {
  /** Stable ref to the playback store. Pass into Canvas components. */
  playbackRef: React.RefObject<PhysicsPlaybackStore>;
  /** React state for UI gating (e.g. disabling throw gesture). */
  isAnimating: boolean;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePhysicsAnimation({
  frames,
  fps = 60,
  onBounce,
  onStart,
  onComplete,
}: {
  frames: PhysicsFrame[][] | null;
  fps?: number;
  onBounce?: (intensity: number) => void;
  onStart?: () => void;
  onComplete?: () => void;
}): UsePhysicsAnimationReturn {
  const [isAnimating, setIsAnimating] = useState(false);

  const playbackRef = useRef<PhysicsPlaybackStore>({
    frames: null,
    startTime: 0,
    fps,
    isPlaying: false,
    lastBounceStep: new Map(),
    onBounce,
    onStart,
    onComplete,
    completed: false,
  });

  // Keep callbacks fresh. Wrap onComplete to also flip React state.
  useEffect(() => {
    playbackRef.current.onBounce = onBounce;
    playbackRef.current.onStart = onStart;
    playbackRef.current.onComplete = () => {
      setIsAnimating(false);
      onComplete?.();
    };
  }, [onBounce, onStart, onComplete]);

  // Start playback when new frames arrive
  useEffect(() => {
    if (!frames || frames.length === 0) return;

    const store = playbackRef.current;
    store.frames = frames;
    store.fps = fps;
    store.startTime = 0; // 0 = lazy init on first useFrame tick
    store.isPlaying = true;
    store.lastBounceStep = new Map();
    store.completed = false;
    setIsAnimating(true);
    store.onStart?.();
  }, [frames, fps]);

  const reset = useCallback(() => {
    playbackRef.current.isPlaying = false;
    playbackRef.current.completed = false;
    setIsAnimating(false);
  }, []);

  return { playbackRef, isAnimating, reset };
}
