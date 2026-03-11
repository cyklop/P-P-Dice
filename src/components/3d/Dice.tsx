'use client';

import type { DiceType } from '@/lib/types';
import type { PhysicsPlaybackStore } from '@/hooks/usePhysicsAnimation';
import { DICE_GEOMETRY_MAP } from './DiceGeometries';

export interface DiceProps {
  type: DiceType;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion xyzw
  id: string;
  /** Dice ID for physics frame lookup. */
  diceId?: string;
  /** Playback store ref. Null = static mode. */
  playbackRef?: React.RefObject<PhysicsPlaybackStore> | null;
  /** The result value to highlight on this die (null = no highlight). */
  resultValue?: number | null;
}

/**
 * Unified Dice component that selects the correct geometry based on
 * DiceType and delegates physics animation to the geometry component.
 */
export function Dice({
  type,
  color,
  position,
  rotation,
  id,
  diceId,
  playbackRef,
  resultValue,
}: DiceProps) {
  const GeometryComponent = DICE_GEOMETRY_MAP[type];

  if (!GeometryComponent) {
    return null;
  }

  return (
    <GeometryComponent
      color={color}
      position={position}
      rotation={rotation}
      diceId={diceId ?? id}
      playbackRef={playbackRef ?? null}
      resultValue={resultValue}
    />
  );
}
