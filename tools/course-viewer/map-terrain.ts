/**
 * The course map's terrain: the heights H at a grid's nodes and the walls J on the ribbons' sides that minimise
 *
 *   E(H, J) = Σ [(1 − t) |∇²H|² + t |∇H|²] + λ Σ_ribbon n (Y − H) + μ Σ_sides ℓ |J|,   H ≤ Y on every ribbon node,
 *
 * where ∇²H is the Hessian (the thin plate's bending, free at the grid's edges), Y the lowest covering ribbon's height,
 * n how many ribbons cover the node and each sum is over the grid's area; a term across a ribbon's side counts the
 * ground beyond it lowered by its wall J, so the ground there may stand J higher at the cost μ ℓ |J|. The problem is
 * convex.
 *
 * It is solved coarse to fine: at each spacing from the coarsest of `START_SPACING` or less down to the grid's own, the
 * primal–dual active set method holds the ribbon nodes the coarser solution held at Y and solves the rest by conjugate
 * gradients preconditioned by a Galerkin multigrid V-cycle, until the held set stops changing. The standing walls are
 * solved with the heights, and laid down or stood up as the held nodes are let go or held.
 */

/** A 5 × 5 stencil's offsets: index `(dz + 2) · 5 + (dx + 2)`; the centre is 12, and `24 − d` mirrors `d`. */
const STENCIL = 25;
const CENTRE = 12;
const STORED = 13;
const offsetX = (d: number) => (d % 5) - 2;
const offsetZ = (d: number) => ((d / 5) | 0) - 2;

/** A grid of `nx` by `nz` nodes `spacing` metres apart, its first at (`x0`, `z0`) relative to the layout's origin. */
export interface MapGrid {
  readonly x0: number;
  readonly z0: number;
  readonly spacing: number;
  readonly nx: number;
  readonly nz: number;
}

/** The nodes, the ribbons' heights over them and how many ribbons cover each. */
export interface TerrainProblem {
  readonly nx: number;
  readonly nz: number;
  /** Metres between neighbouring nodes. */
  readonly spacing: number;
  /** The lowest covering ribbon's height at each node (`k = j · nx + i`); meaningless where none covers it. */
  readonly low: Float32Array;
  /** How many ribbons cover each node. */
  readonly count: Uint8Array;
  /** The grid edges the ribbons' sides cross, where walls may stand. */
  readonly sides: RibbonSides;
}

/**
 * The grid edges the ribbons' sides cross: `2k` for the edge from node k to k + 1 and `2k + 1` for the edge from k to
 * k + nx, ascending; where along each the side crosses (0 at k, 1 at the edge's other node); and the length of side
 * each stands for.
 */
export interface RibbonSides {
  readonly codes: Int32Array;
  readonly fraction: Float32Array;
  readonly length: Float32Array;
}

/**
 * The terrain: each node's height, and the wall on each of the problem's sides, how far the ground beyond the edge's
 * second node stands above the ground before it carried across.
 */
export interface Terrain {
  readonly heights: Float32Array;
  readonly walls: Float32Array;
}

export interface TerrainParameters {
  /** t: the membrane's share against the thin plate's, in [0, 1]. */
  readonly tension: number;
  /** λ, per metre: how hard each covering ribbon pulls the ground up to it. */
  readonly lambda: number;
  /** μ: what each square metre of wall costs, as E counts it. */
  readonly wall: number;
}

export interface TerrainProgress {
  readonly spacing: number;
  readonly step: number;
}

/** The coarsest spacing the coarse-to-fine solution starts at, in metres. */
const START_SPACING = 8;
/** A grid no longer than this along both axes is solved directly. */
const DIRECT_SIZE = 33;
/** Finer spacings: how far from a finer side a coarser side may lie whose wall it takes. */
const WALL_REACH = 2.5;
/** Metres: the conjugate gradients stop when the preconditioned residual, the next correction's estimate, is this small. */
const TOLERANCE = 1e-4;
const MAXIMUM_ITERATIONS = 400;
const MAXIMUM_STEPS = 60;
/** The share of a level's nodes (and the fewest nodes) whose change of held state rebuilds its coarse levels. */
const REBUILD_SHARE = 0.001;
const REBUILD_LEAST = 200;

/**
 * A grid's operator at its own spacing: the energy's Hessian, whose row depends only on where its node lies relative
 * to the grid's edges, held at zero on `held` nodes.
 */
interface ClassLevel {
  readonly kind: 'class';
  readonly nx: number;
  readonly nz: number;
  readonly rows: Float64Array;
  /** Each class's nonzero offsets. */
  readonly nonzero: readonly Int32Array[];
  readonly held: Uint8Array;
  /** The nodes whose rows are their own (the walls' preconditioner's), not their class's. */
  readonly own?: OwnRows;
}

interface OwnRows {
  readonly at: Uint8Array;
  readonly rows: Map<number, Float64Array>;
}

/** A coarser level's Galerkin operator `P̃ᵀ A P̃`: each node's centre and upper-half coefficients. */
interface StoredLevel {
  readonly kind: 'stored';
  readonly nx: number;
  readonly nz: number;
  readonly upper: Float32Array;
  readonly held: Uint8Array;
  /** Nodes whose row is `interior`, the row of a coarse node whose whole neighbourhood is free and within the grid. */
  readonly regular: Uint8Array;
  readonly interior: Float64Array;
}

type Level = ClassLevel | StoredLevel;

/** The class of index `i` on an axis of `n` nodes: 0 and 1 from its start, 2 within, 3 and 4 at its end. */
const classOf = (i: number, n: number) => (i < 2 ? i : i >= n - 2 ? 4 - (n - 1 - i) : 2);

/** The energy's Hessian rows on a grid of `spacing`, by class: `Σ 2 w c cᵀ` over its edges, triples and cells. */
function classRows(spacing: number, tension: number): { rows: Float64Array; nonzero: Int32Array[] } {
  const n = 9;
  const assembled = new Float64Array(n * n * STENCIL);
  const add = (nodes: readonly number[], weight: number) => {
    for (let p = 0; p < nodes.length; p += 3)
      for (let q = 0; q < nodes.length; q += 3) {
        const d = (nodes[q + 1]! - nodes[p + 1]! + 2) * 5 + (nodes[q]! - nodes[p]! + 2);
        assembled[(nodes[p + 1]! * n + nodes[p]!) * STENCIL + d]! += 2 * weight * nodes[p + 2]! * nodes[q + 2]!;
      }
  };
  const plate = (1 - tension) / (spacing * spacing);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (i + 1 < n) add([i, j, -1, i + 1, j, 1], tension);
      if (j + 1 < n) add([i, j, -1, i, j + 1, 1], tension);
      if (i > 0 && i + 1 < n) add([i - 1, j, 1, i, j, -2, i + 1, j, 1], plate);
      if (j > 0 && j + 1 < n) add([i, j - 1, 1, i, j, -2, i, j + 1, 1], plate);
      if (i + 1 < n && j + 1 < n) add([i, j, 1, i + 1, j, -1, i, j + 1, -1, i + 1, j + 1, 1], 2 * plate);
    }
  const representative = [0, 1, 4, 7, 8];
  const rows = new Float64Array(STENCIL * STENCIL);
  const nonzero: Int32Array[] = [];
  for (let cz = 0; cz < 5; cz++)
    for (let cx = 0; cx < 5; cx++) {
      const c = cz * 5 + cx;
      const from = (representative[cz]! * n + representative[cx]!) * STENCIL;
      rows.set(assembled.subarray(from, from + STENCIL), c * STENCIL);
      const list: number[] = [];
      for (let d = 0; d < STENCIL; d++) if (d !== CENTRE && rows[c * STENCIL + d] !== 0) list.push(d);
      nonzero.push(Int32Array.from(list));
    }
  return { rows, nonzero };
}

