'use client';

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { DiceType } from '@/lib/types';
import type { PhysicsPlaybackStore } from '@/hooks/usePhysicsAnimation';
import type { DiceGeometryData } from '@/lib/dice-geometry-data';
import {
  getD4Data,
  getD6Data,
  getD8Data,
  getD10Data,
  getD12Data,
  getD20Data,
} from '@/lib/dice-geometry-data';

// ---------------------------------------------------------------------------
// Scratch objects — allocated once, reused every frame (zero GC pressure)
// ---------------------------------------------------------------------------

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Standard PBR material props shared across all dice. */
function diceMaterial(color: string) {
  return {
    color,
    metalness: 0.3,
    roughness: 0.35,
  } as const;
}

// ---------------------------------------------------------------------------
// Face-label helpers
// ---------------------------------------------------------------------------

/** Format number with underline dot for 6 and 9 to distinguish them. */
function formatDiceLabel(num: number | string): string {
  const s = String(num);
  if (s === '6' || s === '9') return s + '.';
  return s;
}

// ---------------------------------------------------------------------------
// Build visual geometry from shared dice-geometry-data
// ---------------------------------------------------------------------------

/**
 * Builds a non-indexed BufferGeometry from shared geometry data.
 * Also computes per-logical-face centers + normals for label placement.
 * For polygon faces (D12), triangulates and groups by polygon.
 *
 * @param scale - circumradius scale factor (e.g. 0.6 = DICE_SCALE)
 */
