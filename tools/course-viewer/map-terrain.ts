/**
 * The course map's terrain: the heights H at a grid's nodes that minimise
 *
 *   E(H) = Σ [(1 − t) |∇²H|² + t |∇H|²] + λ Σ_ribbon n (Y − H),   H ≤ Y on every ribbon node,
 *
 * where ∇²H is the Hessian (the thin plate's bending, free at the grid's edges), Y the lowest covering ribbon's height,
 * n how many ribbons cover the node and each sum is over the grid's area. The problem is convex with one solution.
 *
 * It is solved coarse to fine: at each spacing from the coarsest of `START_SPACING` or less down to the grid's own, the
 * primal–dual active set method holds the ribbon nodes the coarser solution held at Y and solves the rest by conjugate
 * gradients preconditioned by a Galerkin multigrid V-cycle, until the held set stops changing.
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
}

export interface TerrainParameters {
  /** t: the membrane's share against the thin plate's, in [0, 1]. */
  readonly tension: number;
  /** λ, per metre: how hard each covering ribbon pulls the ground up to it. */
  readonly lambda: number;
  /** m: the ground's steepest slope (rise over run); 0 for none. */
  readonly slope: number;
}

export interface TerrainProgress {
  /** The active set's steps, or the slope limit's iterations. */
  readonly stage: 'terrain' | 'slopes';
  readonly spacing: number;
  readonly step: number;
}

/** The coarsest spacing the coarse-to-fine solution starts at, in metres. */
const START_SPACING = 8;
/** A grid no longer than this along both axes is solved directly. */
const DIRECT_SIZE = 33;
/** Metres: the conjugate gradients stop when the preconditioned residual, the next correction's estimate, is this small. */
const TOLERANCE = 1e-4;
const MAXIMUM_ITERATIONS = 400;
const MAXIMUM_STEPS = 60;
/** The share of a level's nodes (and the fewest nodes) whose change of held state rebuilds its coarse levels. */
const REBUILD_SHARE = 0.001;
const REBUILD_LEAST = 200;
/**
 * The slope limit's ADMM: its penalty ρ (against the membrane's 1), the share of the limit by which the ground's slopes
 * may still lie off the disc, and the most iterations.
 */
const SLOPE_RHO = 8;
const SLOPE_TOLERANCE = 0.01;
const SLOPE_ITERATIONS = 300;
/** Metres around a steep cell its window reaches in the first round (as far again each round after), and the rounds. */
const SLOPE_REACH = 24;
const SLOPE_ROUNDS = 3;

/**
 * A grid's operator at its own spacing: the energy's Hessian, whose row depends only on where its node lies relative
 * to the grid's edges, held at zero on `held` nodes.
 */