/** Node `k`'s row of `level` into `out`, zero where it reaches beyond the grid. */
function rowOf(level: Level, i: number, j: number, out: Float64Array) {
  if (level.kind === 'class') {
    const own = level.own?.rows.get(j * level.nx + i);
    if (own) return void out.set(own);
    const c = classOf(j, level.nz) * 5 + classOf(i, level.nx);
    for (let d = 0; d < STENCIL; d++) out[d] = level.rows[c * STENCIL + d]!;
    return;
  }
  const { nx, nz, upper } = level;
  const k = j * nx + i;
  if (level.regular[k]) {
    out.set(level.interior);
    return;
  }
  for (let d = CENTRE; d < STENCIL; d++) {
    const x = i + offsetX(d),
      z = j + offsetZ(d);
    out[d] = x >= 0 && x < nx && z < nz ? upper[k * STORED + d - CENTRE]! : 0;
    // The lower half is the mirrored neighbour's upper half.
    const m = 24 - d;
    const xm = i + offsetX(m),
      zm = j + offsetZ(m);
    if (d !== CENTRE) out[m] = xm >= 0 && xm < nx && zm >= 0 ? upper[(zm * nx + xm) * STORED + d - CENTRE]! : 0;
  }
}

/** A row's off-centre nonzero coefficients and their offsets in a grid `nx` wide, and its centre. */
interface CompactRow {
  readonly coefficients: Float64Array;
  readonly offsets: Int32Array;
  readonly centre: number;
}

function compactRow(row: Float64Array, nx: number): CompactRow {
  const coefficients: number[] = [],
    offsets: number[] = [];
  for (let d = 0; d < STENCIL; d++)
    if (d !== CENTRE && row[d] !== 0) {
      coefficients.push(row[d]!);
      offsets.push(offsetZ(d) * nx + offsetX(d));
    }
  return { coefficients: Float64Array.from(coefficients), offsets: Int32Array.from(offsets), centre: row[CENTRE]! };
}

/** `out = A x` on the nodes not held (zero on the held ones), or on every node with `all`. */
function apply(level: Level, x: Float64Array, out: Float64Array, all = false) {
  const { nx, nz, held } = level;
  const row = new Float64Array(STENCIL);
  const stencil = stencilOffsets(nx);
  const edge = (i: number, j: number, k: number) => {
    rowOf(level, i, j, row);
    let sum = 0;
    for (let d = 0; d < STENCIL; d++) if (row[d] !== 0) sum += row[d]! * x[k + stencil[d]!]!;
    out[k] = sum;
  };
  if (level.kind === 'class') {
    const interior = level.rows.subarray(CENTRE * STENCIL, (CENTRE + 1) * STENCIL);
    const centre = interior[CENTRE]!,
      one = interior[CENTRE + 1]!,
      two = interior[CENTRE + 2]!,
      diagonal = interior[CENTRE + 6]!;
    const nx2 = 2 * nx;
    const own = level.own?.at;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!all && held[k]) out[k] = 0;
        else if (i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2 || own?.[k]) edge(i, j, k);
        else
          out[k] =
            centre * x[k]! +
            one * (x[k - 1]! + x[k + 1]! + x[k - nx]! + x[k + nx]!) +
            two * (x[k - 2]! + x[k + 2]! + x[k - nx2]! + x[k + nx2]!) +
            diagonal * (x[k - nx - 1]! + x[k - nx + 1]! + x[k + nx - 1]! + x[k + nx + 1]!);
      }
    return;
  }
  const { coefficients, offsets, centre } = compactRow(level.interior, nx);
  const count = coefficients.length;
  const regular = level.regular;
  for (let k = 0; k < nx * nz; k++) {
    if (!all && held[k]) out[k] = 0;
    else if (!regular[k]) {
      const j = (k / nx) | 0;
      edge(k - j * nx, j, k);
    } else {
      let sum = centre * x[k]!;
      for (let m = 0; m < count; m++) sum += coefficients[m]! * x[k + offsets[m]!]!;
      out[k] = sum;
    }
  }
}

const offsetCache = new Map<number, Int32Array>();
function stencilOffsets(nx: number): Int32Array {
  let offsets = offsetCache.get(nx);
  if (!offsets) {
    offsets = new Int32Array(STENCIL);
    for (let d = 0; d < STENCIL; d++) offsets[d] = offsetZ(d) * nx + offsetX(d);
    offsetCache.set(nx, offsets);
  }
  return offsets;
}

/** One Gauss–Seidel sweep of `A z = rhs` over the nodes not held, forward or backward. */
function smooth(level: Level, z: Float64Array, rhs: Float64Array, forward: boolean) {
  const { nx, nz, held } = level;
  const row = new Float64Array(STENCIL);
  const stencil = stencilOffsets(nx);
  // A node off the interior: its own row.
  const edge = (i: number, j: number, k: number) => {
    rowOf(level, i, j, row);
    let sum = rhs[k]!;
    for (let d = 0; d < STENCIL; d++) if (d !== CENTRE && row[d] !== 0) sum -= row[d]! * z[k + stencil[d]!]!;
    z[k] = sum / row[CENTRE]!;
  };
  if (level.kind === 'class') {
    // Within two nodes of no edge every row is the interior one, symmetric: its centre, its four neighbours one and
    // two nodes away and its four diagonal ones.
    const interior = level.rows.subarray(CENTRE * STENCIL, (CENTRE + 1) * STENCIL);
    const centre = interior[CENTRE]!,
      one = interior[CENTRE + 1]!,
      two = interior[CENTRE + 2]!,
      diagonal = interior[CENTRE + 6]!;
    const nx2 = 2 * nx;
    const own = level.own?.at;
    for (let row = 0; row < nz; row++) {
      const j = forward ? row : nz - 1 - row;
      for (let column = 0; column < nx; column++) {
        const i = forward ? column : nx - 1 - column;
        const k = j * nx + i;
        if (held[k]) continue;
        if (i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2 || own?.[k]) {
          edge(i, j, k);
          continue;
        }
        z[k] =
          (rhs[k]! -
            one * (z[k - 1]! + z[k + 1]! + z[k - nx]! + z[k + nx]!) -
            two * (z[k - 2]! + z[k + 2]! + z[k - nx2]! + z[k + nx2]!) -
            diagonal * (z[k - nx - 1]! + z[k - nx + 1]! + z[k + nx - 1]! + z[k + nx + 1]!)) /
          centre;
      }
    }
    return;
  }
  const { coefficients, offsets, centre } = compactRow(level.interior, nx);
  const count = coefficients.length;
  const regular = level.regular;
  const n = nx * nz;
  for (let step = 0; step < n; step++) {
    const k = forward ? step : n - 1 - step;
    if (held[k]) continue;
    if (!regular[k]) {
      const j = (k / nx) | 0;
      edge(k - j * nx, j, k);
      continue;
    }
    let sum = rhs[k]!;
    for (let m = 0; m < count; m++) sum -= coefficients[m]! * z[k + offsets[m]!]!;
    z[k] = sum / centre;
  }
}

