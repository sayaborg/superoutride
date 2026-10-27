import type { MapGrid, RibbonSides } from './map-terrain.js';

/**
 * The course map's walls as the map draws them: each grid cell a wall crosses cut along the ribbons' sides into the
 * ground on either side, each part at its own side's heights, and the walls between them upright. A cell's two
 * triangles are the terrain's, (k, k + 1, k + nx) and (k + 1, k + nx + 1, k + nx); every piece lies in one of them and
 * names it, so the terrain's stripes and colors carry on across it.
 */

/** Metres: a cell with a wall this high on one of its edges is drawn cut. */
const DRAWN = 0.01;

/**
 * The cut cells' pieces, three vertices a triangle: each vertex's triangle (`2k` or `2k + 1` for the cell's first or
 * second), its weights on that triangle's corners, its height and whether it lies on a wall; and the cells cut, by
 * their first node, which the terrain leaves out.
 */
export interface WallMesh {
  readonly triangles: Int32Array;
  readonly weights: Float32Array;
  readonly heights: Float32Array;
  readonly walls: Uint8Array;
  readonly cut: Uint8Array;
}

// A point in a cell (x along the grid's x, z along its z, both 0 to 1) and its height.
interface Point {
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

/** The corners' places in a cell and its edges: their two corners (a then b, b the later node) and code offset. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;
const EDGES = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
] as const;

export function buildWallMesh(
  grid: Pick<MapGrid, 'nx' | 'nz'>,
  heights: Float32Array,
  sides: RibbonSides,
  jumps: Float32Array,
): WallMesh {
  const { nx, nz } = grid;
  const sideAt = new Map<number, number>();
  sides.codes.forEach((code, e) => sideAt.set(code, e));
  const cut = new Uint8Array(nx * nz);
  const triangles: number[] = [],
    weights: number[] = [],
    ys: number[] = [],
    walls: number[] = [];
  // A triangle of the cell at k, in its first (x + z ≤ 1) or second triangle.
  const emit = (k: number, points: readonly Point[], wall: boolean) => {
    const cx = (points[0]!.x + points[1]!.x + points[2]!.x) / 3,
      cz = (points[0]!.z + points[1]!.z + points[2]!.z) / 3;
    const second = cx + cz > 1;
    for (const { x, z, y } of points) {
      triangles.push(2 * k + (second ? 1 : 0));
      if (second) weights.push(1 - z, x + z - 1, 1 - x);
      else weights.push(1 - x - z, x, z);
      ys.push(y);
      walls.push(wall ? 1 : 0);
    }
  };
  for (const code of sides.codes) {
    // The cells beside a side with a wall: those whose edge it is.
    if (Math.abs(jumps[sideAt.get(code)!]!) < DRAWN) continue;
    const k = code >> 1;
    if (code & 1) {
      if (k % nx > 0) cut[k - 1] = 1;
      if (k % nx < nx - 1) cut[k] = 1;
    } else {
      if (k >= nx) cut[k - nx] = 1;
      if (k < nx * (nz - 1)) cut[k] = 1;
    }
  }
  for (let k = 0; k < cut.length; k++) {
    if (!cut[k]) continue;
    const node = [k, k + 1, k + nx, k + nx + 1];
    const H = node.map((n) => heights[n]!);
    const codes = [2 * k, 2 * k + 1, 2 * (k + 1) + 1, 2 * (k + nx)];
    // Each edge's side: where it crosses and its wall (from corner a to corner b).
    const crossing = codes.map((c) => {
      const e = sideAt.get(c);
      return e === undefined ? null : { f: sides.fraction[e]!, J: jumps[e]! };
    });
    // The corners' groups: joined by the edges no side crosses.
    const group = [0, 1, 2, 3];
    const find = (c: number): number => (group[c] === c ? c : (group[c] = find(group[c]!)));
    EDGES.forEach(([a, b], e) => {
      if (!crossing[e]) group[find(b)] = find(a);
    });
    // Each group's heights at the four corners: its own, the others carried across the walls (their mean).
    const frames = new Map<number, number[]>();
    for (let c = 0; c < 4; c++) {
      const root = find(c);
      if (frames.has(root)) continue;
      const shift: (number | null)[] = [0, 1, 2, 3].map((d) => (find(d) === root ? 0 : null));
      for (let grown = true; grown;) {
        grown = false;
        const reached = [0, 1, 2, 3].map((d) => {
          if (shift[d] !== null) return null;
          const ways: number[] = [];
          EDGES.forEach(([a, b], e) => {
            const other = a === d ? b : b === d ? a : -1;
            if (other < 0 || shift[other] === null) return;
            const J = crossing[e]?.J ?? 0;
            ways.push(shift[other]! + (d === b ? -J : J));
          });
          return ways.length ? ways.reduce((sum, way) => sum + way, 0) / ways.length : null;
        });
        reached.forEach((value, d) => {
          if (value === null) return;
          shift[d] = value;
          grown = true;
        });
      }
      frames.set(
        root,
        H.map((h, d) => h + shift[d]!),
      );
    }
    const frame = (c: number) => frames.get(find(c))!;
    // A point on edge e at fraction f, as corner c's side counts it.
    const onEdge = (e: number, c: number, f: number): Point => {
      const [a, b] = EDGES[e]!;
      const J = crossing[e]?.J ?? 0;
      const ya = c === a ? H[a]! : H[a]! + J,
        yb = c === a ? H[b]! - J : H[b]!;
      return {
        x: CORNERS[a]![0] + f * (CORNERS[b]![0] - CORNERS[a]![0]),
        z: CORNERS[a]![1] + f * (CORNERS[b]![1] - CORNERS[a]![1]),
        y: ya + f * (yb - ya),
      };
    };
    // A point in the cell as a group's heights count it.
    const inFrame = (values: number[], x: number, z: number): Point => {
      const y =
        x + z <= 1
          ? (1 - x - z) * values[0]! + x * values[1]! + z * values[2]!
          : (1 - z) * values[1]! + (x + z - 1) * values[3]! + (1 - x) * values[2]!;
      return { x, z, y };
    };
    const corner = (c: number): Point => ({ x: CORNERS[c]![0], z: CORNERS[c]![1], y: H[c]! });
    const crossed = [0, 1, 2, 3].filter((e) => crossing[e]);
    const groups = new Set([0, 1, 2, 3].map(find)).size;
    if (crossed.length === 2 && groups === 2) {
      // One side across the cell: the two parts, each cut by the cell's diagonal, and the wall between them.
      const boundary: { point: Point | null; corner: number; edge: number }[] = [];
      // Round the cell: corner 0, edge 0, corner 1, edge 2, corner 3, edge 3 (backwards), corner 2, edge 1 (backwards).
      for (const [c, e] of [
        [0, 0],
        [1, 2],
        [3, 3],
        [2, 1],
      ] as const) {
        boundary.push({ point: corner(c), corner: c, edge: -1 });
        if (crossing[e]) boundary.push({ point: null, corner: -1, edge: e });
      }
      const at = boundary.findIndex((entry) => entry.edge >= 0);
      const chain = [...boundary.slice(at), ...boundary.slice(0, at)];
      const second = chain.findIndex((entry, i) => i > 0 && entry.edge >= 0);
      const parts = [chain.slice(0, second + 1), [...chain.slice(second), chain[0]!]];
      for (const part of parts) {
        const member = part.find((entry) => entry.corner >= 0)!.corner;
        const polygon = part.map((entry) =>
          entry.point
            ? entry.point
            : onEdge(
                entry.edge,
                find(EDGES[entry.edge]![0]) === find(member) ? EDGES[entry.edge]![0] : EDGES[entry.edge]![1],
                crossing[entry.edge]!.f,
              ),
        );
        for (const piece of splitByDiagonal(polygon, frame(member)))
          for (let i = 1; i + 1 < piece.length; i++) emit(k, [piece[0]!, piece[i]!, piece[i + 1]!], false);
      }
      // The wall, upright between the two parts' heights along the side.
      const [e1, e2] = crossed as [number, number];
      const both = (e: number) => EDGES[e]!.map((c) => onEdge(e, c, crossing[e]!.f)) as [Point, Point];
      const [a1, b1] = both(e1),
        [a2, b2] = both(e2);
      // Each end's two heights, the first on corner a's side of the first edge.
      const sameA = find(EDGES[e1]![0]) === find(EDGES[e2]![0]);
      const near = [a1, b1],
        far = sameA ? [a2, b2] : [b2, a2];
      const crossesAt = diagonalPoint(a1, a2);
      const runs: [Point[], Point[]][] = crossesAt === null ? [[near, far]] : [];
      if (crossesAt !== null) {
        const frameA = frame(EDGES[e1]![0]),
          frameB = frame(EDGES[e1]![1]);
        const middle = [inFrame(frameA, crossesAt.x, crossesAt.z), inFrame(frameB, crossesAt.x, crossesAt.z)];
        runs.push([near, middle], [middle, far]);
      }
      for (const [from, to] of runs) {
        emit(k, [from[0]!, to[0]!, to[1]!], true);
        emit(k, [from[0]!, to[1]!, from[1]!], true);
      }
      continue;
    }
    // Otherwise each corner's quarter around the cell's centre, a wall between quarters a side parts.
    const centre = (c: number) => inFrame(frame(c), 0.5, 0.5);
    const edgePoint = (e: number, c: number) => (crossing[e] ? onEdge(e, c, crossing[e]!.f) : onEdge(e, c, 0.5));
    for (let c = 0; c < 4; c++) {
      const edges = [0, 1, 2, 3].filter((e) => EDGES[e]!.includes(c as never));
      for (const e of edges) emit(k, [corner(c), edgePoint(e, c), centre(c)], false);
    }
    for (const e of crossed) {
      const [a, b] = EDGES[e]!;
      const pa = edgePoint(e, a),
        pb = edgePoint(e, b),
        qa = centre(a),
        qb = centre(b);
      emit(k, [pa, qa, qb], true);
      emit(k, [pa, qb, pb], true);
    }
  }
  return {
    triangles: Int32Array.from(triangles),
    weights: Float32Array.from(weights),
    heights: Float32Array.from(ys),
    walls: Uint8Array.from(walls),
    cut,
  };
}

/** Where the segment from `p` to `q` crosses the cell's diagonal (`x + z = 1`) between them, or null. */
function diagonalPoint(p: Point, q: Point): { x: number; z: number } | null {
  const sp = p.x + p.z - 1,
    sq = q.x + q.z - 1;
  if (sp * sq >= 0) return null;
  const t = sp / (sp - sq);
  return { x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) };
}

/**
 * A convex polygon cut by the cell's diagonal into its parts in the first and second triangles, a point on the diagonal
 * at the height `values` (the corners' heights it counts) give there.
 */
function splitByDiagonal(polygon: readonly Point[], values: number[]): Point[][] {
  const parts: Point[][] = [[], []];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!,
      q = polygon[(i + 1) % polygon.length]!;
    const side = p.x + p.z - 1;
    if (side <= 0) parts[0]!.push(p);
    if (side >= 0) parts[1]!.push(p);
    const at = diagonalPoint(p, q);
    if (at) {
      const point = { ...at, y: at.x * values[1]! + (1 - at.x) * values[2]! };
      parts[0]!.push(point);
      parts[1]!.push(point);
    }
  }
  return parts.filter((part) => part.length >= 3);
}
