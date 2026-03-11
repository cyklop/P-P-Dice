import * as CANNON from 'cannon-es';
import type { PhysicsFrame, DiceType } from '@/lib/types';
import { DICE_SIDES } from '@/lib/constants';
import {
  getD4Data,
  getD8Data,
  getD10Data,
  getD12Data,
  getD20Data,
} from '@/lib/dice-geometry-data';

// Re-export for use by consumers
export { DICE_SIDES } from '@/lib/constants';

// ── Constants ────────────────────────────────────────────────────────────────

const TIMESTEP = 1 / 60;
const BASE_MAX_STEPS = 600; // 10 seconds of physics time
const EXTRA_STEPS_PER_DIE = 30; // Add more time for each additional die beyond 4
const VELOCITY_REST_THRESHOLD = 0.02;
const ANGULAR_REST_THRESHOLD = 0.02;
const REST_CHECK_GRACE_FRAMES = 90; // Wait at least 1.5 seconds before checking rest

// Tray dimensions (centered at origin)
const TRAY_WIDTH = 12; // x-axis
const TRAY_DEPTH = 9; // z-axis
const WALL_HEIGHT = 6;
const WALL_THICKNESS = 0.5;

// Dice physical properties
const DICE_MASS = 0.3;
const DICE_SCALE = 0.6; // Must match visual geometry radius (0.6)

// ── Winding helper ───────────────────────────────────────────────────────────

/**
 * Ensures all faces have outward-pointing normals (CCW winding).
 * Computes the centroid of the polyhedron, then for each face checks
 * if the normal points away from the centroid. If not, reverses the face.
 */
function ensureOutwardWinding(
  vertices: CANNON.Vec3[],
  faces: number[][],
): void {
  // Compute centroid
  const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
  const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
  const cz = vertices.reduce((s, v) => s + v.z, 0) / vertices.length;

  for (const face of faces) {
    // Compute face center
    let fx = 0, fy = 0, fz = 0;
    for (const idx of face) {
      fx += vertices[idx].x;
      fy += vertices[idx].y;
      fz += vertices[idx].z;
    }
    fx /= face.length;
    fy /= face.length;
    fz /= face.length;

    // Face normal from first two edges (cross product)
    const v0 = vertices[face[0]];
    const v1 = vertices[face[1]];
    const v2 = vertices[face[2]];
    const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
    const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Direction from centroid to face center
    const dx = fx - cx, dy = fy - cy, dz = fz - cz;

    // If normal points inward (dot product < 0), reverse face
    if (nx * dx + ny * dy + nz * dz < 0) {
      face.reverse();
    }
  }
}

// ── Geometry definitions (from shared dice-geometry-data) ────────────────────

function fromSharedData(
  data: { vertices: [number, number, number][]; faces: number[][] },
  scale: number,
): { vertices: CANNON.Vec3[]; faces: number[][] } {
  const vertices = data.vertices.map(
    ([x, y, z]) => new CANNON.Vec3(x * scale, y * scale, z * scale),
  );
  const faces = data.faces.map((f) => [...f]);
  ensureOutwardWinding(vertices, faces);
  return { vertices, faces };
}

// ── Shape creation ───────────────────────────────────────────────────────────

function createDiceShape(type: DiceType): CANNON.Shape {
  const s = DICE_SCALE;

  switch (type) {
    case 'D4':
      return new CANNON.ConvexPolyhedron(fromSharedData(getD4Data(), s));
    case 'D6':
      // Visual boxGeometry is 0.8 x 0.8 x 0.8 → half-extent 0.4
      return new CANNON.Box(new CANNON.Vec3(0.4, 0.4, 0.4));
    case 'D8':
      return new CANNON.ConvexPolyhedron(fromSharedData(getD8Data(), s));
    case 'D10':
    case 'D10X': // Same shape, different labels
      return new CANNON.ConvexPolyhedron(fromSharedData(getD10Data(), s));
    case 'D12':
      return new CANNON.ConvexPolyhedron(fromSharedData(getD12Data(), s));
    case 'D20':
      return new CANNON.ConvexPolyhedron(fromSharedData(getD20Data(), s));
  }
}