/** The next coarser grid's size along an axis: every other node, covering the finer's last. */
const coarser = (n: number) => (n >> 1) + 1;

/** The bilinear prolongation's coarse parents of fine index `f` along an axis, and their weights. */
function parents(f: number, out: number[]): number {
  if ((f & 1) === 0) {
    out[0] = f >> 1;
    out[1] = 1;
    return 1;
  }
  out[0] = f >> 1;
  out[1] = 0.5;
  out[2] = (f >> 1) + 1;
  out[3] = 0.5;
  return 2;
}

/**
 * Coarse node (`I`, `J`)'s row of `P̃ᵀ A P̃` into `out`: over its fine support, each fine row through the prolongation
 * back to the coarse nodes, skipping what `free` rejects (a held node, or one beyond the grid).
 */
function galerkinRow(
  I: number,
  J: number,
  rowAt: (fx: number, fz: number, out: Float64Array) => void,
  free: (fx: number, fz: number) => boolean,
  row: Float64Array,
  out: Float64Array,
) {
  out.fill(0);
  const px: number[] = [],
    pz: number[] = [];
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const fx = 2 * I + b,
        fz = 2 * J + a;
      if (!free(fx, fz)) continue;
      const wi = (a === 0 ? 1 : 0.5) * (b === 0 ? 1 : 0.5);
      rowAt(fx, fz, row);
      for (let d = 0; d < STENCIL; d++) {
        const value = row[d]!;
        if (value === 0) continue;
        const gx = fx + offsetX(d),
          gz = fz + offsetZ(d);
        if (!free(gx, gz)) continue;
        const cx = parents(gx, px),
          cz = parents(gz, pz);
        for (let q = 0; q < cz; q++)
          for (let p = 0; p < cx; p++)
            out[(pz[2 * q]! - J + 2) * 5 + (px[2 * p]! - I + 2)]! += wi * value * pz[2 * q + 1]! * px[2 * p + 1]!;
      }
    }
}

/**
 * The Galerkin operator `P̃ᵀ A P̃` of `fine`, its prolongation truncated at its held nodes. A coarse node whose fine
 * neighbourhood (seven nodes across) holds only regular nodes takes the interior row, worked out once.
 */
function galerkin(fine: Level): StoredLevel {
  const nx = coarser(fine.nx),
    nz = coarser(fine.nz);
  const upper = new Float32Array(nx * nz * STORED);
  const held = new Uint8Array(nx * nz);
  const regular = new Uint8Array(nx * nz);
  const row = new Float64Array(STENCIL);
  const accumulated = new Float64Array(STENCIL);
  const fineInterior =
    fine.kind === 'class' ? fine.rows.subarray(CENTRE * STENCIL, (CENTRE + 1) * STENCIL) : fine.interior;
  const interior = new Float64Array(STENCIL);
  galerkinRow(
    0,
    0,
    (_x, _z, out) => out.set(fineInterior),
    () => true,
    row,
    interior,
  );
  // Fine nodes whose row is the interior one and that are free, then whether a coarse node's neighbourhood is all such.
  const irregular = new Uint8Array(fine.nx * fine.nz);
  for (let j = 0; j < fine.nz; j++)
    for (let i = 0; i < fine.nx; i++) {
      const k = j * fine.nx + i;
      irregular[k] =
        fine.held[k] ||
        (fine.kind === 'class'
          ? Number(classOf(i, fine.nx) !== 2 || classOf(j, fine.nz) !== 2 || !!fine.own?.at[k])
          : Number(!fine.regular[k]));
    }
  const across = dilate(irregular, fine.nx, fine.nz, 1, 3),
    near = dilate(across, fine.nx, fine.nz, fine.nx, 3);
  const free = (fx: number, fz: number) =>
    fx >= 0 && fx < fine.nx && fz >= 0 && fz < fine.nz && !fine.held[fz * fine.nx + fx];
  const rowAt = (fx: number, fz: number, out: Float64Array) => rowOf(fine, fx, fz, out);
  for (let J = 0; J < nz; J++)
    for (let I = 0; I < nx; I++) {
      const k = J * nx + I;
      const fx = 2 * I,
        fz = 2 * J;
      let source = interior;
      if (fx >= fine.nx || fz >= fine.nz || near[fz * fine.nx + fx]) {
        galerkinRow(I, J, rowAt, free, row, accumulated);
        source = accumulated;
      } else regular[k] = 1;
      for (let d = CENTRE; d < STENCIL; d++) upper[k * STORED + d - CENTRE] = source[d]!;
      if (!(source[CENTRE]! > 0)) held[k] = 1;
    }
  return { kind: 'stored', nx, nz, upper, held, regular, interior };
}

/** Whether any of `flags` within `reach` nodes along one axis (`step` apart in the array) is set, per node. */
function dilate(flags: Uint8Array, nx: number, nz: number, step: number, reach: number): Uint8Array {
  const out = new Uint8Array(flags.length);
  const length = step === 1 ? nx : nz;
  const lines = step === 1 ? nz : nx;
  for (let line = 0; line < lines; line++) {
    const base = step === 1 ? line * nx : line;
    // The last set flag seen, then the next one ahead.
    let last = -Infinity;
    let next = -1;
    const findNext = (from: number) => {
      for (let m = from; m < length; m++) if (flags[base + m * step]) return m;
      return Infinity;
    };
    next = findNext(0);
    for (let m = 0; m < length; m++) {
      if (m === next) {
        last = m;
        next = findNext(m + 1);
      }
      out[base + m * step] = m - last <= reach || next - m <= reach ? 1 : 0;
    }
  }
  return out;
}

/** `out = P̃ᵀ residual`: each coarse node gathers its free fine support, the nearest whole and the next halved. */
function restrict(fine: Level, residual: Float64Array, coarse: Level, out: Float64Array) {
  const { nx, nz, held } = fine;
  for (let J = 0; J < coarse.nz; J++)
    for (let I = 0; I < coarse.nx; I++) {
      let sum = 0;
      for (let a = -1; a <= 1; a++) {
        const fz = 2 * J + a;
        if (fz < 0 || fz >= nz) continue;
        const wz = a === 0 ? 1 : 0.5;
        for (let b = -1; b <= 1; b++) {
          const fx = 2 * I + b;
          if (fx < 0 || fx >= nx) continue;
          const k = fz * nx + fx;
          if (!held[k]) sum += wz * (b === 0 ? 1 : 0.5) * residual[k]!;
        }
      }
      out[J * coarse.nx + I] = sum;
    }
}

/** `out += P̃ values`, bilinear from the coarse nodes, on the free fine nodes, or with `full` on every one. */
function prolong(coarse: { nx: number }, values: Float64Array, fine: Level, out: Float64Array, full = false) {
  const { nx, nz, held } = fine;
  const cnx = coarse.nx;
  for (let j = 0; j < nz; j++) {
    const J = j >> 1,
      oddZ = j & 1;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!full && held[k]) continue;
      const I = i >> 1,
        c = J * cnx + I;
      let value: number;
      if (i & 1)
        value = oddZ
          ? 0.25 * (values[c]! + values[c + 1]! + values[c + cnx]! + values[c + cnx + 1]!)
          : 0.5 * (values[c]! + values[c + 1]!);
      else value = oddZ ? 0.5 * (values[c]! + values[c + cnx]!) : values[c]!;
      out[k] = out[k]! + value;
    }
  }
}

