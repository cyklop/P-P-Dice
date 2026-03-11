/**
 * Shared dice geometry definitions — pure number arrays.
 * Used by BOTH physics (cannon-es) and visual (Three.js) to guarantee
 * matching face indices and consistent face-value mapping.
 */

type Vec3 = [number, number, number];

export interface DiceGeometryData {
  /** Vertex coordinates (un-scaled, circumradius = 1) */
  vertices: Vec3[];
  /** Face vertex indices. Triangles or polygons depending on type. */
  faces: number[][];
}

// ── D4: Tetrahedron ─────────────────────────────────────────────────────────

const INV_SQRT3 = 1 / Math.sqrt(3);

export function getD4Data(): DiceGeometryData {
  return {
    vertices: [
      [INV_SQRT3, INV_SQRT3, INV_SQRT3],
      [-INV_SQRT3, -INV_SQRT3, INV_SQRT3],
      [-INV_SQRT3, INV_SQRT3, -INV_SQRT3],
      [INV_SQRT3, -INV_SQRT3, -INV_SQRT3],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
  };
}

// ── D6: Cube ───────────────────────────────────────────────────────────────

export function getD6Data(): DiceGeometryData {
  // Unit cube (±1), will be scaled by 0.4 to match physics half-extent
  return {
    vertices: [
      [-1, -1, -1], // 0
      [ 1, -1, -1], // 1
      [ 1,  1, -1], // 2
      [-1,  1, -1], // 3
      [-1, -1,  1], // 4
      [ 1, -1,  1], // 5
      [ 1,  1,  1], // 6
      [-1,  1,  1], // 7
    ],
    // Face order matches D6_LABELS: [1(+X), 6(-X), 2(+Y), 5(-Y), 3(+Z), 4(-Z)]
    faces: [
      [1, 2, 6, 5], // +X → value 1
      [3, 0, 4, 7], // -X → value 6
      [2, 3, 7, 6], // +Y → value 2
      [0, 1, 5, 4], // -Y → value 5
      [4, 5, 6, 7], // +Z → value 3
      [0, 3, 2, 1], // -Z → value 4
    ],
  };
}

// ── D8: Octahedron ──────────────────────────────────────────────────────────

export function getD8Data(): DiceGeometryData {
  return {
    vertices: [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [0, 0, -1],
      [0, -1, 0],
    ],
    faces: [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 1],
      [5, 2, 1],
      [5, 3, 2],
      [5, 4, 3],
      [5, 1, 4],
    ],
  };
}

// ── D10: Pentagonal trapezohedron ───────────────────────────────────────────

export function getD10Data(): DiceGeometryData {
  const angleStep = (Math.PI * 2) / 10;
  const h = 0.105;
  const apexH = 1.0;
  const vStretch = 1.2;

  const vertices: Vec3[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = i * angleStep;
    vertices.push([
      Math.cos(angle),
      h * (i % 2 === 0 ? -1 : 1) * vStretch,
      Math.sin(angle),
    ]);
  }
  vertices.push([0, -apexH * vStretch, 0]); // [10] bottom
  vertices.push([0, apexH * vStretch, 0]);  // [11] top

  // Triangulated: 5 top kites + 5 bottom kites = 20 triangles
  const faces: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const upper_a = 2 * i + 1;
    const lower = (2 * i + 2) % 10;
    const upper_b = (2 * i + 3) % 10;
    faces.push([11, upper_a, lower]);
    faces.push([11, lower, upper_b]);
  }
  for (let i = 0; i < 5; i++) {
    const lower_a = 2 * i;
    const upper = 2 * i + 1;
    const lower_b = (2 * i + 2) % 10;
    faces.push([10, lower_b, upper]);
    faces.push([10, upper, lower_a]);
  }

  return { vertices, faces };
}

// ── D12: Dodecahedron ───────────────────────────────────────────────────────

export function getD12Data(): DiceGeometryData {
  const phi = (1 + Math.sqrt(5)) / 2;
  const invPhi = 1 / phi;
  // Normalize to circumradius = 1 (raw circumradius = sqrt(3))
  const n = 1 / Math.sqrt(3);

  const vertices: Vec3[] = [
    [1 * n, 1 * n, 1 * n],
    [1 * n, 1 * n, -1 * n],
    [1 * n, -1 * n, 1 * n],
    [1 * n, -1 * n, -1 * n],
    [-1 * n, 1 * n, 1 * n],
    [-1 * n, 1 * n, -1 * n],
    [-1 * n, -1 * n, 1 * n],
    [-1 * n, -1 * n, -1 * n],
    [0, phi * n, invPhi * n],
    [0, phi * n, -invPhi * n],
    [0, -phi * n, invPhi * n],
    [0, -phi * n, -invPhi * n],
    [invPhi * n, 0, phi * n],
    [-invPhi * n, 0, phi * n],
    [invPhi * n, 0, -phi * n],
    [-invPhi * n, 0, -phi * n],
    [phi * n, invPhi * n, 0],
    [phi * n, -invPhi * n, 0],
    [-phi * n, invPhi * n, 0],
    [-phi * n, -invPhi * n, 0],
  ];

  const faces = [
    [0, 8, 4, 13, 12],
    [0, 12, 2, 17, 16],
    [0, 16, 1, 9, 8],
    [1, 16, 17, 3, 14],
    [1, 14, 15, 5, 9],
    [2, 12, 13, 6, 10],
    [2, 10, 11, 3, 17],
    [3, 11, 7, 15, 14],
    [4, 8, 9, 5, 18],
    [4, 18, 19, 6, 13],
    [5, 15, 7, 19, 18],
    [6, 19, 7, 11, 10],
  ];

  return { vertices, faces };
}

// ── D20: Icosahedron ────────────────────────────────────────────────────────

export function getD20Data(): DiceGeometryData {
  const phi = (1 + Math.sqrt(5)) / 2;
  const norm = Math.sqrt(1 + phi * phi);

  const vertices: Vec3[] = [
    [0, 1 / norm, phi / norm],
    [0, -1 / norm, phi / norm],
    [0, 1 / norm, -phi / norm],
    [0, -1 / norm, -phi / norm],
    [1 / norm, phi / norm, 0],
    [-1 / norm, phi / norm, 0],
    [1 / norm, -phi / norm, 0],
    [-1 / norm, -phi / norm, 0],
    [phi / norm, 0, 1 / norm],
    [-phi / norm, 0, 1 / norm],
    [phi / norm, 0, -1 / norm],
    [-phi / norm, 0, -1 / norm],
  ];

  const faces = [
    [0, 8, 1],
    [0, 4, 8],
    [0, 5, 4],
    [0, 9, 5],
    [0, 1, 9],
    [1, 8, 6],
    [1, 6, 7],
    [1, 7, 9],
    [2, 10, 3],
    [2, 4, 10],
    [2, 5, 4],
    [2, 11, 5],
    [2, 3, 11],
    [3, 10, 6],
    [3, 6, 7],
    [3, 7, 11],
    [4, 8, 10],
    [6, 10, 8],
    [5, 11, 9],
    [7, 9, 11],
  ];

  return { vertices, faces };
}