// ── Face value determination ─────────────────────────────────────────────────

// Face-to-value mappings for each dice type.
// Index = physics face index, Value = die face number.
// D4: The value is the face pointing DOWN (bottom face, traditional convention).
const D4_FACE_VALUES = [1, 2, 3, 4];
// D8: Value = top face (highest normal toward +Y)
const D8_FACE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8];
// D10: 20 triangular faces (2 triangles per kite), each pair shares a kite value (0-9).
// Top 10 triangles (faces 0-9): kite[i] = floor(i/2), values 0-4
// Bottom 10 triangles (faces 10-19): kite[i] = floor((i-10)/2), values 5-9
const D10_FACE_VALUES = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9];
// D12: 12 pentagonal faces
const D12_FACE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// D20: 20 triangular faces
const D20_FACE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/**
 * Computes the face normal in world space for a ConvexPolyhedron face.
 */
function getFaceWorldNormal(
  body: CANNON.Body,
  shape: CANNON.ConvexPolyhedron,
  faceIndex: number,
): CANNON.Vec3 {
  const face = shape.faces[faceIndex];
  const verts = shape.vertices;

  // Compute face normal from first 3 vertices
  const v0 = verts[face[0]];
  const v1 = verts[face[1]];
  const v2 = verts[face[2]];

  const e1 = new CANNON.Vec3();
  const e2 = new CANNON.Vec3();
  v1.vsub(v0, e1);
  v2.vsub(v0, e2);

  const localNormal = new CANNON.Vec3();
  e1.cross(e2, localNormal);
  localNormal.normalize();

  // Ensure outward pointing
  const center = new CANNON.Vec3();
  for (const idx of face) {
    center.vadd(verts[idx], center);
  }
  center.scale(1 / face.length, center);
  if (localNormal.dot(center) < 0) {
    localNormal.negate(localNormal);
  }

  // Transform to world space
  const worldNormal = new CANNON.Vec3();
  body.quaternion.vmult(localNormal, worldNormal);
  return worldNormal;
}

/**
 * Determines which face is pointing most upward after a die comes to rest.
 * For D4: returns the face pointing most DOWNWARD (traditional D4 convention).
 * For all others: returns the face pointing most UPWARD.
 */