/** The coarsest level's band Cholesky factor, its held nodes standing for themselves. */
interface Direct {
  readonly n: number;
  readonly band: number;
  readonly factor: Float64Array;
}

function factorDirect(level: Level): Direct {
  const { nx, nz, held } = level;
  const n = nx * nz;
  const band = 2 * nx + 2;
  const width = band + 1;
  const factor = new Float64Array(n * width);
  const row = new Float64Array(STENCIL);
  // The lower band of A: entry (k, k + offset) for each nonpositive offset.
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (held[k]) {
        factor[k * width + band] = 1;
        continue;
      }
      rowOf(level, i, j, row);
      for (let d = 0; d <= CENTRE; d++) {
        const m = k + offsetZ(d) * nx + offsetX(d);
        if (row[d] === 0 || held[m]!) continue;
        factor[k * width + band + m - k] = row[d]!;
      }
    }
  for (let i = 0; i < n; i++)
    for (let j = Math.max(0, i - band); j <= i; j++) {
      let sum = factor[i * width + band + j - i]!;
      for (let k = Math.max(0, i - band); k < j; k++)
        sum -= factor[i * width + band + k - i]! * factor[j * width + band + k - j]!;
      if (j < i) factor[i * width + band + j - i] = sum / factor[j * width + band]!;
      else factor[i * width + band] = sum > 0 ? Math.sqrt(sum) : 1;
    }
  return { n, band, factor };
}

function solveDirect(direct: Direct, rhs: Float64Array, out: Float64Array) {
  const { n, band, factor } = direct;
  const width = band + 1;
  for (let i = 0; i < n; i++) {
    let sum = rhs[i]!;
    for (let k = Math.max(0, i - band); k < i; k++) sum -= factor[i * width + band + k - i]! * out[k]!;
    out[i] = sum / factor[i * width + band]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = out[i]!;
    for (let k = i + 1; k <= Math.min(n - 1, i + band); k++) sum -= factor[k * width + band + i - k]! * out[k]!;
    out[i] = sum / factor[i * width + band]!;
  }
}

/** A multigrid hierarchy below a class level, and its work arrays. */
interface Hierarchy {
  readonly levels: Level[];
  readonly direct: Direct;
  readonly solution: Float64Array[];
  readonly rhs: Float64Array[];
  readonly residual: Float64Array[];
}

function buildHierarchy(top: ClassLevel): Hierarchy {
  const levels: Level[] = [top];
  while (Math.max(levels.at(-1)!.nx, levels.at(-1)!.nz) > DIRECT_SIZE) levels.push(galerkin(levels.at(-1)!));
  const sizes = levels.map((level) => level.nx * level.nz);
  return {
    levels,
    direct: factorDirect(levels.at(-1)!),
    solution: sizes.map((n, l) => (l === 0 ? new Float64Array(0) : new Float64Array(n))),
    rhs: sizes.map((n, l) => (l === 0 ? new Float64Array(0) : new Float64Array(n))),
    residual: sizes.map((n, l) => (l + 1 === sizes.length ? new Float64Array(0) : new Float64Array(n))),
  };
}

/** `z = M r`: one symmetric V-cycle from zero, two Gauss–Seidel sweeps before and after each coarse correction. */
function precondition(hierarchy: Hierarchy, r: Float64Array, z: Float64Array, scratch: Float64Array) {
  cycle(hierarchy, 0, r, z, scratch);
}

/** The V-cycle from level `l` down, `solution` from zero for `rhs`, `residual` its work array. */
function cycle(hierarchy: Hierarchy, l: number, rhs: Float64Array, solution: Float64Array, residual: Float64Array) {
  const level = hierarchy.levels[l]!;
  solution.fill(0);
  if (l === hierarchy.levels.length - 1) {
    solveDirect(hierarchy.direct, rhs, solution);
    return;
  }
  smooth(level, solution, rhs, true);
  smooth(level, solution, rhs, true);
  apply(level, solution, residual);
  for (let k = 0; k < residual.length; k++) residual[k] = rhs[k]! - residual[k]!;
  coarseCorrection(hierarchy, l, residual, solution);
  smooth(level, solution, rhs, false);
  smooth(level, solution, rhs, false);
}

/** `solution += P̃ (coarser cycle of P̃ᵀ residual)` from level `l`. */
function coarseCorrection(hierarchy: Hierarchy, l: number, residual: Float64Array, solution: Float64Array) {
  const level = hierarchy.levels[l]!,
    next = hierarchy.levels[l + 1]!;
  restrict(level, residual, next, hierarchy.rhs[l + 1]!);
  cycle(hierarchy, l + 1, hierarchy.rhs[l + 1]!, hierarchy.solution[l + 1]!, hierarchy.residual[l + 1]!);
  prolong(next, hierarchy.solution[l + 1]!, level, solution);
}

const largest = (a: Float64Array) => {
  let most = 0;
  for (let k = 0; k < a.length; k++) most = Math.max(most, Math.abs(a[k]!));
  return most;
};

const dot = (a: Float64Array, b: Float64Array) => {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += a[k]! * b[k]!;
  return sum;
};

/**
 * Conjugate gradients on `level`'s free nodes from `x`, its residual `r` and preconditioned residual `z` given, until
 * the next correction's estimate is within `goal`; `p` and `q` are work arrays.
 */
function conjugateGradients(
  level: ClassLevel,
  hierarchy: Hierarchy,
  x: Float64Array,
  r: Float64Array,
  z: Float64Array,
  p: Float64Array,
  q: Float64Array,
  goal: number,
) {
  const n = x.length;
  let rz = dot(r, z);
  p.set(z);
  for (let iteration = 0; iteration < MAXIMUM_ITERATIONS && largest(z) > goal; iteration++) {
    apply(level, p, q);
    const alpha = rz / dot(p, q);
    for (let k = 0; k < n; k++) {
      x[k] = x[k]! + alpha * p[k]!;
      r[k] = r[k]! - alpha * q[k]!;
    }
    precondition(hierarchy, r, z, q);
    const next = dot(r, z);
    const beta = next / rz;
    rz = next;
    for (let k = 0; k < n; k++) p[k] = z[k]! + beta * p[k]!;
  }
}

/**
 * Fields known at the `held` nodes carried smoothly over the rest of a grid: each the minimum of the same energy without
 * the ribbons' pull, with its held values fixed (to `TOLERANCE`). The fields are changed in place.
 */
export function extendFields(
  grid: Pick<MapGrid, 'nx' | 'nz' | 'spacing'>,
  tension: number,
  held: Uint8Array,
  fields: readonly Float64Array[],
) {
  const { nx, nz } = grid;
  const n = nx * nz;
  if (!held.includes(1)) return;
  const { rows, nonzero } = classRows(grid.spacing, tension);
  const level: ClassLevel = { kind: 'class', nx, nz, rows, nonzero, held };
  const hierarchy = buildHierarchy(level);
  const r = new Float64Array(n),
    z = new Float64Array(n),
    p = new Float64Array(n),
    q = new Float64Array(n);
  for (const x of fields) {
    for (let k = 0; k < n; k++) if (!held[k]) x[k] = 0;
    apply(level, x, r);
    for (let k = 0; k < n; k++) r[k] = held[k] ? 0 : -r[k]!;
    precondition(hierarchy, r, z, q);
    conjugateGradients(level, hierarchy, x, r, z, p, q, TOLERANCE);
  }
}

