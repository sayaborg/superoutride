import { sectionStations, type CourseLayout } from './viewer-layout.js';
import { stationFrame, type StationFrame } from './viewer-surfaces.js';
import type { MapGrid, RibbonSides } from './map-terrain.js';

/**
 * The course map's grid and the ribbons on it: each placed Section's road and ground out to its course limits, at its
 * profile's height Y(s), level across.
 */

/**
 * One ribbon as a strip of cross sections, six numbers each: its left edge's x and z, its right edge's x and z (relative
 * to the layout's origin), its height and its station.
 */
export type MapRibbon = Float64Array;
export const RIBBON_STRIDE = 6;

/** Every placed Section's ribbon, cut where the viewer cuts its surfaces. */
export function mapRibbons(layout: CourseLayout): MapRibbon[] {
  const frame: StationFrame = { x: 0, z: 0, nx: 0, nz: 0, y: 0 };
  const edges = { left: 0, right: 0 };
  return layout.sections.map((placed) => {
    const length = placed.section.coordinates.domain.end;
    let reach = 0;
    for (const s of placed.limits.stations) {
      placed.limits.at(s, edges);
      reach = Math.max(reach, -edges.left, edges.right);
    }
    const stations = sectionStations(placed.section, 0, length, reach, placed.limits.stations);
    const ribbon = new Float64Array(stations.length * RIBBON_STRIDE);
    stations.forEach((s, i) => {
      stationFrame(layout, placed, s, frame);
      placed.limits.at(s, edges);
      ribbon.set(
        [
          frame.x + edges.left * frame.nx,
          frame.z + edges.left * frame.nz,
          frame.x + edges.right * frame.nx,
          frame.z + edges.right * frame.nz,
          frame.y,
          s,
        ],
        i * RIBBON_STRIDE,
      );
    });
    return ribbon;
  });
}

/** The most nodes a map's grid holds; a finer spacing asked for is coarsened to it. */
export const MAXIMUM_MAP_NODES = 4_000_000;

/**
 * The grid over the ribbons' rectangle seen from above and `margin` metres around it, at `spacing` or, where that
 * would hold more than `MAXIMUM_MAP_NODES`, at the finest quarter metre that does not.
 */
export function chooseMapGrid(ribbons: readonly MapRibbon[], spacing: number, margin: number): MapGrid {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const ribbon of ribbons)
    for (let k = 0; k < ribbon.length; k += RIBBON_STRIDE)
      for (const e of [0, 2]) {
        minX = Math.min(minX, ribbon[k + e]!);
        maxX = Math.max(maxX, ribbon[k + e]!);
        minZ = Math.min(minZ, ribbon[k + e + 1]!);
        maxZ = Math.max(maxZ, ribbon[k + e + 1]!);
      }
  const width = maxX - minX + 2 * margin,
    depth = maxZ - minZ + 2 * margin;
  const nodes = (h: number) => (Math.ceil(width / h) + 1) * (Math.ceil(depth / h) + 1);
  let h = spacing;
  if (nodes(h) > MAXIMUM_MAP_NODES) {
    h = Math.ceil(spacing * Math.sqrt(nodes(spacing) / MAXIMUM_MAP_NODES) * 4) / 4;
    while (nodes(h) > MAXIMUM_MAP_NODES) h += 0.25;
  }
  const nx = Math.ceil(width / h) + 1,
    nz = Math.ceil(depth / h) + 1;
  return Object.freeze({
    x0: (minX + maxX) / 2 - ((nx - 1) * h) / 2,
    z0: (minZ + maxZ) / 2 - ((nz - 1) * h) / 2,
    spacing: h,
    nx,
    nz,
  });
}

/**
 * Visit every grid node within the triangle `a`, `b`, `c` (x, z pairs), edges included, with its barycentric weights.
 */
