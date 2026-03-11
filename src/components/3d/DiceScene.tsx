'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DiceTray } from './DiceTray';
import { Dice, type DiceProps } from './Dice';
import type { PhysicsFrame, DiceType } from '@/lib/types';
import { usePhysicsAnimation } from '@/hooks/usePhysicsAnimation';
import { useSound } from '@/hooks/useSound';
import { useTheme } from '@/hooks/useTheme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiceSceneProps {
  /** Static / resting dice to render when no animation is playing. */
  dice: DiceProps[];
  /** Physics frames from the server (all steps at once). */
  physicsFrames: PhysicsFrame[][] | null;
  /** Maps dice IDs to their DiceType for the current throw. */
  diceTypeMap?: Record<string, DiceType>;
  /** Default dice color when rendering physics-animated dice. */
  diceColor?: string;
  /** Per-dice color overrides (diceId -> hex color). Used in simultaneous mode. */
  diceColorMap?: Record<string, string>;
  /** Called when the client-side animation finishes playing. */
  onAnimationComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiceScene({
  dice,
  physicsFrames,
  diceTypeMap = {},
  diceColor = '#c2782e',
  diceColorMap = {},
  onAnimationComplete,
}: DiceSceneProps) {
  // Sound effects
  const sound = useSound();
  // Theme for lighting adjustments
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  // Physics playback — ref-based, no setState during animation
  const { playbackRef, isAnimating } = usePhysicsAnimation({
    frames: physicsFrames,
    fps: 60,
    onBounce: sound.playBounce,
    onStart: sound.playThrow,
    onComplete: () => {
      onAnimationComplete?.();
    },
  });

  // During animation: create dice entries from diceTypeMap (transforms driven by useFrame)
  // During static: use the dice prop array
  // IMPORTANT: If isAnimating but diceTypeMap is empty (race condition where
  // dice:result cleared activeAnimation before onComplete fired), fall back
  // to static dice to avoid rendering nothing.
  const renderedDice: DiceProps[] = useMemo(() => {
    if (isAnimating) {
      const entries = Object.entries(diceTypeMap);
      if (entries.length > 0) {
        return entries.map(([id, type]) => ({
          id,
          type,
          color: diceColorMap[id] ?? diceColor,
          // Initial positions — overridden by useFrame during playback
          position: [0, 3, 0] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
        }));
      }
    }
    return dice;
  }, [isAnimating, dice, diceTypeMap, diceColor, diceColorMap, playbackRef]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        camera={{
          position: [0, 14, 7],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Ambient fill light — brighter in light mode */}
        <ambientLight intensity={isLight ? 0.8 : 0.4} />

        {/* Key directional light with shadows */}
        <directionalLight
          position={[5, 12, 5]}
          intensity={isLight ? 1.8 : 1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
        />

        {/* Soft fill from the other side */}
        <directionalLight position={[-3, 8, -3]} intensity={isLight ? 0.6 : 0.3} />

        {/* Dice tray (floor + walls) */}
        <DiceTray
          floorColor={isLight ? '#2d6b45' : '#1a472a'}
          woodColor={isLight ? '#5a3a22' : '#3b2314'}
        />

        {/* Active dice */}
        {renderedDice.map((d) => (
          <Dice
            key={d.id}
            id={d.id}
            type={d.type}
            color={d.color}
            position={d.position}
            rotation={d.rotation}
            diceId={d.id}
            playbackRef={isAnimating ? playbackRef : null}
            resultValue={d.resultValue}
          />
        ))}

        {/* Camera controls -- limited to mostly top-down viewing */}
        <OrbitControls
          enablePan={false}
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 3}
          minDistance={8}
          maxDistance={25}
        />
      </Canvas>
    </div>
  );
}