/** A grid's ribbon sides at the next coarser spacing: each coarser edge that an odd number of its finer edges' sides cross. */
function coarserSides(sides: RibbonSides, nx: number, cnx: number): RibbonSides {
  const found = new Map<number, { count: number; fraction: number; length: number }>();
  sides.codes.forEach((code, e) => {
    const k = code >> 1,
      axis = code & 1;
    const i = k % nx,
      j = (k / nx) | 0;
    // On a coarser line: along it, the coarser edge and where the finer one lies in it.
    const along = axis ? j : i;
    if ((axis ? i : j) & 1) return;
    const coarse = 2 * ((axis ? j >> 1 : j / 2) * cnx + (axis ? i / 2 : i >> 1)) + axis;
    const fraction = ((along & 1) + sides.fraction[e]!) / 2;
    const entry = found.get(coarse);
    if (entry) entry.count++;
    else found.set(coarse, { count: 1, fraction, length: 2 * sides.length[e]! });
  });
  const codes = Int32Array.from([...found].filter(([, entry]) => entry.count & 1).map(([code]) => code)).sort();
  return {
    codes,
    fraction: Float32Array.from(codes, (code) => found.get(code)!.fraction),
    length: Float32Array.from(codes, (code) => found.get(code)!.length),
  };
}