function buildGeometryFromData(
  data: DiceGeometryData,
  scale: number,
): {
  geometry: THREE.BufferGeometry;
  faceCenters: THREE.Vector3[];
  faceNormals: THREE.Vector3[];
} {
  const verts = data.vertices.map(
    ([x, y, z]) => new THREE.Vector3(x * scale, y * scale, z * scale),
  );

  const positions: number[] = [];
  const faceCenters: THREE.Vector3[] = [];
  const faceNormals: THREE.Vector3[] = [];

  for (const face of data.faces) {
    // Compute face center
    const center = new THREE.Vector3();
    for (const idx of face) center.add(verts[idx]);
    center.divideScalar(face.length);

    // Compute face normal from first 3 vertices
    const e1 = new THREE.Vector3().subVectors(verts[face[1]], verts[face[0]]);
    const e2 = new THREE.Vector3().subVectors(verts[face[2]], verts[face[0]]);
    const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (normal.dot(center) < 0) normal.negate();

    faceCenters.push(center);
    faceNormals.push(normal);

    // Triangulate face (fan from vertex 0)
    for (let i = 1; i < face.length - 1; i++) {
      const a = verts[face[0]];
      const b = verts[face[i]];
      const c = verts[face[i + 1]];

      // Ensure outward winding
      const te1 = new THREE.Vector3().subVectors(b, a);
      const te2 = new THREE.Vector3().subVectors(c, a);
      const tn = new THREE.Vector3().crossVectors(te1, te2);
      if (tn.dot(center) < 0) {
        positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
      } else {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return { geometry: geo, faceCenters, faceNormals };
}

// ---------------------------------------------------------------------------
// Shared prop interface
// ---------------------------------------------------------------------------

/** Highlight color for the result face label. */
const HIGHLIGHT_COLOR = '#ffd700'; // gold
/** Outline color for highlighted labels (dark gold for contrast). */
const HIGHLIGHT_OUTLINE = '#b8860b';

export interface DiceGeometryProps {
  color: string;
  /** Position used for static placement (overridden during playback). */
  position: [number, number, number];
  /** Quaternion used for static placement (overridden during playback). */
  rotation: [number, number, number, number]; // quaternion xyzw
  /** Dice ID for looking up physics frames. */
  diceId: string;
  /** Playback store ref. Null = static mode (no animation). */
  playbackRef: React.RefObject<PhysicsPlaybackStore> | null;
  /** If set, the label matching this value is highlighted in gold. */
  resultValue?: number | null;
}

// ---------------------------------------------------------------------------
// Physics frame application — called from useFrame (imperative, no setState)
// ---------------------------------------------------------------------------

const BOUNCE_VELOCITY_THRESHOLD = 0.3;
const BOUNCE_VELOCITY_MAX = 3;

/**
 * Reads the playback store, interpolates the current frame, and writes
 * directly to the mesh's position + quaternion. Returns true when done.
 */
function applyPlaybackFrame(
  mesh: THREE.Object3D,
  store: PhysicsPlaybackStore,
  diceId: string,
): boolean {
  const { frames, fps } = store;
  if (!frames) return true;

  // Lazy-init startTime on first useFrame tick — this ensures the timer
  // only starts once the Dice components are actually mounted in the Canvas.
  if (store.startTime === 0) {
    store.startTime = performance.now();
  }

  const totalSteps = frames.length;
  const elapsed = performance.now() - store.startTime;
  const frameDuration = 1000 / fps;
  const rawStep = elapsed / frameDuration;

  // Animation complete — snap to last frame
  if (rawStep >= totalSteps - 1) {
    const lastStep = frames[totalSteps - 1];
    const frame = lastStep.find((f) => f.diceId === diceId);
    if (frame) {
      mesh.position.set(frame.position.x, frame.position.y, frame.position.z);
      mesh.quaternion.set(
        frame.rotation.x,
        frame.rotation.y,
        frame.rotation.z,
        frame.rotation.w,
      );
    }
    return true;
  }

  const stepIndex = Math.floor(rawStep);
  const t = rawStep - stepIndex;

  const frameA = frames[stepIndex]?.find((f) => f.diceId === diceId);
  const frameB = frames[stepIndex + 1]?.find((f) => f.diceId === diceId);

  if (frameA && frameB) {
    // Interpolate position
    _posA.set(frameA.position.x, frameA.position.y, frameA.position.z);
    _posB.set(frameB.position.x, frameB.position.y, frameB.position.z);
    mesh.position.lerpVectors(_posA, _posB, t);

    // Interpolate quaternion
    _quatA.set(
      frameA.rotation.x,
      frameA.rotation.y,
      frameA.rotation.z,
      frameA.rotation.w,
    );
    _quatB.set(
      frameB.rotation.x,
      frameB.rotation.y,
      frameB.rotation.z,
      frameB.rotation.w,
    );
    mesh.quaternion.slerpQuaternions(_quatA, _quatB, t);
  } else if (frameA) {
    mesh.position.set(frameA.position.x, frameA.position.y, frameA.position.z);
    mesh.quaternion.set(
      frameA.rotation.x,
      frameA.rotation.y,
      frameA.rotation.z,
      frameA.rotation.w,
    );
  }

  // Bounce detection
  if (store.onBounce && stepIndex > 0) {
    const lastStep = store.lastBounceStep.get(diceId) ?? -1;
    if (stepIndex !== lastStep) {
      store.lastBounceStep.set(diceId, stepIndex);
      const prevFrame = frames[stepIndex - 1]?.find(
        (f) => f.diceId === diceId,
      );
      const nextFrame = frames[stepIndex + 1]?.find(
        (f) => f.diceId === diceId,
      );
      if (prevFrame && frameA && nextFrame) {
        const dx =
          nextFrame.position.x -
          frameA.position.x -
          (frameA.position.x - prevFrame.position.x);
        const dy =
          nextFrame.position.y -
          frameA.position.y -
          (frameA.position.y - prevFrame.position.y);
        const dz =
          nextFrame.position.z -
          frameA.position.z -
          (frameA.position.z - prevFrame.position.z);
        const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (delta > BOUNCE_VELOCITY_THRESHOLD) {
          store.onBounce(Math.min(delta / BOUNCE_VELOCITY_MAX, 1));
        }
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Shared useFrame hook for all geometry components
// ---------------------------------------------------------------------------

function useDicePlayback(
  meshRef: React.RefObject<THREE.Mesh | null>,
  diceId: string,
  playbackRef: React.RefObject<PhysicsPlaybackStore> | null,
) {
  useFrame(() => {
    const mesh = meshRef.current;
    const store = playbackRef?.current;
    if (!mesh || !store || !store.isPlaying) return;

    const done = applyPlaybackFrame(mesh, store, diceId);

    if (done && !store.completed) {
      store.completed = true;
      store.isPlaying = false;
      Promise.resolve().then(() => store.onComplete?.());
    }
  });
}

// ---------------------------------------------------------------------------
// Dice configuration type & generic component
// ---------------------------------------------------------------------------

interface DiceConfig {
  getData: () => DiceGeometryData;
  scale: number;
  labels: (number | string)[];
  fontSize: number;
  outlineWidth: number;
  highlightOutlineWidth: number;
  groupKites?: boolean;
  isHighlighted?: (resultValue: number | null | undefined, label: number | string) => boolean;
  formatLabel?: (label: number | string) => string;
}

const defaultIsHighlighted = (resultValue: number | null | undefined, label: number | string) =>
  resultValue === label;

function GenericDiceGeometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
  config,
}: DiceGeometryProps & { config: DiceConfig }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const {
    getData, scale, labels, fontSize,
    outlineWidth, highlightOutlineWidth, groupKites,
  } = config;
  const isHighlighted = config.isHighlighted ?? defaultIsHighlighted;
  const formatLabelFn = config.formatLabel ?? formatDiceLabel;

  const { geometry, faceCenters, faceNormals } = useMemo(() => {
    const raw = buildGeometryFromData(getData(), scale);
    if (!groupKites) return raw;
    // Group pairs of triangle faces into kites (D10/D10X)
    const kiteCenters: THREE.Vector3[] = [];
    const kiteNormals: THREE.Vector3[] = [];
    for (let i = 0; i < raw.faceCenters.length; i += 2) {
      const c = new THREE.Vector3()
        .addVectors(raw.faceCenters[i], raw.faceCenters[i + 1])
        .multiplyScalar(0.5);
      kiteCenters.push(c);
      kiteNormals.push(raw.faceNormals[i].clone());
    }
    return { geometry: raw.geometry, faceCenters: kiteCenters, faceNormals: kiteNormals };
  }, [getData, scale, groupKites]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((label, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        const highlighted = isHighlighted(resultValue, label);
        return (
          <Text
            key={i}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={fontSize}
            color={highlighted ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={highlighted ? highlightOutlineWidth : outlineWidth}
            outlineColor={highlighted ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatLabelFn(label)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Dice configurations
// ---------------------------------------------------------------------------

const D4_CONFIG: DiceConfig = {
  getData: getD4Data,
  scale: 0.6,
  labels: [1, 2, 3, 4],
  fontSize: 0.28,
  outlineWidth: 0.015,
  highlightOutlineWidth: 0.025,
};

const D6_CONFIG: DiceConfig = {
  getData: getD6Data,
  scale: 0.4,
  labels: [1, 6, 2, 5, 3, 4],
  fontSize: 0.38,
  outlineWidth: 0.018,
  highlightOutlineWidth: 0.03,
};

const D8_CONFIG: DiceConfig = {
  getData: getD8Data,
  scale: 0.6,
  labels: [1, 2, 3, 4, 5, 6, 7, 8],
  fontSize: 0.24,
  outlineWidth: 0.012,
  highlightOutlineWidth: 0.02,
};

const D10_CONFIG: DiceConfig = {
  getData: getD10Data,
  scale: 0.6,
  labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
  fontSize: 0.2,
  outlineWidth: 0.01,
  highlightOutlineWidth: 0.018,
  groupKites: true,
  isHighlighted: (rv, label) => rv != null && typeof label === 'number' && rv % 10 === label,
};

const D10X_CONFIG: DiceConfig = {
  getData: getD10Data,
  scale: 0.6,
  labels: [10, 20, 30, 40, 50, 60, 70, 80, 90, 0],
  fontSize: 0.16,
  outlineWidth: 0.008,
  highlightOutlineWidth: 0.015,
  groupKites: true,
  formatLabel: (label) => String(label).padStart(2, '0'),
};

const D12_CONFIG: DiceConfig = {
  getData: getD12Data,
  scale: 0.6,
  labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  fontSize: 0.18,
  outlineWidth: 0.008,
  highlightOutlineWidth: 0.015,
};

const D20_CONFIG: DiceConfig = {
  getData: getD20Data,
  scale: 0.6,
  labels: Array.from({ length: 20 }, (_, i) => i + 1),
  fontSize: 0.16,
  outlineWidth: 0.006,
  highlightOutlineWidth: 0.012,
};

// ---------------------------------------------------------------------------
// Exported dice components — thin wrappers around GenericDiceGeometry
// ---------------------------------------------------------------------------

export function D4Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D4_CONFIG} />;
}

export function D6Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D6_CONFIG} />;
}

export function D8Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D8_CONFIG} />;
}

export function D10Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D10_CONFIG} />;
}

export function D10XGeometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D10X_CONFIG} />;
}

export function D12Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D12_CONFIG} />;
}

export function D20Geometry(props: DiceGeometryProps) {
  return <GenericDiceGeometry {...props} config={D20_CONFIG} />;
}

// ---------------------------------------------------------------------------
// Export map for easy lookup by DiceType
// ---------------------------------------------------------------------------

export const DICE_GEOMETRY_MAP: Record<
  DiceType,
  React.ComponentType<DiceGeometryProps>
> = {
  D4: D4Geometry,
  D6: D6Geometry,
  D8: D8Geometry,
  D10: D10Geometry,
  D10X: D10XGeometry,
  D12: D12Geometry,
  D20: D20Geometry,
};