export function rasterizeTriangle(
  grid: MapGrid,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  visit: (k: number, wa: number, wb: number, wc: number) => void,
) {
  const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  if (area === 0) return;
  const h = grid.spacing;
  const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - grid.x0) / h)),
    i1 = Math.min(grid.nx - 1, Math.floor((Math.max(ax, bx, cx) - grid.x0) / h)),
    j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - grid.z0) / h)),
    j1 = Math.min(grid.nz - 1, Math.floor((Math.max(az, bz, cz) - grid.z0) / h));
  const tolerance = -1e-9;
  for (let j = j0; j <= j1; j++) {
    const z = grid.z0 + j * h;
    for (let i = i0; i <= i1; i++) {
      const x = grid.x0 + i * h;
      const wa = ((bx - x) * (cz - z) - (bz - z) * (cx - x)) / area,
        wb = ((cx - x) * (az - z) - (cz - z) * (ax - x)) / area,
        wc = 1 - wa - wb;
      if (wa >= tolerance && wb >= tolerance && wc >= tolerance) visit(j * grid.nx + i, wa, wb, wc);
    }
  }
}

/**
 * Visit every grid node a ribbon covers, with its height and station there, how far across it lies (0 on its left edge,
 * 1 on its right) and the direction of increasing s (a unit x, z).
 */
export function rasterizeRibbon(
  grid: MapGrid,
  ribbon: MapRibbon,
  visit: (k: number, y: number, s: number, across: number, tx: number, tz: number) => void,
) {
  for (let a = 0; a + RIBBON_STRIDE < ribbon.length; a += RIBBON_STRIDE) {
    const b = a + RIBBON_STRIDE;
    const ya = ribbon[a + 4]!,
      yb = ribbon[b + 4]!,
      sa = ribbon[a + 5]!,
      sb = ribbon[b + 5]!;
    // Along the piece: from the middle of one cross section to the middle of the next.
    const dx = (ribbon[b]! + ribbon[b + 2]! - ribbon[a]! - ribbon[a + 2]!) / 2,
      dz = (ribbon[b + 1]! + ribbon[b + 3]! - ribbon[a + 1]! - ribbon[a + 3]!) / 2;
    const length = Math.hypot(dx, dz) || 1;
    const tx = dx / length,
      tz = dz / length;
    // The quad between two cross sections, as two triangles: (left a, right a, left b) and (right a, right b, left b).
    rasterizeTriangle(
      grid,
      ribbon[a]!,
      ribbon[a + 1]!,
      ribbon[a + 2]!,
      ribbon[a + 3]!,
      ribbon[b]!,
      ribbon[b + 1]!,
      (k, u, v, w) => visit(k, (u + v) * ya + w * yb, (u + v) * sa + w * sb, v, tx, tz),
    );
    rasterizeTriangle(
      grid,
      ribbon[a + 2]!,
      ribbon[a + 3]!,
      ribbon[b + 2]!,
      ribbon[b + 3]!,
      ribbon[b]!,
      ribbon[b + 1]!,
      (k, u, v, w) => visit(k, u * ya + (v + w) * yb, u * sa + (v + w) * sb, u + v, tx, tz),
    );
  }
}

/** The ribbons on the grid: each node's lowest and highest covering height and how many ribbons cover it. */
export function rasterizeRibbons(grid: MapGrid, ribbons: readonly MapRibbon[]) {
  const n = grid.nx * grid.nz;
  const low = new Float32Array(n).fill(Infinity),
    high = new Float32Array(n).fill(-Infinity),
    count = new Uint8Array(n),
    last = new Int32Array(n).fill(-1);
  ribbons.forEach((ribbon, r) =>
    rasterizeRibbon(grid, ribbon, (k, y) => {
      if (y < low[k]!) low[k] = y;
      if (y > high[k]!) high[k] = y;
      if (last[k] !== r) {
        last[k] = r;
        count[k] = Math.min(255, count[k]! + 1);
      }
    }),
  );
  return { low, high, count };
}

/** Metres: a ribbon's side where another ribbon carries on within this height of it is no side for a wall. */
const CONTINUATION = 1;