interface ClassLevel {
  readonly kind: 'class';
  readonly nx: number;
  readonly nz: number;
  /** Its rows and each class's nonzero offsets, which the slope limit's ADMM changes with its penalty. */
  rows: Float64Array;
  nonzero: readonly Int32Array[];
  readonly held: Uint8Array;
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
function classRows(spacing: number, tension: number, rho = 0): { rows: Float64Array; nonzero: Int32Array[] } {
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
      // The slope limit's augmented term, `ρ/2 · area · |∇H|²` over each cell's two triangles: each triangle's two
      // edges along x and z.
      if (rho > 0 && i + 1 < n && j + 1 < n) {
        add([i, j, -1, i + 1, j, 1], rho / 4);
        add([i, j, -1, i, j + 1, 1], rho / 4);
        add([i, j + 1, -1, i + 1, j + 1, 1], rho / 4);
        add([i + 1, j, -1, i + 1, j + 1, 1], rho / 4);
      }
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
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!all && held[k]) out[k] = 0;
        else if (i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2) edge(i, j, k);
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
    for (let row = 0; row < nz; row++) {
      const j = forward ? row : nz - 1 - row;
      for (let column = 0; column < nx; column++) {
        const i = forward ? column : nx - 1 - column;
        const k = j * nx + i;
        if (held[k]) continue;
        if (i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2) {
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
          ? Number(classOf(i, fine.nx) !== 2 || classOf(j, fine.nz) !== 2)
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
  const { levels } = hierarchy;
  const cycle = (l: number, rhs: Float64Array, solution: Float64Array, residual: Float64Array) => {
    const level = levels[l]!;
    solution.fill(0);
    if (l === levels.length - 1) {
      solveDirect(hierarchy.direct, rhs, solution);
      return;
    }
    smooth(level, solution, rhs, true);
    smooth(level, solution, rhs, true);
    apply(level, solution, residual);
    for (let k = 0; k < residual.length; k++) residual[k] = rhs[k]! - residual[k]!;
    const next = levels[l + 1]!;
    restrict(level, residual, next, hierarchy.rhs[l + 1]!);
    cycle(l + 1, hierarchy.rhs[l + 1]!, hierarchy.solution[l + 1]!, hierarchy.residual[l + 1]!);
    prolong(next, hierarchy.solution[l + 1]!, level, solution);
    smooth(level, solution, rhs, false);
    smooth(level, solution, rhs, false);
  };
  cycle(0, r, z, scratch);
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

/**
 * The highest the ground may stand on each ribbon node with no slope steeper than `slope` and no ribbon below it: the
 * lowest of the cones `low_r + slope · |x − x_r|` over the ribbon nodes r, each node's nearest cone found by carrying
 * the best source across the grid in sweeps both ways until none improves; without a slope limit, the ribbons' heights.
 * Off the ribbons it is infinite: the slope limit's ADMM keeps the ground there.
 */
function slopeCaps(problem: TerrainProblem, slope: number): Float64Array {
  const { nx, nz, spacing } = problem;
  const n = nx * nz;
  const cap = new Float64Array(n).fill(Infinity);
  const source = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++)
    if (problem.count[k]) {
      cap[k] = problem.low[k]!;
      source[k] = k;
    }
  if (!(slope > 0)) return cap;
  const offer = (k: number, from: number) => {
    const r = source[from]!;
    if (r < 0 || r === source[k]) return false;
    const dx = (k % nx) - (r % nx),
      dz = ((k / nx) | 0) - ((r / nx) | 0);
    const height = problem.low[r]! + slope * spacing * Math.hypot(dx, dz);
    if (!(height < cap[k]!)) return false;
    cap[k] = height;
    source[k] = r;
    return true;
  };
  for (let sweep = 0, changed = true; changed && sweep < 16; sweep++) {
    changed = false;
    const forward = sweep % 2 === 0;
    for (let step = 0; step < n; step++) {
      const k = forward ? step : n - 1 - step;
      const i = k % nx,
        j = (k / nx) | 0;
      // The neighbours already swept: behind along the row and in the row before.
      const d = forward ? -1 : 1;
      const behind = forward ? i > 0 : i < nx - 1,
        before = forward ? j > 0 : j < nz - 1,
        ahead = forward ? i < nx - 1 : i > 0;
      if (behind && offer(k, k + d)) changed = true;
      if (before) {
        if (offer(k, k + d * nx)) changed = true;
        if (behind && offer(k, k + d * nx + d)) changed = true;
        if (ahead && offer(k, k + d * nx - d)) changed = true;
      }
    }
  }
  for (let k = 0; k < n; k++) if (!problem.count[k]) cap[k] = Infinity;
  return cap;
}

/**
 * Each cell's two triangles, as the map draws them: (k, k + 1, k + nx) and (k + nx, k + nx + 1, k + 1). A triangle's
 * slope is its gradient (along x, along z): the first's from its edges from k, the second's from its edges to k + nx + 1.
 */
function triangleSlope(x: Float64Array, k: number, nx: number, second: boolean, spacing: number, out: number[]) {
  if (second) {
    out[0] = (x[k + nx + 1]! - x[k + nx]!) / spacing;
    out[1] = (x[k + nx + 1]! - x[k + 1]!) / spacing;
  } else {
    out[0] = (x[k + 1]! - x[k]!) / spacing;
    out[1] = (x[k + nx]! - x[k]!) / spacing;
  }
}

/** Whether a cell can move: any of its corners is not fixed. */
const cellFree = (fixed: Uint8Array, k: number, nx: number) =>
  !(fixed[k] && fixed[k + 1] && fixed[k + nx] && fixed[k + nx + 1]);

/**
 * An obstacle problem on a grid: the energy's operator at its spacing (with the slope limit's ADMM penalty ρ, if any),
 * each node's cap (infinite where it has none), the heights, and the nodes `fixed` where they are, never let go.
 */
interface Obstacle {
  readonly level: ClassLevel;
  readonly spacing: number;
  readonly tension: number;
  rho: number;
  readonly cap: Float64Array;
  readonly x: Float64Array;
  readonly fixed: Uint8Array;
  hierarchy: Hierarchy | null;
  readonly work: readonly [Float64Array, Float64Array, Float64Array, Float64Array];
}

function createObstacle(
  nx: number,
  nz: number,
  spacing: number,
  tension: number,
  rho: number,
  cap: Float64Array,
  x: Float64Array,
  fixed: Uint8Array,
): Obstacle {
  const n = nx * nz;
  const { rows, nonzero } = classRows(spacing, tension, rho);
  const level: ClassLevel = { kind: 'class', nx, nz, rows, nonzero, held: new Uint8Array(n) };
  for (let k = 0; k < n; k++) if (fixed[k]) level.held[k] = 1;
  const work = [new Float64Array(n), new Float64Array(n), new Float64Array(n), new Float64Array(n)] as const;
  return { level, spacing, tension, rho, cap, x, fixed, hierarchy: null, work };
}

/**
 * The primal–dual active set: the free nodes solved with the held ones at their caps, then a held node the ground pulls
 * down harder than its ribbons pull it up let go and a free node above its cap held, until the held set stays (or for
 * `MAXIMUM_STEPS` steps at most).
 */
function solveHeld(obstacle: Obstacle, pull: Float64Array, progress: (step: number) => void = () => {}) {
  const { level, cap, x, fixed } = obstacle;
  const [r, z, p, q] = obstacle.work;
  const n = x.length;
  let changed = obstacle.hierarchy ? 0 : Infinity;
  let settled = false;
  for (let step = 0; step < MAXIMUM_STEPS; step++) {
    progress(step);
    // The coarse levels are rebuilt when the held set has changed much; for a few nodes the last ones serve.
    if (!obstacle.hierarchy || changed > Math.max(REBUILD_SHARE * n, REBUILD_LEAST))
      obstacle.hierarchy = buildHierarchy(level);
    apply(level, x, r);
    for (let k = 0; k < n; k++) r[k] = level.held[k] ? 0 : pull[k]! - r[k]!;
    precondition(obstacle.hierarchy, r, z, q);
    // While the held set still changes, a solve only gains a factor of twenty; the last one is to the tolerance.
    const goal = settled ? TOLERANCE : Math.max(TOLERANCE, largest(z) / 20);
    conjugateGradients(level, obstacle.hierarchy, x, r, z, p, q, goal);
    apply(level, x, q, true);
    changed = 0;
    for (let k = 0; k < n; k++) {
      if (cap[k] === Infinity || fixed[k]) continue;
      if (level.held[k]) {
        if (pull[k]! - q[k]! < 0) {
          level.held[k] = 0;
          changed++;
        }
      } else if (x[k]! > cap[k]!) {
        level.held[k] = 1;
        x[k] = cap[k]!;
        changed++;
      }
    }
    if (!changed) {
      if (goal === TOLERANCE) break;
      settled = true;
    }
  }
}

/**
 * The slope limit by ADMM on an obstacle problem built with its penalty: each free cell's triangles' slopes G (on the
 * disc of radius `slope`) and scaled multipliers U, the ground solved with every triangle's slope pulled toward `G − U`
 * (`ρ/2 · area · |∇H − (G − U)|²`), then G projected from `∇H + U` and U grown by what the projection took off, until
 * the ground's slopes lie within `SLOPE_TOLERANCE` of the disc and G stays; ρ doubles or halves to keep the two
 * residuals within ten times of each other.
 */
function limitSlopes(obstacle: Obstacle, pull: Float64Array, slope: number, progress: () => void) {
  const { level, x, fixed, spacing } = obstacle;
  const { nx, nz } = level;
  const n = nx * nz;
  // Each cell's two triangles' G, then their U.
  const slopes = new Float32Array(8 * n);
  // The linear part of the penalty's gradient: `ρ · spacing / 2 · (G − U)` along each triangle's two edges.
  const lift = (out: Float64Array) => {
    out.set(pull);
    const weight = (obstacle.rho * spacing) / 2;
    // Each triangle's two edges: the first's from k along x and z, the second's to k + nx + 1.
    for (let j = 0; j + 1 < nz; j++)
      for (let i = 0; i + 1 < nx; i++) {
        const k = j * nx + i;
        if (!cellFree(fixed, k, nx)) continue;
        const at = 4 * k,
          multiplier = 4 * n + at;
        const a = weight * (slopes[at]! - slopes[multiplier]!),
          b = weight * (slopes[at + 1]! - slopes[multiplier + 1]!),
          c = weight * (slopes[at + 2]! - slopes[multiplier + 2]!),
          d = weight * (slopes[at + 3]! - slopes[multiplier + 3]!);
        out[k] = out[k]! - a - b;
        out[k + 1] = out[k + 1]! + a - d;
        out[k + nx] = out[k + nx]! + b - c;
        out[k + nx + 1] = out[k + nx + 1]! + c + d;
      }
  };
  const project = () => projectSlopes(x, slopes, fixed, nx, nz, spacing, slope);
  project();
  const lifted = new Float64Array(n);
  for (let iteration = 0; iteration < SLOPE_ITERATIONS; iteration++) {
    progress();
    lift(lifted);
    solveHeld(obstacle, lifted);
    const { primal, dual } = project();
    if (Math.max(primal, dual) <= slope * SLOPE_TOLERANCE) break;
    const factor = primal > 10 * dual ? 2 : dual > 10 * primal ? 0.5 : 1;
    if (factor === 1) continue;
    // A new ρ: the scaled multipliers keep their multiplier, and the operator and its coarse levels are rebuilt.
    obstacle.rho *= factor;
    for (let k = 4 * n; k < 8 * n; k++) slopes[k] = slopes[k]! / factor;
    const rows = classRows(spacing, obstacle.tension, obstacle.rho);
    level.rows = rows.rows;
    level.nonzero = rows.nonzero;
    obstacle.hierarchy = null;
  }
}

/**
 * The slope limit's ADMM step after the ground's: each free cell's triangles' slopes G (`slopes`: G, then U, two numbers
 * a triangle) projected onto the disc of radius `slope` from the ground's slopes plus their scaled multipliers U, and U
 * grown by what the projection took off. Returns the residuals: how far the ground's slopes lie from G (primal) and how
 * far G moved (dual).
 */
function projectSlopes(
  x: Float64Array,
  slopes: Float32Array,
  fixed: Uint8Array,
  nx: number,
  nz: number,
  spacing: number,
  slope: number,
) {
  const n = nx * nz;
  let primal = 0,
    dual = 0;
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      if (!cellFree(fixed, k, nx)) continue;
      for (let t = 0; t < 2; t++) {
        // The first triangle's slope from its edges from k, the second's from its edges to k + nx + 1.
        const gx = t ? (x[k + nx + 1]! - x[k + nx]!) / spacing : (x[k + 1]! - x[k]!) / spacing,
          gz = t ? (x[k + nx + 1]! - x[k + 1]!) / spacing : (x[k + nx]! - x[k]!) / spacing;
        const at = 4 * k + 2 * t,
          multiplier = 4 * n + at;
        const qx = gx + slopes[multiplier]!,
          qz = gz + slopes[multiplier + 1]!;
        const length = Math.sqrt(qx * qx + qz * qz);
        const scale = length > slope ? slope / length : 1;
        const px = qx * scale,
          pz = qz * scale;
        primal = Math.max(primal, Math.hypot(gx - px, gz - pz));
        dual = Math.max(dual, Math.hypot(px - slopes[at]!, pz - slopes[at + 1]!));
        slopes[at] = px;
        slopes[at + 1] = pz;
        slopes[multiplier] = slopes[multiplier]! + gx - px;
        slopes[multiplier + 1] = slopes[multiplier + 1]! + gz - pz;
      }
    }
  return { primal, dual };
}

/** The cells (by their first corner) with a triangle steeper than `slope` by more than `SLOPE_TOLERANCE` of it. */
function steepCells(x: Float64Array, nx: number, nz: number, spacing: number, slope: number): Uint8Array {
  const steep = new Uint8Array(nx * nz);
  const g = [0, 0];
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      for (let t = 0; t < 2; t++) {
        triangleSlope(x, k, nx, t === 1, spacing, g);
        if (Math.hypot(g[0]!, g[1]!) > slope * (1 + SLOPE_TOLERANCE)) steep[k] = 1;
      }
    }
  return steep;
}

/**
 * The slope limit where the ground breaks it: each group of steep cells, with `SLOPE_REACH` metres around it (more in
 * later rounds), solved by ADMM in its own window with every node outside the group, and a ring of two around the
 * window, fixed where it is: the plate reaches two nodes, so within the window the energy is the whole grid's.
 */
function limitSlopesAround(
  x: Float64Array,
  nx: number,
  nz: number,
  spacing: number,
  tension: number,
  cap: Float64Array,
  pull: Float64Array,
  slope: number,
  progress: () => void,
) {
  for (let round = 0; round < SLOPE_ROUNDS; round++) {
    const steep = steepCells(x, nx, nz, spacing, slope);
    if (!steep.includes(1)) return;
    // The nodes within the reach of a steep cell's corners.
    const reach = Math.ceil((SLOPE_REACH * (round + 1)) / spacing);
    const corners = new Uint8Array(nx * nz);
    for (let k = 0; k < steep.length; k++)
      if (steep[k]) corners[k] = corners[k + 1] = corners[k + nx] = corners[k + nx + 1] = 1;
    const near = dilate(dilate(corners, nx, nz, 1, reach), nx, nz, nx, reach);
    // Each group of near nodes in its own window.
    const seen = new Uint8Array(nx * nz);
    for (let start = 0; start < near.length; start++) {
      if (!near[start] || seen[start]) continue;
      const group: number[] = [start];
      seen[start] = 1;
      let i0 = nx,
        i1 = 0,
        j0 = nz,
        j1 = 0;
      for (let at = 0; at < group.length; at++) {
        const k = group[at]!;
        const i = k % nx,
          j = (k / nx) | 0;
        i0 = Math.min(i0, i);
        i1 = Math.max(i1, i);
        j0 = Math.min(j0, j);
        j1 = Math.max(j1, j);
        for (const m of [i > 0 ? k - 1 : -1, i + 1 < nx ? k + 1 : -1, j > 0 ? k - nx : -1, j + 1 < nz ? k + nx : -1])
          if (m >= 0 && near[m] && !seen[m]) {
            seen[m] = 1;
            group.push(m);
          }
      }
      i0 = Math.max(0, i0 - 2);
      j0 = Math.max(0, j0 - 2);
      i1 = Math.min(nx - 1, i1 + 2);
      j1 = Math.min(nz - 1, j1 + 2);
      const wx = i1 - i0 + 1,
        wz = j1 - j0 + 1;
      if (wx < 5 || wz < 5) continue;
      const m = wx * wz;
      const windowCap = new Float64Array(m),
        windowX = new Float64Array(m),
        windowPull = new Float64Array(m),
        fixed = new Uint8Array(m);
      for (let j = 0; j < wz; j++)
        for (let i = 0; i < wx; i++) {
          const w = j * wx + i,
            k = (j + j0) * nx + i + i0;
          windowX[w] = x[k]!;
          windowCap[w] = cap[k]!;
          windowPull[w] = pull[k]!;
          const inside = i >= 2 && j >= 2 && i < wx - 2 && j < wz - 2;
          fixed[w] = near[k] && (inside || i + i0 < 2 || j + j0 < 2 || i + i0 >= nx - 2 || j + j0 >= nz - 2) ? 0 : 1;
        }
      const obstacle = createObstacle(wx, wz, spacing, tension, SLOPE_RHO, windowCap, windowX, fixed);
      for (let w = 0; w < m; w++) if (!fixed[w] && windowX[w]! >= windowCap[w]!) obstacle.level.held[w] = 1;
      limitSlopes(obstacle, windowPull, slope, progress);
      for (let j = 0; j < wz; j++)
        for (let i = 0; i < wx; i++) if (!fixed[j * wx + i]) x[(j + j0) * nx + i + i0] = windowX[j * wx + i]!;
    }
  }
}

/** A coarser spacing's solution, which the next finer starts from. */
interface CoarserSolution {
  readonly nx: number;
  readonly x: Float64Array;
  readonly held: Uint8Array;
  /** Its nodes with a finite cap. */
  readonly capped: Uint8Array;
}

/**
 * The terrain's heights, coarse to fine; `progress` hears each step. Every node's height is below or at its ribbons'.
 * With a slope limit, the ribbons' caps are its cones, and on the finest grid the ADMM keeps every triangle within it.
 */
export function solveTerrain(
  problem: TerrainProblem,
  parameters: TerrainParameters,
  progress: (state: TerrainProgress) => void = () => {},
): Float32Array {
  const { tension, lambda, slope } = parameters;
  const caps = slopeCaps(problem, slope);
  // The spacings, finest first, and each one's grid.
  const grids: { nx: number; nz: number; spacing: number; stride: number }[] = [
    { nx: problem.nx, nz: problem.nz, spacing: problem.spacing, stride: 1 },
  ];
  while (grids.at(-1)!.spacing * 2 <= START_SPACING && Math.min(grids.at(-1)!.nx, grids.at(-1)!.nz) > 2 * DIRECT_SIZE) {
    const last = grids.at(-1)!;
    grids.push({ nx: coarser(last.nx), nz: coarser(last.nz), spacing: last.spacing * 2, stride: last.stride * 2 });
  }
  let previous: CoarserSolution | null = null;
  for (let g = grids.length - 1; g >= 0; g--) {
    const grid = grids[g]!;
    const { nx, nz, stride } = grid;
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
        const k = j * nx + i;
        cap[k] = caps[f]!;
        pull[k] = lambda * area * problem.count[f]!;
      }
    const x = new Float64Array(n);
    const obstacle = createObstacle(nx, nz, grid.spacing, tension, 0, cap, x, new Uint8Array(n));
    if (previous) prolong(previous, previous.x, obstacle.level, x, true);
    // Held at first: at the start every ribbon node; then every capped node whose capped coarser neighbours were all
    // held.
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
        obstacle.level.held[k] = 1;
        x[k] = cap[k]!;
      }
    solveHeld(obstacle, pull, (step) => progress({ stage: 'terrain', spacing: grid.spacing, step }));
    if (g === 0 && slope > 0) {
      let iterations = 0;
      limitSlopesAround(x, nx, nz, grid.spacing, tension, cap, pull, slope, () =>
        progress({ stage: 'slopes', spacing: grid.spacing, step: iterations++ }),
      );
    }
    const capped = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (x[k]! > cap[k]!) x[k] = cap[k]!;
      capped[k] = cap[k] === Infinity ? 0 : 1;
    }
    previous = { nx, x, held: obstacle.level.held, capped };
  }
  return Float32Array.from(previous!.x);
}
