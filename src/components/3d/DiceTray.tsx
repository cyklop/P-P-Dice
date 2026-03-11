'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * DiceTray -- a rectangular tray with raised edges that acts as the
 * container where dice roll.  Made to look like dark wood / felt using
 * only material properties (no external textures).
 */

const TRAY_WIDTH = 12;
const TRAY_DEPTH = 9;
const TRAY_FLOOR_THICKNESS = 0.15;
const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 0.3;

export interface DiceTrayProps {
  floorColor?: string;
  woodColor?: string;
}

export function DiceTray({
  floorColor = '#1a472a',
  woodColor = '#3b2314',
}: DiceTrayProps = {}) {
  const wallMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: woodColor,
        roughness: 0.7,
        metalness: 0.05,
      }),
    [woodColor],
  );

  const floorMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: floorColor,
        roughness: 0.95,
        metalness: 0.0,
      }),
    [floorColor],
  );

  const wallY = WALL_HEIGHT / 2 + TRAY_FLOOR_THICKNESS / 2;

  return (
    <group>
      {/* Floor — extend under the walls so there's no visible gap */}
      <mesh
        position={[0, -TRAY_FLOOR_THICKNESS / 2, 0]}
        receiveShadow
        material={floorMaterial}
      >
        <boxGeometry args={[TRAY_WIDTH + WALL_THICKNESS * 2, TRAY_FLOOR_THICKNESS, TRAY_DEPTH + WALL_THICKNESS * 2]} />
      </mesh>

      {/* Wall: +X */}
      <mesh
        position={[TRAY_WIDTH / 2 + WALL_THICKNESS / 2, wallY, 0]}
        receiveShadow
        castShadow
        material={wallMaterial}
      >
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, TRAY_DEPTH + WALL_THICKNESS * 2]} />
      </mesh>

      {/* Wall: -X */}
      <mesh
        position={[-TRAY_WIDTH / 2 - WALL_THICKNESS / 2, wallY, 0]}
        receiveShadow
        castShadow
        material={wallMaterial}
      >
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, TRAY_DEPTH + WALL_THICKNESS * 2]} />
      </mesh>

      {/* Wall: +Z */}
      <mesh
        position={[0, wallY, TRAY_DEPTH / 2 + WALL_THICKNESS / 2]}
        receiveShadow
        castShadow
        material={wallMaterial}
      >
        <boxGeometry args={[TRAY_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
      </mesh>

      {/* Wall: -Z */}
      <mesh
        position={[0, wallY, -TRAY_DEPTH / 2 - WALL_THICKNESS / 2]}
        receiveShadow
        castShadow
        material={wallMaterial}
      >
        <boxGeometry args={[TRAY_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
      </mesh>
    </group>
  );
}
