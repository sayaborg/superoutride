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
}

export interface TerrainProgress {
  readonly spacing: number;
  readonly step: number;
  readonly held: number;
}

/** The coarsest spacing the coarse-to-fine solution starts at, in metres. */
const START_SPACING = 8;
/** A grid no longer than this along both axes is solved directly. */
const DIRECT_SIZE = 65;
/** Metres: the conjugate gradients stop when the preconditioned residual, the next correction's estimate, is this small. */
const TOLERANCE = 1e-4;
const MAXIMUM_ITERATIONS = 400;
const MAXIMUM_STEPS = 60;
/** The share of a level's nodes whose change of held state rebuilds its coarse levels. */
const REBUILD_SHARE = 0.001;

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
 * The terrain's heights, coarse to fine; `progress` hears each step. Every node's height is below or at its ribbons'.
 */
export function solveTerrain(
  problem: TerrainProblem,
  parameters: TerrainParameters,
  progress: (state: TerrainProgress) => void = () => {},
): Float32Array {
  const { tension, lambda } = parameters;
  // The spacings, finest first, and each one's grid.
  const grids: { nx: number; nz: number; spacing: number; stride: number }[] = [
    { nx: problem.nx, nz: problem.nz, spacing: problem.spacing, stride: 1 },
  ];
  while (grids.at(-1)!.spacing * 2 <= START_SPACING && Math.min(grids.at(-1)!.nx, grids.at(-1)!.nz) > 2 * DIRECT_SIZE) {
    const last = grids.at(-1)!;
    grids.push({ nx: coarser(last.nx), nz: coarser(last.nz), spacing: last.spacing * 2, stride: last.stride * 2 });
  }
  let previous: { nx: number; x: Float64Array; released: Uint8Array } | null = null;
  for (let g = grids.length - 1; g >= 0; g--) {
    const grid = grids[g]!;
    const { nx, nz, stride } = grid;
    const n = nx * nz;
    // The ribbons at this spacing: the finest grid's nodes it shares.
    const low = new Float64Array(n);
    const pull = new Float64Array(n);
    const ribbon = new Uint8Array(n);
    const area = grid.spacing * grid.spacing;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const fx = i * stride,
          fz = j * stride;
        if (fx >= problem.nx || fz >= problem.nz) continue;
        const f = fz * problem.nx + fx;
        const count = problem.count[f]!;
        if (!count) continue;
        const k = j * nx + i;
        ribbon[k] = 1;
        low[k] = problem.low[f]!;
        pull[k] = lambda * area * count;
      }
    const { rows, nonzero } = classRows(grid.spacing, tension);
    const level: ClassLevel = { kind: 'class', nx, nz, rows, nonzero, held: new Uint8Array(n) };
    const x = new Float64Array(n);
    if (previous) prolong(previous, previous.x, level, x, true);
    // Held at first: every ribbon node but those next to a ribbon node the coarser solution let go.
    const px: number[] = [],
      pz: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!ribbon[k]) continue;
        let free = false;
        if (previous) {
          const cx = parents(i, px),
            cz = parents(j, pz);
          for (let q = 0; q < cz; q++)
            for (let p = 0; p < cx; p++) if (previous.released[pz[2 * q]! * previous.nx + px[2 * p]!]) free = true;
        }
        if (free) continue;
        level.held[k] = 1;
        x[k] = low[k]!;
      }
    const r = new Float64Array(n),
      z = new Float64Array(n),
      p = new Float64Array(n),
      q = new Float64Array(n);
    let hierarchy: Hierarchy | null = null;
    let changed = Infinity;
    let settled = false;
    for (let step = 0; step < MAXIMUM_STEPS; step++) {
      let heldCount = 0;
      for (let k = 0; k < n; k++) heldCount += level.held[k]!;
      progress({ spacing: grid.spacing, step, held: heldCount });
      // Solve for the free nodes with the held ones at their ribbons' heights. The coarse levels are rebuilt when the
      // held set has changed much; for a few nodes the last ones serve.
      if (!hierarchy || changed > REBUILD_SHARE * n) hierarchy = buildHierarchy(level);
      apply(level, x, r);
      for (let k = 0; k < n; k++) r[k] = level.held[k] ? 0 : pull[k]! - r[k]!;
      precondition(hierarchy, r, z, q);
      let rz = dot(r, z);
      p.set(z);
      // While the held set still changes, a solve only gains a factor of twenty; the last one is to the tolerance.
      const goal = settled ? TOLERANCE : Math.max(TOLERANCE, largest(z) / 20);
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
      // The held nodes' multipliers: a held node the ground pulls down harder than its ribbons pull it up is let go,
      // and a free ribbon node above its ribbon is held.
      apply(level, x, q, true);
      changed = 0;
      for (let k = 0; k < n; k++) {
        if (!ribbon[k]) continue;
        if (level.held[k]) {
          if (pull[k]! - q[k]! < 0) {
            level.held[k] = 0;
            changed++;
          }
        } else if (x[k]! > low[k]!) {
          level.held[k] = 1;
          x[k] = low[k]!;
          changed++;
        }
      }
      if (!changed) {
        if (goal === TOLERANCE) break;
        settled = true;
      }
    }
    for (let k = 0; k < n; k++) if (ribbon[k] && x[k]! > low[k]!) x[k] = low[k]!;
    const released = new Uint8Array(n);
    for (let k = 0; k < n; k++) released[k] = ribbon[k]! & (level.held[k]! ^ 1);
    previous = { nx, x, released };
  }
  return Float32Array.from(previous!.x);
}