/**
 * The ribbons' sides on the grid, as the terrain's walls stand on them (`RibbonSides`): every grid edge between a node a
 * ribbon covers and one it does not that its left or right edge crosses, unless another ribbon covering the second
 * carries the road on there (within `CONTINUATION` of its height), as at a seam or a fork. A side's length is shared
 * among the edges it crosses, `spacing / (|n_x| + |n_z|)` each for its normal n; an edge two sides cross keeps the first.
 */
export function ribbonSides(grid: MapGrid, ribbons: readonly MapRibbon[]): RibbonSides {
  const { x0, z0, spacing: h, nx, nz } = grid;
  const n = nx * nz;
  // Every ribbon's heights at each node it covers.
  const first = new Float32Array(n).fill(NaN);
  const more = new Map<number, number[]>();
  ribbons.forEach((ribbon) =>
    rasterizeRibbon(grid, ribbon, (k, y) => {
      if (Number.isNaN(first[k]!)) first[k] = y;
      else more.set(k, [...(more.get(k) ?? []), y]);
    }),
  );
  const carried = (k: number, y: number) =>
    Math.abs(first[k]! - y) <= CONTINUATION || !!more.get(k)?.some((other) => Math.abs(other - y) <= CONTINUATION);
  const own = new Int32Array(n).fill(-1),
    ownHeight = new Float32Array(n);
  const found = new Map<number, { fraction: number; length: number }>();
  ribbons.forEach((ribbon, r) => {
    rasterizeRibbon(grid, ribbon, (k, y) => {
      own[k] = r;
      ownHeight[k] = y;
    });
    const cross = (code: number, fraction: number, length: number) => {
      const a = code >> 1,
        b = a + (code & 1 ? nx : 1);
      const inside = own[a] === r ? a : b,
        outside = inside === a ? b : a;
      if (own[inside] !== r || own[outside] === r || found.has(code)) return;
      if (!Number.isNaN(first[outside]!) && carried(outside, ownHeight[inside]!)) return;
      found.set(code, { fraction, length });
    };
    for (const e of [0, 2])
      for (let a = 0; a + RIBBON_STRIDE < ribbon.length; a += RIBBON_STRIDE) {
        const b = a + RIBBON_STRIDE;
        const ax = (ribbon[a + e]! - x0) / h,
          az = (ribbon[a + e + 1]! - z0) / h,
          bx = (ribbon[b + e]! - x0) / h,
          bz = (ribbon[b + e + 1]! - z0) / h;
        const dx = bx - ax,
          dz = bz - az;
        const run = Math.abs(dx) + Math.abs(dz);
        if (!run) continue;
        const length = (h * Math.hypot(dx, dz)) / run;
        // The grid's columns it crosses: edges from k to k + nx.
        for (let i = Math.ceil(Math.min(ax, bx)); i <= Math.floor(Math.max(ax, bx)) && dx; i++) {
          const t = (i - ax) / dx;
          if (t < 0 || t >= 1 || i < 0 || i >= nx) continue;
          const z = az + t * dz,
            j = Math.floor(z);
          if (j >= 0 && j + 1 < nz) cross(2 * (j * nx + i) + 1, z - j, length);
        }
        // Its rows: edges from k to k + 1.
        for (let j = Math.ceil(Math.min(az, bz)); j <= Math.floor(Math.max(az, bz)) && dz; j++) {
          const t = (j - az) / dz;
          if (t < 0 || t >= 1 || j < 0 || j >= nz) continue;
          const x = ax + t * dx,
            i = Math.floor(x);
          if (i >= 0 && i + 1 < nx) cross(2 * (j * nx + i), x - i, length);
        }
      }
  });
  const codes = Int32Array.from(found.keys()).sort();
  return {
    codes,
    fraction: Float32Array.from(codes, (code) => found.get(code)!.fraction),
    length: Float32Array.from(codes, (code) => found.get(code)!.length),
  };
}