/** The index of `code` among the sorted `codes`, or −1. */
function sideIndex(codes: Int32Array, code: number): number {
  let low = 0,
    high = codes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = codes[middle]!;
    if (value === code) return middle;
    if (value < code) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

/**
 * The energy's terms that cross a wall, each `w (c · H + d · J)²`: up to four nodes and their coefficients c, its
 * weight w, and up to four walls (their sides' indices, −1 for none) and their coefficients d.
 */
interface WallTerms {
  readonly count: number;
  readonly nodes: Int32Array;
  readonly c: Float64Array;
  readonly weight: Float64Array;
  readonly walls: Int32Array;
  readonly d: Float64Array;
}

/**
 * The terms of the energy (as `classRows` sums them) that cross a ribbon's side, with the wall J on it: across a wall
 * from node a to node b (b the later), b's height counts as `H_b − J`. A term counts its nodes from its first node's
 * side: a node across a wall from that side by its own walls there (their mean), any other as its neighbours.
 */
function wallTerms(sides: RibbonSides, nx: number, nz: number, spacing: number, tension: number): WallTerms {
  const plate = (1 - tension) / (spacing * spacing);
  // Each term once: its kind (0, 1 the membrane along x and z, 2, 3 the plate along x and z, 4 a cell) and node.
  const kinds = new Set<number>();
  sides.codes.forEach((code) => {
    const k = code >> 1;
    const i = k % nx,
      j = (k / nx) | 0;
    if (code & 1) {
      kinds.add(5 * k + 1);
      if (j > 0) kinds.add(5 * k + 3);
      if (j + 2 < nz) kinds.add(5 * (k + nx) + 3);
      if (i + 1 < nx) kinds.add(5 * k + 4);
      if (i > 0) kinds.add(5 * (k - 1) + 4);
    } else {
      kinds.add(5 * k);
      if (i > 0) kinds.add(5 * k + 2);
      if (i + 2 < nx) kinds.add(5 * (k + 1) + 2);
      if (j + 1 < nz) kinds.add(5 * k + 4);
      if (j > 0) kinds.add(5 * (k - nx) + 4);
    }
  });
  const count = kinds.size;
  const nodes = new Int32Array(4 * count).fill(-1),
    c = new Float64Array(4 * count),
    weight = new Float64Array(count),
    walls = new Int32Array(4 * count).fill(-1),
    d = new Float64Array(4 * count);
  let t = 0;
  for (const kind of [...kinds].sort((a, b) => a - b)) {
    const k = Math.floor(kind / 5);
    // The term's nodes, their coefficients, its weight and its edges (two of its nodes and the grid edge's code).
    const [ns, cs, w, edges]: [number[], number[], number, [number, number, number][]] =
      kind % 5 === 0
        ? [[k, k + 1], [-1, 1], tension, [[0, 1, 2 * k]]]
        : kind % 5 === 1
          ? [[k, k + nx], [-1, 1], tension, [[0, 1, 2 * k + 1]]]
          : kind % 5 === 2
            ? [
                [k - 1, k, k + 1],
                [1, -2, 1],
                plate,
                [
                  [0, 1, 2 * (k - 1)],
                  [1, 2, 2 * k],
                ],
              ]
            : kind % 5 === 3
              ? [
                  [k - nx, k, k + nx],
                  [1, -2, 1],
                  plate,
                  [
                    [0, 1, 2 * (k - nx) + 1],
                    [1, 2, 2 * k + 1],
                  ],
                ]
              : [
                  [k, k + 1, k + nx, k + nx + 1],
                  [1, -1, -1, 1],
                  2 * plate,
                  [
                    [0, 1, 2 * k],
                    [0, 2, 2 * k + 1],
                    [1, 3, 2 * (k + 1) + 1],
                    [2, 3, 2 * (k + nx)],
                  ],
                ];
    const wallOf = edges.map(([, , code]) => sideIndex(sides.codes, code));
    // Each node's shift, the walls it counts (wall → coefficient), from the first node's side.
    const shift: (Map<number, number> | null)[] = ns.map(() => null);
    shift[0] = new Map();
    for (let grown = true; grown;) {
      grown = false;
      edges.forEach(([u, v], m) => {
        if (wallOf[m]! >= 0) return;
        if (shift[u] && !shift[v]) shift[v] = new Map(shift[u]);
        else if (shift[v] && !shift[u]) shift[u] = new Map(shift[v]);
        else return;
        grown = true;
      });
    }
    for (let grown = true; grown;) {
      grown = false;
      for (const across of [true, false]) {
        const reached = ns.map((_, node) => {
          if (shift[node]) return null;
          const ways: Map<number, number>[] = [];
          edges.forEach(([u, v], m) => {
            const other = u === node ? v : v === node ? u : -1;
            if (other < 0 || !shift[other] || wallOf[m]! >= 0 !== across) return;
            const way = new Map(shift[other]);
            // Across the wall from a to b, b counts `H_b − J`; from b to a, a counts `H_a + J`.
            if (across) way.set(wallOf[m]!, (way.get(wallOf[m]!) ?? 0) + (node === v ? -1 : 1));
            ways.push(way);
          });
          if (!ways.length) return null;
          const mean = new Map<number, number>();
          for (const way of ways) for (const [e, value] of way) mean.set(e, (mean.get(e) ?? 0) + value / ways.length);
          return mean;
        });
        if (reached.some((value) => value)) {
          reached.forEach((value, node) => value && (shift[node] = value));
          grown = true;
          break;
        }
      }
    }
    const coefficients = new Map<number, number>();
    ns.forEach((node, m) => {
      nodes[4 * t + m] = node;
      c[4 * t + m] = cs[m]!;
      for (const [e, value] of shift[m]!) coefficients.set(e, (coefficients.get(e) ?? 0) + cs[m]! * value);
    });
    weight[t] = w;
    let m = 0;
    for (const [e, value] of coefficients)
      if (value) {
        walls[4 * t + m] = e;
        d[4 * t + m++] = value;
      }
    t++;
  }
  return { count, nodes, c, weight, walls, d };
}

/**
 * The walls at one spacing: their terms, each one's cost `μ ℓ`, height J and the way it stands (+1 or −1; 0 where it
 * stands at none, its J zero), and each one's own share of the energy's second derivative.
 */
interface Walls {
  readonly terms: WallTerms;
  /** Each wall's two nodes, a then b. */
  readonly ends: Int32Array;
  readonly cost: Float64Array;
  readonly J: Float64Array;
  readonly sign: Int8Array;
  readonly diagonal: Float64Array;
}

function createWalls(terms: WallTerms, sides: RibbonSides, nx: number, cost: number, J: Float64Array): Walls {
  const ends = new Int32Array(2 * J.length);
  sides.codes.forEach((code, e) => {
    ends[2 * e] = code >> 1;
    ends[2 * e + 1] = (code >> 1) + (code & 1 ? nx : 1);
  });
  const diagonal = new Float64Array(J.length);
  for (let m = 0; m < 4 * terms.count; m++) {
    const e = terms.walls[m]!;
    if (e >= 0) diagonal[e]! += 2 * terms.weight[m >> 2]! * terms.d[m]! ** 2;
  }
  return {
    terms,
    ends,
    cost: Float64Array.from(sides.length, (length) => cost * length),
    J,
    sign: Int8Array.from(J, Math.sign),
    diagonal,
  };
}

/**
 * The walls' share of the energy's gradient for heights `h` and walls `j`: `outH += Σ 2 w c (d · j)` (A's own share
 * `Σ 2 w c (c · h)` is in `apply`) on the nodes not `held`, and `outJ = Σ 2 w d (c · h + d · j)`.
 */
function applyWalls(
  terms: WallTerms,
  h: Float64Array,
  j: Float64Array,
  outH: Float64Array,
  outJ: Float64Array,
  held: Uint8Array | null,
) {
  outJ.fill(0);
  const { nodes, c, walls, d } = terms;
  for (let t = 0; t < terms.count; t++) {
    let ch = 0,
      dj = 0;
    for (let m = 4 * t; m < 4 * t + 4; m++) {
      if (nodes[m]! >= 0) ch += c[m]! * h[nodes[m]!]!;
      if (walls[m]! >= 0) dj += d[m]! * j[walls[m]!]!;
    }
    const w = 2 * terms.weight[t]!;
    for (let m = 4 * t; m < 4 * t + 4; m++) {
      const node = nodes[m]!;
      if (dj && node >= 0 && !held?.[node]) outH[node]! += w * c[m]! * dj;
      if (walls[m]! >= 0) outJ[walls[m]!]! += w * d[m]! * (ch + dj);
    }
  }
}

/**
 * The heights' operator with each standing wall's J counted from the heights across it, `J = J̃ + H_b − H_a`: in each
 * of its terms `2 w c' c'ᵀ` in place of `2 w c cᵀ`, `c' = c + Σ d (e_b − e_a)` over the term's standing walls. A
 * standing wall's ground beyond it then moves with it, as the solution's does.
 */
function cutLevel(level: ClassLevel, walls: Walls): ClassLevel {
  const { nx } = level;
  const { terms, ends, sign } = walls;
  const rows = new Map<number, Float64Array>();
  const at = new Uint8Array(nx * level.nz);
  const add = (coefficients: Map<number, number>, weight: number) => {
    for (const [p, cp] of coefficients) {
      let row = rows.get(p);
      if (!row) {
        row = new Float64Array(STENCIL);
        rowOf(level, p % nx, (p / nx) | 0, row);
        rows.set(p, row);
        at[p] = 1;
      }
      for (const [q, cq] of coefficients) {
        const dx = (q % nx) - (p % nx),
          dz = ((q / nx) | 0) - ((p / nx) | 0);
        row[(dz + 2) * 5 + dx + 2]! += weight * cp * cq;
      }
    }
  };
  for (let t = 0; t < terms.count; t++) {
    let standing = false;
    for (let m = 4 * t; m < 4 * t + 4; m++) if (terms.walls[m]! >= 0 && sign[terms.walls[m]!]) standing = true;
    if (!standing) continue;
    const c = new Map<number, number>();
    for (let m = 4 * t; m < 4 * t + 4; m++) if (terms.nodes[m]! >= 0) c.set(terms.nodes[m]!, terms.c[m]!);
    const cut = new Map(c);
    for (let m = 4 * t; m < 4 * t + 4; m++) {
      const e = terms.walls[m]!;
      if (e < 0 || !sign[e]) continue;
      cut.set(ends[2 * e + 1]!, (cut.get(ends[2 * e + 1]!) ?? 0) + terms.d[m]!);
      cut.set(ends[2 * e]!, (cut.get(ends[2 * e]!) ?? 0) - terms.d[m]!);
    }
    add(c, -2 * terms.weight[t]!);
    add(cut, 2 * terms.weight[t]!);
  }
  return { ...level, own: { at, rows } };
}

/**
 * Ground the pieces of ground the standing walls cut off from every held node, which no energy holds: each piece moved
 * by the t that costs least, its ribbons' pull against its walls' costs (`−t Σ pull + Σ μ ℓ |J + side · t|`) with no
 * node above its cap; then the wall there laid down, or the node there held, so that the piece stands on it. Returns
 * how many it grounded.
 */
function anchorFloating(
  level: ClassLevel,
  walls: Walls,
  x: Float64Array,
  cap: Float64Array,
  pull: Float64Array,
): number {
  const { nx, nz, held } = level;
  const { ends, sign, J, cost } = walls;
  const n = nx * nz;
  const parent = new Int32Array(n);
  for (let k = 0; k < n; k++) parent[k] = k;
  const find = (k: number) => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]!]!;
    return k;
  };
  // The grid's edges but the standing walls join the ground's pieces.
  const cut = new Uint8Array(2 * n);
  for (let e = 0; e < sign.length; e++)
    if (sign[e]) cut[2 * ends[2 * e]! + (ends[2 * e + 1]! - ends[2 * e]! === 1 ? 0 : 1)] = 1;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      for (const [far, edge] of [
        [i + 1 < nx ? k + 1 : -1, 2 * k],
        [j + 1 < nz ? k + nx : -1, 2 * k + 1],
      ] as const) {
        if (far < 0 || cut[edge]) continue;
        const a = find(k),
          b = find(far);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  const grounded = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (held[k]) grounded[find(k)] = 1;
  // Each floating piece's walls: the wall, and +1 where the piece is its b side (raising the piece raises J).
  const pieces = new Map<number, { walls: { e: number; side: number }[]; pull: number; room: number; at: number }>();
  for (let e = 0; e < sign.length; e++) {
    // A wall within one piece does not move with it.
    if (!sign[e] || find(ends[2 * e]!) === find(ends[2 * e + 1]!)) continue;
    for (const [end, side] of [
      [ends[2 * e + 1]!, 1],
      [ends[2 * e]!, -1],
    ] as const) {
      const root = find(end);
      if (grounded[root]) continue;
      const piece = pieces.get(root) ?? { walls: [], pull: 0, room: Infinity, at: -1 };
      piece.walls.push({ e, side });
      pieces.set(root, piece);
    }
  }
  if (!pieces.size) return 0;
  for (let k = 0; k < n; k++) {
    const piece = pieces.get(find(k));
    if (!piece) continue;
    piece.pull += pull[k]!;
    if (cap[k]! - x[k]! < piece.room) {
      piece.room = cap[k]! - x[k]!;
      piece.at = k;
    }
  }
  const shift = new Map<number, number>();
  for (const [root, piece] of pieces) {
    // Each wall's cost turns from falling to rising at `t = −side · J`: the least cost is where the slope turns.
    const list = piece.walls.sort((p, q) => -p.side * J[p.e]! - -q.side * J[q.e]!);
    let slope = -piece.pull;
    for (const { e } of list) slope -= cost[e]!;
    let t = piece.room,
      lowest: (typeof list)[number] | null = null;
    for (const entry of list) {
      slope += 2 * cost[entry.e]!;
      if (slope < 0) continue;
      if (-entry.side * J[entry.e]! < piece.room) {
        t = -entry.side * J[entry.e]!;
        lowest = entry;
      }
      break;
    }
    shift.set(root, t);
    for (const { e, side } of list) J[e] = J[e]! + side * t;
    if (lowest) {
      J[lowest.e] = 0;
      sign[lowest.e] = 0;
    } else held[piece.at] = 1;
  }
  for (let k = 0; k < n; k++) {
    const t = shift.get(find(k));
    if (t !== undefined) x[k] = held[k] ? cap[k]! : x[k]! + t;
  }
  return pieces.size;
}

