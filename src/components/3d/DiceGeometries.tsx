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

function createNumberTexture(
  num: number | string,
  fg: string = '#ffffff',
  bg: string = '#00000000',
  size: number = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = fg;
  ctx.font = `bold ${size * 0.55}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatDiceLabel(num), size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createFaceMaterials(
  numbers: (number | string)[],
  baseColor: string,
): THREE.MeshStandardMaterial[] {
  return numbers.map((n) => {
    const tex = createNumberTexture(n);
    return new THREE.MeshStandardMaterial({
      ...diceMaterial(baseColor),
      map: tex,
    });
  });
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
// D4 - Tetrahedron
// ---------------------------------------------------------------------------

export function D4Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  const { geometry, faceCenters, faceNormals } = useMemo(
    () => buildGeometryFromData(getD4Data(), 0.6),
    [],
  );

  const labels = [1, 2, 3, 4];

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <Text
            key={num}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.28}
            color={resultValue === num ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={resultValue === num ? 0.025 : 0.015}
            outlineColor={resultValue === num ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// D6 - Cube (built from shared geometry data, same pipeline as other dice)
// ---------------------------------------------------------------------------

// Face order matches getD6Data(): [+X(1), -X(6), +Y(2), -Y(5), +Z(3), -Z(4)]
const D6_LABELS = [1, 6, 2, 5, 3, 4];

export function D6Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  const { geometry, faceCenters, faceNormals } = useMemo(
    () => buildGeometryFromData(getD6Data(), 0.4),
    [],
  );

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {D6_LABELS.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <Text
            key={num}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.38}
            color={resultValue === num ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={resultValue === num ? 0.03 : 0.018}
            outlineColor={resultValue === num ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// D8 - Octahedron
// ---------------------------------------------------------------------------

export function D8Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  const { geometry, faceCenters, faceNormals } = useMemo(
    () => buildGeometryFromData(getD8Data(), 0.6),
    [],
  );

  const labels = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <Text
            key={num}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.24}
            color={resultValue === num ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={resultValue === num ? 0.02 : 0.012}
            outlineColor={resultValue === num ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// D10 - Pentagonal trapezohedron
// ---------------------------------------------------------------------------

export function D10Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // D10 has 20 triangle faces (2 per kite). Group every 2 triangles
  // into one logical kite for label placement.
  const { geometry, faceCenters, faceNormals } = useMemo(() => {
    const raw = buildGeometryFromData(getD10Data(), 0.6);
    // Group pairs of triangle faces into kites
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
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  // Standard D10: kite 0→"1", kite 1→"2", ..., kite 8→"9", kite 9→"0" (=10)
  // Physics: kite i → value (i+1), so kite 0=1, kite 9=10
  const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        // Highlight: resultValue matches label (0 on face = value 10)
        const isHighlighted = resultValue != null && resultValue % 10 === num;
        return (
          <Text
            key={i}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.2}
            color={isHighlighted ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={isHighlighted ? 0.018 : 0.01}
            outlineColor={isHighlighted ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// D10X - Percentile die (00, 10, 20, ..., 90) — same shape as D10
// ---------------------------------------------------------------------------

export function D10XGeometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry, faceCenters, faceNormals } = useMemo(() => {
    const raw = buildGeometryFromData(getD10Data(), 0.6);
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
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  // Labels: kite 0→"10", kite 1→"20", ..., kite 8→"90", kite 9→"00"
  // Result values from physics: 10, 20, ..., 90, 0
  const labels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 0];

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        const isHighlighted = resultValue === num;
        const label = String(num).padStart(2, '0'); // "00", "10", "20", etc.
        return (
          <Text
            key={i}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.16}
            color={isHighlighted ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={isHighlighted ? 0.015 : 0.008}
            outlineColor={isHighlighted ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {label}
          </Text>
        );
      })}
    </mesh>
  );
}

/**
 * Builds a proper pentagonal trapezohedron (D10 shape).
 * Non-indexed geometry with guaranteed outward-facing normals.
 * Returns geometry + pre-computed kite face centers + normals.
 */
function buildD10Geometry(): {
  geometry: THREE.BufferGeometry;
  faceCenters: THREE.Vector3[];
  faceNormals: THREE.Vector3[];
} {
  // Pentagonal trapezohedron — 10 kite faces, 12 vertices
  // Must match physics createPentagonalTrapezohedronGeometry exactly.
  const SCALE = 0.6;
  const angleStep = (Math.PI * 2) / 10;
  const h = 0.105;
  const apexH = 1.0;
  const vStretch = 1.2;

  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = i * angleStep;
    verts.push(new THREE.Vector3(
      SCALE * Math.cos(angle),
      SCALE * h * (i % 2 === 0 ? -1 : 1) * vStretch,
      SCALE * Math.sin(angle),
    ));
  }
  const botApex = new THREE.Vector3(0, -SCALE * apexH * vStretch, 0); // [10]
  const topApex = new THREE.Vector3(0, SCALE * apexH * vStretch, 0);  // [11]
  verts.push(botApex, topApex);

  const positions: number[] = [];
  // 10 kite face centers + normals (one per logical kite, used for labels)
  const faceCenters: THREE.Vector3[] = [];
  const faceNormals: THREE.Vector3[] = [];

  function addTriOutward(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    kiteCenter: THREE.Vector3,
  ) {
    const e1 = new THREE.Vector3().subVectors(b, a);
    const e2 = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(e1, e2);
    if (normal.dot(kiteCenter) < 0) {
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    } else {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }

  // 5 top kites (apex 11, connecting odd/upper ring vertices)
  for (let i = 0; i < 5; i++) {
    const upper_a = verts[2 * i + 1];
    const lower = verts[(2 * i + 2) % 10];
    const upper_b = verts[(2 * i + 3) % 10];
    const center = new THREE.Vector3()
      .add(topApex).add(upper_a).add(lower).add(upper_b)
      .divideScalar(4);

    addTriOutward(topApex, upper_a, lower, center);
    addTriOutward(topApex, lower, upper_b, center);

    faceCenters.push(center);
    const e1 = new THREE.Vector3().subVectors(upper_a, topApex);
    const e2 = new THREE.Vector3().subVectors(lower, topApex);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (n.dot(center) < 0) n.negate();
    faceNormals.push(n);
  }

  // 5 bottom kites (apex 10, connecting even/lower ring vertices)
  for (let i = 0; i < 5; i++) {
    const lower_a = verts[2 * i];
    const upper = verts[2 * i + 1];
    const lower_b = verts[(2 * i + 2) % 10];
    const center = new THREE.Vector3()
      .add(botApex).add(lower_a).add(upper).add(lower_b)
      .divideScalar(4);

    addTriOutward(botApex, lower_b, upper, center);
    addTriOutward(botApex, upper, lower_a, center);

    faceCenters.push(center);
    const e1 = new THREE.Vector3().subVectors(lower_b, botApex);
    const e2 = new THREE.Vector3().subVectors(upper, botApex);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (n.dot(center) < 0) n.negate();
    faceNormals.push(n);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return { geometry: geo, faceCenters, faceNormals };
}

// ---------------------------------------------------------------------------
// D12 - Dodecahedron
// ---------------------------------------------------------------------------

export function D12Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  const { geometry, faceCenters, faceNormals } = useMemo(
    () => buildGeometryFromData(getD12Data(), 0.6),
    [],
  );

  const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <Text
            key={num}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.18}
            color={resultValue === num ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={resultValue === num ? 0.015 : 0.008}
            outlineColor={resultValue === num ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// D20 - Icosahedron
// ---------------------------------------------------------------------------

export function D20Geometry({
  color,
  position,
  rotation,
  diceId,
  playbackRef,
  resultValue,
}: DiceGeometryProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (playbackRef?.current?.isPlaying) return;
    mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  });

  useDicePlayback(meshRef, diceId, playbackRef);

  const { geometry, faceCenters, faceNormals } = useMemo(
    () => buildGeometryFromData(getD20Data(), 0.6),
    [],
  );

  const labels = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <mesh ref={meshRef} position={position} castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial {...diceMaterial(color)} />
      {labels.map((num, i) => {
        const c = faceCenters[i];
        const n = faceNormals[i];
        if (!c || !n) return null;
        const offset = c.clone().add(n.clone().multiplyScalar(0.01));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const euler = new THREE.Euler().setFromQuaternion(quat);
        return (
          <Text
            key={num}
            position={[offset.x, offset.y, offset.z]}
            rotation={[euler.x, euler.y, euler.z]}
            fontSize={0.16}
            color={resultValue === num ? HIGHLIGHT_COLOR : '#ffffff'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={resultValue === num ? 0.012 : 0.006}
            outlineColor={resultValue === num ? HIGHLIGHT_OUTLINE : '#000000'}
            fontWeight="bold"
          >
            {formatDiceLabel(num)}
          </Text>
        );
      })}
    </mesh>
  );
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