function determineFaceValue(body: CANNON.Body, type: DiceType): number {
  const shape = body.shapes[0];

  if (shape instanceof CANNON.Box) {
    // D6: Check which axis is most aligned with world Y
    const up = new CANNON.Vec3(0, 1, 0);
    const localUp = body.quaternion.inverse().vmult(up);

    const ax = Math.abs(localUp.x);
    const ay = Math.abs(localUp.y);
    const az = Math.abs(localUp.z);

    if (ax > ay && ax > az) {
      return localUp.x > 0 ? 1 : 6;
    } else if (ay > ax && ay > az) {
      return localUp.y > 0 ? 2 : 5;
    } else {
      return localUp.z > 0 ? 3 : 4;
    }
  }

  if (!(shape instanceof CANNON.ConvexPolyhedron)) {
    return Math.floor(Math.random() * DICE_SIDES[type]) + 1;
  }

  // D10/D10X special case: 20 triangles form 10 kites. Average each pair's
  // normals to find the kite that's most upward — prevents picking an
  // adjacent kite's triangle that happens to have a slightly higher Y.
  if (type === 'D10' || type === 'D10X') {
    let bestKite = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < 10; k++) {
      const n0 = getFaceWorldNormal(body, shape, k * 2);
      const n1 = getFaceWorldNormal(body, shape, k * 2 + 1);
      const avgY = (n0.y + n1.y) / 2;
      if (avgY > bestDot) {
        bestDot = avgY;
        bestKite = k;
      }
    }
    if (type === 'D10X') {
      // Percentile die: kite 0→10, kite 1→20, ..., kite 8→90, kite 9→0 (="00")
      return ((bestKite + 1) * 10) % 100;
    }
    return bestKite + 1; // 0-indexed kite → 1-indexed value
  }

  // Find the face whose normal is most aligned with +Y (upward) or -Y (for D4)
  let bestFaceIndex = 0;
  let bestDot = -Infinity;

  for (let i = 0; i < shape.faces.length; i++) {
    const worldNormal = getFaceWorldNormal(body, shape, i);
    // D4: we want the face pointing DOWN (most negative Y)
    // Others: we want the face pointing UP (most positive Y)
    const dot = type === 'D4' ? -worldNormal.y : worldNormal.y;
    if (dot > bestDot) {
      bestDot = dot;
      bestFaceIndex = i;
    }
  }

  // Map face index to value
  let faceValues: number[];
  switch (type) {
    case 'D4': faceValues = D4_FACE_VALUES; break;
    case 'D8': faceValues = D8_FACE_VALUES; break;
    case 'D12': faceValues = D12_FACE_VALUES; break;
    case 'D20': faceValues = D20_FACE_VALUES; break;
    default: return Math.floor(Math.random() * DICE_SIDES[type]) + 1;
  }

  return faceValues[bestFaceIndex % faceValues.length];
}

// ── Tilt computation ─────────────────────────────────────────────────────────

/** Returns the tilt angle (degrees) — how far the best face normal deviates from Y axis. */
function computeTilt(body: CANNON.Body, type: DiceType): number {
  const shape = body.shapes[0];
  if (shape instanceof CANNON.Box) {
    const up = new CANNON.Vec3(0, 1, 0);
    const localUp = body.quaternion.inverse().vmult(up);
    const maxAxis = Math.max(Math.abs(localUp.x), Math.abs(localUp.y), Math.abs(localUp.z));
    return Math.acos(Math.min(maxAxis, 1)) * (180 / Math.PI);
  }
  if (shape instanceof CANNON.ConvexPolyhedron) {
    if (type === 'D10' || type === 'D10X') {
      let bestDot = -1;
      for (let k = 0; k < 10; k++) {
        const n0 = getFaceWorldNormal(body, shape, k * 2);
        const n1 = getFaceWorldNormal(body, shape, k * 2 + 1);
        const avgY = Math.abs((n0.y + n1.y) / 2);
        bestDot = Math.max(bestDot, avgY);
      }
      return Math.acos(Math.min(bestDot, 1)) * (180 / Math.PI);
    }
    let bestDot = -1;
    for (let i = 0; i < shape.faces.length; i++) {
      const wn = getFaceWorldNormal(body, shape, i);
      bestDot = Math.max(bestDot, Math.abs(wn.y));
    }
    return Math.acos(Math.min(bestDot, 1)) * (180 / Math.PI);
  }
  return 0;
}

// ── World setup ──────────────────────────────────────────────────────────────