/**
 * One spacing's heights and walls by the primal–dual active set: the free nodes and the standing walls solved together
 * (each standing wall's cost a constant force `μ ℓ` against its way) by conjugate gradients, preconditioned by the
 * multigrid V-cycle of `cutLevel`'s operator and each wall's own share; then a held node the ground pulls down harder than its ribbons
 * pull it up let go, a free node above its cap held, a wall that crossed zero laid down and a fallen wall the ground
 * pushes harder than its cost stood up, until neither set changes (or for `MAXIMUM_STEPS` steps at most).
 */
function solveLevel(
  level: ClassLevel,
  cap: Float64Array,
  x: Float64Array,
  pull: Float64Array,
  walls: Walls,
  progress: (step: number) => void,
) {
  const { held } = level;
  const { terms, ends, cost, J, sign, diagonal } = walls;
  const n = x.length,
    m = J.length;
  const rH = new Float64Array(n),
    zH = new Float64Array(n),
    pH = new Float64Array(n),
    qH = new Float64Array(n);
  const rJ = new Float64Array(m),
    zJ = new Float64Array(m),
    pJ = new Float64Array(m),
    qJ = new Float64Array(m);
  let hierarchy: Hierarchy | null = null;
  // `q = K p` on the free nodes and standing walls, or everywhere.
  const multiply = (ph: Float64Array, pj: Float64Array, qh: Float64Array, qj: Float64Array, all = false) => {
    apply(level, ph, qh, all);
    applyWalls(terms, ph, pj, qh, qj, all ? null : held);
    if (!all) for (let e = 0; e < m; e++) if (!sign[e]) qj[e] = 0;
  };
  // `T diag(V, M⁻¹) Tᵀ` for `T` the standing walls' `J = J̃ + D H`, V the cut operator's V-cycle and M each wall's own
  // share.
  const tH = new Float64Array(n);
  const precondition_ = () => {
    tH.set(rH);
    for (let e = 0; e < m; e++)
      if (sign[e]) {
        tH[ends[2 * e + 1]!]! += rJ[e]!;
        tH[ends[2 * e]!]! -= rJ[e]!;
      }
    precondition(hierarchy!, tH, zH, qH);
    for (let e = 0; e < m; e++) zJ[e] = sign[e] ? rJ[e]! / diagonal[e]! + zH[ends[2 * e + 1]!]! - zH[ends[2 * e]!]! : 0;
  };
  const size = () => Math.max(largest(zH), largest(zJ));
  let changedHeld = Infinity,
    changed = 0;
  let settled = false;
  for (let step = 0; step < MAXIMUM_STEPS; step++) {
    progress(step);
    const anchored = anchorFloating(level, walls, x, cap, pull);
    // The coarse levels are rebuilt when the sets have changed much; for a few nodes the last ones serve.
    if (!hierarchy || anchored || changedHeld + changed > Math.max(REBUILD_SHARE * n, REBUILD_LEAST))
      hierarchy = buildHierarchy(cutLevel(level, walls));
    multiply(x, J, rH, rJ);
    for (let k = 0; k < n; k++) rH[k] = held[k] ? 0 : pull[k]! - rH[k]!;
    for (let e = 0; e < m; e++) rJ[e] = sign[e] ? -cost[e]! * sign[e]! - rJ[e]! : 0;
    precondition_();
    // While the sets still change, a solve only gains a factor of twenty; the last one is to the tolerance.
    const goal = settled ? TOLERANCE : Math.max(TOLERANCE, size() / 20);
    let rz = dot(rH, zH) + dot(rJ, zJ);
    pH.set(zH);
    pJ.set(zJ);
    for (let iteration = 0; iteration < MAXIMUM_ITERATIONS && size() > goal; iteration++) {
      multiply(pH, pJ, qH, qJ);
      const alpha = rz / (dot(pH, qH) + dot(pJ, qJ));
      for (let k = 0; k < n; k++) {
        x[k] = x[k]! + alpha * pH[k]!;
        rH[k] = rH[k]! - alpha * qH[k]!;
      }
      for (let e = 0; e < m; e++) {
        J[e] = J[e]! + alpha * pJ[e]!;
        rJ[e] = rJ[e]! - alpha * qJ[e]!;
      }
      precondition_();
      const next = dot(rH, zH) + dot(rJ, zJ);
      const beta = next / rz;
      rz = next;
      for (let k = 0; k < n; k++) pH[k] = zH[k]! + beta * pH[k]!;
      for (let e = 0; e < m; e++) pJ[e] = zJ[e]! + beta * pJ[e]!;
    }
    // The gradient everywhere: the held nodes' and fallen walls' multipliers.
    multiply(x, J, qH, qJ, true);
    changedHeld = 0;
    changed = 0;
    for (let k = 0; k < n; k++) {
      if (cap[k] === Infinity) continue;
      if (held[k]) {
        if (pull[k]! - qH[k]! < 0) {
          held[k] = 0;
          changedHeld++;
        }
      } else if (x[k]! > cap[k]!) {
        held[k] = 1;
        x[k] = cap[k]!;
        changedHeld++;
      }
    }
    for (let e = 0; e < m; e++) {
      if (sign[e]) {
        if (J[e]! * sign[e]! >= 0) continue;
        J[e] = 0;
        sign[e] = 0;
      } else {
        if (Math.abs(qJ[e]!) <= cost[e]!) continue;
        sign[e] = -Math.sign(qJ[e]!);
      }
      changed++;
    }
    if (!changed && !changedHeld) {
      if (goal === TOLERANCE) break;
      settled = true;
    }
  }
}

/**
 * The finer grid's walls from the coarser's: each finer side takes the wall of the nearest coarser side along the same
 * axis whose crossing lies within `WALL_REACH` finer spacings of its own (their mean where two are as near), or none.
 */