function createPhysicsWorld(): {
  world: CANNON.World;
  diceMaterial: CANNON.Material;
} {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
    allowSleep: true,
  });
  (world.solver as CANNON.GSSolver).iterations = 10;
  (world.solver as CANNON.GSSolver).tolerance = 0.0001;

  // Materials
  const diceMaterial = new CANNON.Material({ friction: 0.6, restitution: 0.15 });
  const trayMaterial = new CANNON.Material({ friction: 0.8, restitution: 0.1 });

  const contactMat = new CANNON.ContactMaterial(diceMaterial, trayMaterial, {
    friction: 0.6,
    restitution: 0.15,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  });
  world.addContactMaterial(contactMat);

  const diceContactMat = new CANNON.ContactMaterial(
    diceMaterial,
    diceMaterial,
    {
      friction: 0.4,
      restitution: 0.2,
    },
  );
  world.addContactMaterial(diceContactMat);

  // Floor — thick box so dice can't tunnel through
  const floorThickness = 1;
  const floorBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    material: trayMaterial,
    shape: new CANNON.Box(
      new CANNON.Vec3(TRAY_WIDTH / 2 + 1, floorThickness / 2, TRAY_DEPTH / 2 + 1),
    ),
    position: new CANNON.Vec3(0, -floorThickness / 2, 0),
  });
  world.addBody(floorBody);

  // Walls — thick boxes
  const halfW = TRAY_WIDTH / 2;
  const halfD = TRAY_DEPTH / 2;
  const wt = WALL_THICKNESS; // wall thickness

  const wallDefs: { pos: CANNON.Vec3; halfExtents: CANNON.Vec3 }[] = [
    // +X wall (right)
    {
      pos: new CANNON.Vec3(halfW + wt / 2, WALL_HEIGHT / 2, 0),
      halfExtents: new CANNON.Vec3(wt / 2, WALL_HEIGHT / 2, halfD + wt),
    },
    // -X wall (left)
    {
      pos: new CANNON.Vec3(-halfW - wt / 2, WALL_HEIGHT / 2, 0),
      halfExtents: new CANNON.Vec3(wt / 2, WALL_HEIGHT / 2, halfD + wt),
    },
    // +Z wall (far)
    {
      pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, halfD + wt / 2),
      halfExtents: new CANNON.Vec3(halfW + wt, WALL_HEIGHT / 2, wt / 2),
    },
    // -Z wall (near)
    {
      pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, -halfD - wt / 2),
      halfExtents: new CANNON.Vec3(halfW + wt, WALL_HEIGHT / 2, wt / 2),
    },
  ];

  for (const wall of wallDefs) {
    const wallBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: trayMaterial,
      shape: new CANNON.Box(wall.halfExtents),
      position: wall.pos,
    });
    world.addBody(wallBody);
  }

  return { world, diceMaterial };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Existing resting dice to include as static obstacles in the simulation. */
export interface ExistingDie {
  id: string;
  type: DiceType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

export interface ThrowResult {
  frames: PhysicsFrame[][];
  results: { diceId: string; type: DiceType; value: number }[];
}

/**
 * Simulates a dice throw using cannon-es physics.
 * Returns an array of frame snapshots (one per timestep) and the final values.
 * @param existingDice - resting dice from other players, added as static obstacles
 */
export async function throwDice(
  dice: { type: DiceType; id: string }[],
  existingDice: ExistingDie[] = [],
): Promise<ThrowResult> {
  const { world, diceMaterial } = createPhysicsWorld();
  const bodies: { body: CANNON.Body; id: string; type: DiceType }[] = [];

  // Add existing resting dice as static bodies so new dice collide with them
  for (const existing of existingDice) {
    const shape = createDiceShape(existing.type);
    const staticBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: diceMaterial,
      shape,
      position: new CANNON.Vec3(existing.position.x, existing.position.y, existing.position.z),
    });
    staticBody.quaternion.set(
      existing.rotation.x,
      existing.rotation.y,
      existing.rotation.z,
      existing.rotation.w,
    );
    world.addBody(staticBody);
  }

  // Server-generated random throw parameters (prevents client manipulation)
  const force = 0.4 + Math.random() * 0.4; // 0.4-0.8
  const baseSpeed = 3 + force * 5; // 3-7 units/sec

  // Pick a random side to throw from, weighted by edge length
  // Long sides (x-axis, width=12) get ~40% each, short sides (z-axis, depth=9) get ~10% each
  const totalPerimeter = 2 * TRAY_WIDTH + 2 * TRAY_DEPTH; // 42
  const sidePick = Math.random() * totalPerimeter;
  let side: 'left' | 'right' | 'front' | 'back';
  if (sidePick < TRAY_WIDTH) {
    side = 'front'; // -z edge
  } else if (sidePick < TRAY_WIDTH + TRAY_DEPTH) {
    side = 'right'; // +x edge
  } else if (sidePick < 2 * TRAY_WIDTH + TRAY_DEPTH) {
    side = 'back'; // +z edge
  } else {
    side = 'left'; // -x edge
  }

  // Compute start position just outside the chosen wall, and throw direction toward center
  const OUTSIDE_OFFSET = 1.5; // How far outside the wall to start
  let baseX = 0;
  let baseZ = 0;
  let throwDirX = 0;
  let throwDirZ = 0;

  switch (side) {
    case 'left':
      baseX = -TRAY_WIDTH / 2 - OUTSIDE_OFFSET;
      baseZ = (Math.random() - 0.5) * (TRAY_DEPTH * 0.6);
      throwDirX = 1;
      throwDirZ = -baseZ * 0.15; // slight aim toward center z
      break;
    case 'right':
      baseX = TRAY_WIDTH / 2 + OUTSIDE_OFFSET;
      baseZ = (Math.random() - 0.5) * (TRAY_DEPTH * 0.6);
      throwDirX = -1;
      throwDirZ = -baseZ * 0.15;
      break;
    case 'front':
      baseZ = -TRAY_DEPTH / 2 - OUTSIDE_OFFSET;
      baseX = (Math.random() - 0.5) * (TRAY_WIDTH * 0.6);
      throwDirZ = 1;
      throwDirX = -baseX * 0.15;
      break;
    case 'back':
      baseZ = TRAY_DEPTH / 2 + OUTSIDE_OFFSET;
      baseX = (Math.random() - 0.5) * (TRAY_WIDTH * 0.6);
      throwDirZ = -1;
      throwDirX = -baseX * 0.15;
      break;
  }

  // Normalize throw direction
  const dirLen = Math.sqrt(throwDirX * throwDirX + throwDirZ * throwDirZ);
  const normDirX = throwDirX / dirLen;
  const normDirZ = throwDirZ / dirLen;

  // Determine available spread width based on throw side
  const maxSpreadWidth =
    side === 'left' || side === 'right'
      ? TRAY_DEPTH * 0.8 // throwing from short side
      : TRAY_WIDTH * 0.8; // throwing from long side

  // Arrange dice in rows if they don't fit in a single line
  const DICE_SPACING = 1.2;
  const maxPerRow = Math.max(1, Math.floor(maxSpreadWidth / DICE_SPACING));
  const numRows = Math.ceil(dice.length / maxPerRow);
  const ROW_DEPTH = 1.5; // spacing between rows (along throw direction)

  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    const shape = createDiceShape(die.type);

    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    const diceInThisRow = Math.min(maxPerRow, dice.length - row * maxPerRow);

    // Spread dice along the wall edge (perpendicular to throw direction)
    const spreadOffset = (col - (diceInThisRow - 1) / 2) * DICE_SPACING;
    const depthOffset = row * ROW_DEPTH; // stagger rows further from wall

    const perpX = -normDirZ; // perpendicular to throw direction
    const perpZ = normDirX;
    const startX = baseX + perpX * spreadOffset + normDirX * depthOffset + (Math.random() - 0.5) * 0.3;
    const startZ = baseZ + perpZ * spreadOffset + normDirZ * depthOffset + (Math.random() - 0.5) * 0.3;
    const startY = WALL_HEIGHT + 1 + Math.random() * 2 + row * 1.5; // stack rows higher

    const body = new CANNON.Body({
      mass: DICE_MASS,
      material: diceMaterial,
      shape,
      position: new CANNON.Vec3(startX, startY, startZ),
      allowSleep: false, // Disable sleep — we use our own rest detection + tilt check
      linearDamping: 0.3,
      angularDamping: 0.3,
    });

    // Throw toward center with arc
    body.velocity.set(
      normDirX * baseSpeed + (Math.random() - 0.5) * 1.5,
      -(1.0 + Math.random() * 1.0), // slight downward — already above wall
      normDirZ * baseSpeed + (Math.random() - 0.5) * 1.5,
    );

    // Apply random angular velocity — minimum ensures at least one full rotation
    const MIN_SPIN = 2 * Math.PI; // at least one full rotation
    const spinStrength = MIN_SPIN + 4 + force * 8;
    body.angularVelocity.set(
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
    );

    // Random initial rotation
    body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );

    world.addBody(body);
    bodies.push({ body, id: die.id, type: die.type });
  }

  // Run simulation — more dice need more time to settle
  const MAX_STEPS = BASE_MAX_STEPS + Math.max(0, dice.length - 4) * EXTRA_STEPS_PER_DIE;
  const frames: PhysicsFrame[][] = [];
  let step = 0;

  while (step < MAX_STEPS) {
    world.step(TIMESTEP);
    step++;

    // Boundary enforcement — rescue dice that escape the tray or land on walls
    const BOUNDARY_X = TRAY_WIDTH / 2 + 3;
    const BOUNDARY_Z = TRAY_DEPTH / 2 + 3;
    const BOUNDARY_Y_MIN = -2;
    // During initial flight (first 2 seconds) allow higher Y; after that, enforce tighter
    const BOUNDARY_Y_MAX = step < 120 ? WALL_HEIGHT + 10 : WALL_HEIGHT - 0.5;
    for (const { body } of bodies) {
      const p = body.position;
      const v = body.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      const isSettled = speed < 0.1 && step > 120;

      // Check if die is out of bounds OR resting on/above the wall
      const outOfBounds =
        p.y < BOUNDARY_Y_MIN ||
        p.y > BOUNDARY_Y_MAX ||
        Math.abs(p.x) > BOUNDARY_X ||
        Math.abs(p.z) > BOUNDARY_Z;

      // Die resting on wall: inside XZ but above wall height and slow
      const onWall = isSettled && p.y > WALL_HEIGHT - 1;

      if (outOfBounds || onWall) {
        // Reset to center of tray with small random offset, drop from above
        body.position.set(
          (Math.random() - 0.5) * 4,
          3 + Math.random() * 2,
          (Math.random() - 0.5) * 3,
        );
        body.velocity.set(0, -3, 0);
        body.angularVelocity.set(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
        );
      }
    }

    // Record frame
    const frame: PhysicsFrame[] = bodies.map(({ body, id }) => ({
      diceId: id,
      position: {
        x: body.position.x,
        y: body.position.y,
        z: body.position.z,
      },
      rotation: {
        x: body.quaternion.x,
        y: body.quaternion.y,
        z: body.quaternion.z,
        w: body.quaternion.w,
      },
    }));
    frames.push(frame);

    // Check if all dice are at rest (after grace period)
    if (step > REST_CHECK_GRACE_FRAMES) {
      const allAtRest = bodies.every(({ body }) => {
        const v = body.velocity;
        const av = body.angularVelocity;
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        const angSpeed = Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z);
        return (
          speed < VELOCITY_REST_THRESHOLD &&
          angSpeed < ANGULAR_REST_THRESHOLD
        );
      });

      if (allAtRest) {
        // Check if any die is on an edge — if so, nudge it and continue
        let anyOnEdge = false;
        for (const { body, type } of bodies) {
          const tilt = computeTilt(body, type);
          const threshold: Record<DiceType, number> = {
            D4: 8, D6: 5, D8: 8, D10: 10, D10X: 10, D12: 8, D20: 8,
          };
          if (tilt > threshold[type]) {
            // Apply small random nudge to tip it off the edge
            body.velocity.set(
              (Math.random() - 0.5) * 0.3,
              0.1,
              (Math.random() - 0.5) * 0.3,
            );
            body.angularVelocity.set(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
            );
            anyOnEdge = true;
          }
        }
        if (!anyOnEdge) break;
      }
    }
  }

  // ── Post-simulation validation: re-drop dice outside the tray ──────────
  const TRAY_HALF_W = TRAY_WIDTH / 2 - 0.3; // small margin inside walls
  const TRAY_HALF_D = TRAY_DEPTH / 2 - 0.3;
  const MAX_VALID_Y = 3; // dice shouldn't be above this (wall-top or stacked too high)
  const MAX_REDROP_ROUNDS = 5;
  const REDROP_STEPS = 300; // 5 seconds per round

  for (let round = 0; round < MAX_REDROP_ROUNDS; round++) {
    // Find dice that are outside the tray
    const badDice: typeof bodies = [];
    for (const entry of bodies) {
      const p = entry.body.position;
      const outsideX = Math.abs(p.x) > TRAY_HALF_W;
      const outsideZ = Math.abs(p.z) > TRAY_HALF_D;
      const tooHigh = p.y > MAX_VALID_Y;
      const tooLow = p.y < -0.5;
      if (outsideX || outsideZ || tooHigh || tooLow) {
        badDice.push(entry);
      }
    }

    if (badDice.length === 0) break;

    console.log(`[REDROP] Round ${round + 1}: ${badDice.length} dice outside tray, re-dropping...`);

    // Reset bad dice to center, drop from above
    for (const { body } of badDice) {
      body.position.set(
        (Math.random() - 0.5) * 4,
        3 + Math.random() * 2,
        (Math.random() - 0.5) * 3,
      );
      body.velocity.set(
        (Math.random() - 0.5) * 1,
        -3,
        (Math.random() - 0.5) * 1,
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
      );
    }

    // Run additional simulation steps until all re-dropped dice settle
    let extraStep = 0;
    while (extraStep < REDROP_STEPS) {
      world.step(TIMESTEP);
      extraStep++;
      step++;

      // Record frame
      const frame: PhysicsFrame[] = bodies.map(({ body, id }) => ({
        diceId: id,
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        rotation: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w },
      }));
      frames.push(frame);

      // Check if re-dropped dice are at rest
      if (extraStep > 60) {
        const allSettled = badDice.every(({ body }) => {
          const v = body.velocity;
          const av = body.angularVelocity;
          const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
          const angSpeed = Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z);
          return speed < VELOCITY_REST_THRESHOLD && angSpeed < ANGULAR_REST_THRESHOLD;
        });
        if (allSettled) break;
      }
    }
  }

  // Determine final face values with detailed logging
  const results = bodies.map(({ body, id, type }) => {
    const value = determineFaceValue(body, type);

    const v = body.velocity;
    const av = body.angularVelocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const angSpeed = Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z);

    const tiltDeg = computeTilt(body, type);

    // Per-type edge thresholds (degrees)
    const edgeThreshold: Record<DiceType, number> = {
      D4: 8, D6: 5, D8: 8, D10: 10, D10X: 10, D12: 8, D20: 8,
    };
    const isOnEdge = tiltDeg > edgeThreshold[type];
    const isStill = speed < VELOCITY_REST_THRESHOLD && angSpeed < ANGULAR_REST_THRESHOLD;

    console.log(
      `[DICE-RESULT] ${id} (${type}): value=${value}` +
      ` | pos=(${body.position.x.toFixed(2)}, ${body.position.y.toFixed(2)}, ${body.position.z.toFixed(2)})` +
      ` | vel=${speed.toFixed(3)} angVel=${angSpeed.toFixed(3)}` +
      ` | tilt=${tiltDeg.toFixed(1)}°` +
      ` | ${isStill ? 'REST' : 'MOVING'}${isOnEdge ? ' ⚠️ ON-EDGE' : ''}` +
      ` | steps=${step}`,
    );

    return { diceId: id, type, value };
  });

  return { frames, results };
}