function finerWalls(coarse: RibbonSides, coarseJ: Float64Array, cnx: number, fine: RibbonSides, nx: number) {
  const J = new Float64Array(fine.codes.length);
  fine.codes.forEach((code, e) => {
    const k = code >> 1,
      axis = code & 1;
    // Where the side crosses, in finer spacings: along the edge's axis and across it.
    const along = (axis ? (k / nx) | 0 : k % nx) + fine.fraction[e]!,
      across = axis ? k % nx : (k / nx) | 0;
    let nearest = Infinity,
      sum = 0,
      found = 0;
    for (let line = Math.ceil((across - WALL_REACH) / 2); line <= Math.floor((across + WALL_REACH) / 2); line++)
      for (let step = Math.floor((along - WALL_REACH) / 2); step <= Math.floor((along + WALL_REACH) / 2); step++) {
        if (line < 0 || step < 0) continue;
        const index = sideIndex(coarse.codes, 2 * (axis ? step * cnx + line : line * cnx + step) + axis);
        if (index < 0) continue;
        const distance = Math.hypot(2 * (step + coarse.fraction[index]!) - along, 2 * line - across);
        if (distance > WALL_REACH || distance > nearest + 1e-9) continue;
        if (distance < nearest - 1e-9) {
          nearest = distance;
          sum = 0;
          found = 0;
        }
        sum += coarseJ[index]!;
        found++;
      }
    if (found) J[e] = sum / found;
  });
  return J;
}

/**
 * The coarser heights carried to every node of a finer grid as `prolong` carries them, each coarser node's height
 * counted across the finer walls between it and the node (as the walls' terms count it; a diagonal's two ways' mean).
 */
function prolongAcross(
  coarse: { nx: number; x: Float64Array },
  level: ClassLevel,
  sides: RibbonSides,
  J: Float64Array,
  out: Float64Array,
) {
  const { nx, nz } = level;
  const jumps = new Float32Array(2 * nx * nz);
  sides.codes.forEach((code, e) => (jumps[code] = J[e]!));
  // The rise from node u to its neighbour v across the wall between them.
  const across = (u: number, v: number) =>
    (v > u ? 1 : -1) * jumps[2 * Math.min(u, v) + (Math.abs(v - u) === 1 ? 0 : 1)]!;
  const px: number[] = [],
    pz: number[] = [];
  for (let j = 0; j < nz; j++) {
    const cz = parents(j, pz);
    for (let i = 0; i < nx; i++) {
      const cx = parents(i, px);
      const k = j * nx + i;
      let value = 0;
      for (let b = 0; b < cz; b++)
        for (let a = 0; a < cx; a++) {
          const fx = 2 * px[2 * a]!,
            fz = 2 * pz[2 * b]!;
          let height = coarse.x[pz[2 * b]! * coarse.nx + px[2 * a]!]!;
          if (fx < nx && fz < nz) {
            const p = fz * nx + fx,
              dx = i - fx,
              dz = (j - fz) * nx;
            if (dx && dz) height += (across(p, p + dx) + across(p + dx, k) + across(p, p + dz) + across(p + dz, k)) / 2;
            else if (dx || dz) height += across(p, k);
          }
          value += pz[2 * b + 1]! * px[2 * a + 1]! * height;
        }
      out[k] = value;
    }
  }
}

/** A coarser spacing's solution, which the next finer starts from. */
interface CoarserSolution {
  readonly nx: number;
  readonly x: Float64Array;
  readonly held: Uint8Array;
  /** Its nodes with a cap. */
  readonly capped: Uint8Array;
  readonly sides: RibbonSides;
  readonly walls: Float64Array;
}

/**
 * The terrain's heights and walls, coarse to fine; `progress` hears each step. Every node's height is below or at its
 * ribbons'. At each spacing the heights (by the active set) and the walls (by `settleWalls`) are solved in turn until
 * the walls stay.
 */
export function solveTerrain(
  problem: TerrainProblem,
  parameters: TerrainParameters,
  progress: (state: TerrainProgress) => void = () => {},
): Terrain {
  const { tension, lambda, wall } = parameters;
  // The spacings, finest first, and each one's grid and ribbon sides.
  const grids: { nx: number; nz: number; spacing: number; stride: number; sides: RibbonSides }[] = [
    { nx: problem.nx, nz: problem.nz, spacing: problem.spacing, stride: 1, sides: problem.sides },
  ];
  while (grids.at(-1)!.spacing * 2 <= START_SPACING && grids.at(-1)!.nx > DIRECT_SIZE) {
    const last = grids.at(-1)!;
    const nx = coarser(last.nx);
    grids.push({
      nx,
      nz: coarser(last.nz),
      spacing: last.spacing * 2,
      stride: last.stride * 2,
      sides: coarserSides(last.sides, last.nx, nx),
    });
  }
  let previous: CoarserSolution | null = null;
  for (let g = grids.length - 1; g >= 0; g--) {
    const grid = grids[g]!;
    const { nx, nz, stride, sides } = grid;
    const n = nx * nz;
    // The caps and pulls at this spacing: the finest grid's nodes it shares.
    const cap = new Float64Array(n).fill(Infinity);
    const pull = new Float64Array(n);
    const area = grid.spacing * grid.spacing;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const fx = i * stride,
          fz = j * stride;
        if (fx >= problem.nx || fz >= problem.nz) continue;
        const f = fz * problem.nx + fx;
        if (!problem.count[f]) continue;
        const k = j * nx + i;
        cap[k] = problem.low[f]!;
        pull[k] = lambda * area * problem.count[f]!;
      }
    const x = new Float64Array(n);
    const { rows, nonzero } = classRows(grid.spacing, tension);
    const level: ClassLevel = { kind: 'class', nx, nz, rows, nonzero, held: new Uint8Array(n) };
    // The walls, standing at first where the coarser's stand, and the heights carried across them.
    const J = previous
      ? finerWalls(previous.sides, previous.walls, previous.nx, sides, nx)
      : new Float64Array(sides.codes.length);
    if (previous) prolongAcross(previous, level, sides, J, x);
    // Held at first: at the start every ribbon node; then every one whose capped coarser neighbours were all held.
    const px: number[] = [],
      pz: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (cap[k] === Infinity) continue;
        let hold = true;
        if (previous) {
          const cx = parents(i, px),
            cz = parents(j, pz);
          for (let q = 0; q < cz; q++)
            for (let p = 0; p < cx; p++) {
              const c = pz[2 * q]! * previous.nx + px[2 * p]!;
              if (previous.capped[c] && !previous.held[c]) hold = false;
            }
        }
        if (!hold) continue;
        level.held[k] = 1;
        x[k] = cap[k]!;
      }
    const walls = createWalls(wallTerms(sides, nx, nz, grid.spacing, tension), sides, nx, wall, J);
    solveLevel(level, cap, x, pull, walls, (step) => progress({ spacing: grid.spacing, step }));
    const capped = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (x[k]! > cap[k]!) x[k] = cap[k]!;
      capped[k] = cap[k] === Infinity ? 0 : 1;
    }
    previous = { nx, x, held: level.held, capped, sides, walls: walls.J };
  }
  return { heights: Float32Array.from(previous!.x), walls: Float32Array.from(previous!.walls) };
}
