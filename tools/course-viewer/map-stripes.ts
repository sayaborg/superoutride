import { BAND_STRIDE } from './map-bands.js';
import { rasterizeRibbon, type MapRibbon } from './map-grid.js';
import { extendFields, type MapGrid } from './map-terrain.js';

/**
 * The course map's stripes and colors: a phase θ at every node, bright where `cos θ > 0`, and at every node the pair of
 * colors it alternates.
 *
 * On the ribbons' bands the phase is the band's (`mapBands`); elsewhere it follows a target gradient ω, the nearby road's
 * direction at the nearby stripes' period: the direction as a line field (`e^{2iα}`) and the period are carried smoothly
 * off the ribbons, and `ψ = e^{iθ}` minimises `Σ_edges |ψ_j − ρ_ij ψ_i|²` with ψ fixed on the bands, where `ρ_ij` turns
 * by `ω · (x_j − x_i)` and conjugates across an edge where the line field's chosen direction flips (Knöppel, Crane,
 * Pinkall and Schröder, Stripe Patterns on Surfaces, 2015). Where the field cannot close, ψ falls to zero: a small
 * branch point. Each pair's share is carried off the ribbons the same way, and every node takes the largest.
 */

/** Metres: the coarsest spacing the direction, period and pairs are carried over at. */
const FIELD_SPACING = 16;
/** A grid no longer than this along both axes is where the phase starts, coarse to fine. */
const COARSEST_SIZE = 65;
/** The conjugate gradients stop when ψ's next correction is this small. */
const TOLERANCE = 1e-3;
const MAXIMUM_ITERATIONS = 300;
/** Metres: the shortest period the stripes take. */
const SHORTEST_PERIOD = 0.5;

export interface Stripes {
  /** ψ at each node: its real and imaginary parts. */
  readonly psi: Float32Array;
  /** ω at each node: the phase's target gradient, radians per metre along x and z. */
  readonly omega: Float32Array;
  /** Each node's pair of colors. */
  readonly pair: Uint8Array;
}

/** The ribbons' stripes on the grid: what the lowest covering ribbon says at each node. */
function ribbonStripes(grid: MapGrid, ribbons: readonly MapRibbon[], bands: readonly Float64Array[]) {
  const n = grid.nx * grid.nz;
  const lowest = new Float32Array(n).fill(Infinity);
  const covered = new Uint8Array(n),
    banded = new Uint8Array(n),
    theta = new Float32Array(n),
    tangent = new Float32Array(2 * n),
    period = new Float32Array(n),
    pair = new Int16Array(n).fill(-1);
  ribbons.forEach((ribbon, r) => {
    const list = bands[r]!;
    // Each side's bands, in order: the first index of the right side's.
    let right = 0;
    while (right < list.length && list[right]! === 0) right += BAND_STRIDE;
    const find = (side: number, s: number) => {
      let lo = side === 0 ? 0 : right / BAND_STRIDE,
        hi = side === 0 ? right / BAND_STRIDE : list.length / BAND_STRIDE;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (list[mid * BAND_STRIDE + 1]! <= s) lo = mid + 1;
        else hi = mid;
      }
      const b = (lo - 1) * BAND_STRIDE;
      return b >= 0 && list[b]! === side && s <= list[b + 2]! ? b : -1;
    };
    rasterizeRibbon(grid, ribbon, (k, y, s, across, tx, tz) => {
      if (y >= lowest[k]!) return;
      lowest[k] = y;
      covered[k] = 1;
      tangent[2 * k] = tx;
      tangent[2 * k + 1] = tz;
      const b = find(across < 0.5 ? 0 : 1, s);
      banded[k] = b >= 0 ? 1 : 0;
      pair[k] = -1;
      if (b < 0) return;
      const start = list[b + 1]!,
        end = list[b + 2]!;
      theta[k] = list[b + 3]! + (Math.PI * (s - start)) / (end - start);
      period[k] = list[b + 4]!;
      pair[k] = list[b + 5]!;
    });
  });
  return { covered, banded, theta, tangent, period, pair };
}

/** The grid of every `stride`th node of `grid`. */
function subgrid(grid: Pick<MapGrid, 'nx' | 'nz' | 'spacing'>, stride: number) {
  return {
    nx: Math.floor((grid.nx - 1) / stride) + 1,
    nz: Math.floor((grid.nz - 1) / stride) + 1,
    spacing: grid.spacing * stride,
  };
}

/** Bilinear between a subgrid's nodes at fine node (`i`, `j`). */
function sampleSubgrid(values: Float64Array, coarse: { nx: number; nz: number }, stride: number, i: number, j: number) {
  const x = Math.min(i / stride, coarse.nx - 1),
    z = Math.min(j / stride, coarse.nz - 1);
  const i0 = Math.min(Math.floor(x), coarse.nx - 2),
    j0 = Math.min(Math.floor(z), coarse.nz - 2);
  const u = x - i0,
    v = z - j0;
  const k = j0 * coarse.nx + i0;
  return (
    (1 - v) * ((1 - u) * values[k]! + u * values[k + 1]!) +
    v * ((1 - u) * values[k + coarse.nx]! + u * values[k + coarse.nx + 1]!)
  );
}

/** One level of the phase's solution: its nodes' fixed values, directions and wave numbers, and its edges' turns. */
interface PhaseLevel {
  readonly nx: number;
  readonly nz: number;
  readonly spacing: number;
  /** Every how many finest nodes it takes one. */
  readonly stride: number;
  readonly held: Uint8Array;
  /** Each node's chosen direction (x, z) times its wave number: ω. */
  readonly omega: Float32Array;
  /** Each node's edge to the next node along x, then along z: the turn's cosine and sine, and whether it conjugates. */
  readonly turns: Float32Array;
  readonly flips: Uint8Array;
}

/** The turn from node `i` to node `j` a step `(dx, dz)` away: `ω_ij = ½ (ω_i ± ω_j) · step`, conjugating on a flip. */
function edgeTurns(level: Omit<PhaseLevel, 'turns' | 'flips'>): Pick<PhaseLevel, 'turns' | 'flips'> {
  const { nx, nz, spacing, omega } = level;
  const n = nx * nz;
  const turns = new Float32Array(4 * n),
    flips = new Uint8Array(2 * n);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      for (const along of [0, 1]) {
        const m = along === 0 ? k + 1 : k + nx;
        if (along === 0 ? i + 1 >= nx : j + 1 >= nz) continue;
        const flip = omega[2 * k]! * omega[2 * m]! + omega[2 * k + 1]! * omega[2 * m + 1]! < 0;
        const sign = flip ? -1 : 1;
        const turn = 0.5 * (omega[2 * k + along]! + sign * omega[2 * m + along]!) * spacing;
        turns[4 * k + 2 * along] = Math.cos(turn);
        turns[4 * k + 2 * along + 1] = Math.sin(turn);
        flips[2 * k + along] = flip ? 1 : 0;
      }
    }
  return { turns, flips };
}

/**
 * The sum over node k's neighbours of their ψ carried into its frame, `Σ_n T_nj ψ_n`, into `sum` (with the count):
 * from a lower neighbour by its edge's turn (then conjugation), from a higher one by the inverse of k's edge's turn.
 */
function carried(level: PhaseLevel, psi: Float32Array, i: number, j: number, k: number, sum: Float64Array) {
  const { nx, nz, turns, flips } = level;
  let re = 0,
    im = 0,
    degree = 0;
  for (let along = 0; along < 2; along++) {
    if (along === 0 ? i > 0 : j > 0) {
      const m = along === 0 ? k - 1 : k - nx;
      const c = turns[4 * m + 2 * along]!,
        s = turns[4 * m + 2 * along + 1]!;
      const a = psi[2 * m]!,
        b = psi[2 * m + 1]!;
      const y = s * a + c * b;
      re += c * a - s * b;
      im += flips[2 * m + along] ? -y : y;
      degree++;
    }
    if (along === 0 ? i + 1 < nx : j + 1 < nz) {
      const m = along === 0 ? k + 1 : k + nx;
      const c = turns[4 * k + 2 * along]!,
        s = turns[4 * k + 2 * along + 1]!;
      const a = psi[2 * m]!,
        b = flips[2 * k + along] ? -psi[2 * m + 1]! : psi[2 * m + 1]!;
      re += c * a + s * b;
      im += c * b - s * a;
      degree++;
    }
  }
  sum[0] = re;
  sum[1] = im;
  sum[2] = degree;
}

/** `out = scale · (Σ T ψ − deg ψ)` at the free nodes, zero at the held ones: `−L ψ` with `L ψ = deg ψ − Σ T ψ`. */
function gather(level: PhaseLevel, psi: Float32Array, out: Float32Array, scale: number) {
  const { nx, nz, held } = level;
  const sum = new Float64Array(3);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (held[k]) {
        out[2 * k] = 0;
        out[2 * k + 1] = 0;
        continue;
      }
      carried(level, psi, i, j, k, sum);
      out[2 * k] = scale * (sum[0]! - sum[2]! * psi[2 * k]!);
      out[2 * k + 1] = scale * (sum[1]! - sum[2]! * psi[2 * k + 1]!);
    }
}

/** One Gauss–Seidel sweep of `L z = r` over the free nodes, forward or backward (`carried`, written out). */
function sweep(level: PhaseLevel, z: Float32Array, r: Float32Array, forward: boolean) {
  const { nx, nz, held, turns, flips } = level;
  const n = nx * nz;
  for (let step = 0; step < n; step++) {
    const k = forward ? step : n - 1 - step;
    if (held[k]) continue;
    const j = (k / nx) | 0,
      i = k - j * nx;
    let re = r[2 * k]!,
      im = r[2 * k + 1]!,
      degree = 0;
    if (i > 0) {
      const m = k - 1;
      const c = turns[4 * m]!,
        s = turns[4 * m + 1]!,
        a = z[2 * m]!,
        b = z[2 * m + 1]!;
      re += c * a - s * b;
      im += flips[2 * m] ? -(s * a + c * b) : s * a + c * b;
      degree++;
    }
    if (j > 0) {
      const m = k - nx;
      const c = turns[4 * m + 2]!,
        s = turns[4 * m + 3]!,
        a = z[2 * m]!,
        b = z[2 * m + 1]!;
      re += c * a - s * b;
      im += flips[2 * m + 1] ? -(s * a + c * b) : s * a + c * b;
      degree++;
    }
    if (i + 1 < nx) {
      const m = k + 1;
      const c = turns[4 * k]!,
        s = turns[4 * k + 1]!,
        a = z[2 * m]!,
        b = flips[2 * k] ? -z[2 * m + 1]! : z[2 * m + 1]!;
      re += c * a + s * b;
      im += c * b - s * a;
      degree++;
    }
    if (j + 1 < nz) {
      const m = k + nx;
      const c = turns[4 * k + 2]!,
        s = turns[4 * k + 3]!,
        a = z[2 * m]!,
        b = flips[2 * k + 1] ? -z[2 * m + 1]! : z[2 * m + 1]!;
      re += c * a + s * b;
      im += c * b - s * a;
      degree++;
    }
    z[2 * k] = re / degree;
    z[2 * k + 1] = im / degree;
  }
}

const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += a[k]! * b[k]!;
  return sum;
};
const largest = (a: Float32Array) => {
  let most = 0;
  for (let k = 0; k < a.length; k++) most = Math.max(most, Math.abs(a[k]!));
  return most;
};

/** ψ's free nodes by conjugate gradients with a symmetric Gauss–Seidel preconditioner, from `psi`. */
function solvePhase(level: PhaseLevel, psi: Float32Array) {
  const n = 2 * level.nx * level.nz;
  const r = new Float32Array(n),
    z = new Float32Array(n),
    p = new Float32Array(n),
    q = new Float32Array(n);
  const precondition = () => {
    z.fill(0);
    sweep(level, z, r, true);
    sweep(level, z, r, false);
  };
  gather(level, psi, r, 1);
  precondition();
  let rz = dot(r, z);
  p.set(z);
  for (let iteration = 0; iteration < MAXIMUM_ITERATIONS && largest(z) > TOLERANCE; iteration++) {
    gather(level, p, q, -1);
    const alpha = rz / dot(p, q);
    for (let k = 0; k < n; k++) {
      psi[k] = psi[k]! + alpha * p[k]!;
      r[k] = r[k]! - alpha * q[k]!;
    }
    precondition();
    const next = dot(r, z);
    const beta = next / rz;
    rz = next;
    for (let k = 0; k < n; k++) p[k] = z[k]! + beta * p[k]!;
  }
}

/**
 * The stripes over the grid of the ribbons and their bands (`mapBands`); null where no ribbon has a band. `progress`
 * hears each spacing the phase is solved at.
 */
export function solveStripes(
  grid: MapGrid,
  ribbons: readonly MapRibbon[],
  bands: readonly Float64Array[],
  pairCount: number,
  progress: (spacing: number) => void = () => {},
): Stripes | null {
  const { nx, nz } = grid;
  const n = nx * nz;
  const fine = ribbonStripes(grid, ribbons, bands);
  if (!fine.banded.includes(1)) return null;
  // The direction's line field, the period and each pair's share, carried off the ribbons on a coarser grid.
  let fieldStride = 1;
  while (
    grid.spacing * fieldStride * 2 <= FIELD_SPACING &&
    (nz - 1) / (fieldStride * 2) >= 4 &&
    (nx - 1) / (fieldStride * 2) >= 4
  )
    fieldStride *= 2;
  const field = subgrid(grid, fieldStride);
  const m = field.nx * field.nz;
  const covered = new Uint8Array(m),
    banded = new Uint8Array(m);
  const doubled = [new Float64Array(m), new Float64Array(m)];
  const shares = [new Float64Array(m), ...Array.from({ length: pairCount }, () => new Float64Array(m))];
  for (let j = 0; j < field.nz; j++)
    for (let i = 0; i < field.nx; i++) {
      const c = j * field.nx + i,
        f = j * fieldStride * nx + i * fieldStride;
      if (!fine.covered[f]) continue;
      covered[c] = 1;
      const angle = 2 * Math.atan2(fine.tangent[2 * f + 1]!, fine.tangent[2 * f]!);
      doubled[0]![c] = Math.cos(angle);
      doubled[1]![c] = Math.sin(angle);
      if (!fine.banded[f]) continue;
      banded[c] = 1;
      shares[0]![c] = fine.period[f]!;
      shares[1 + fine.pair[f]!]![c] = 1;
    }
  extendFields(field, 1, covered, doubled);
  extendFields(field, 1, banded, shares);
  // Each node's direction, wave number and pair.
  const omega = new Float32Array(2 * n),
    pair = new Uint8Array(n);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let x: number, z: number;
      if (fine.covered[k]) {
        x = fine.tangent[2 * k]!;
        z = fine.tangent[2 * k + 1]!;
      } else {
        const angle =
          Math.atan2(
            sampleSubgrid(doubled[1]!, field, fieldStride, i, j),
            sampleSubgrid(doubled[0]!, field, fieldStride, i, j),
          ) / 2;
        x = Math.cos(angle);
        z = Math.sin(angle);
      }
      const period = fine.banded[k] ? fine.period[k]! : sampleSubgrid(shares[0]!, field, fieldStride, i, j);
      const wave = (2 * Math.PI) / Math.max(SHORTEST_PERIOD, period);
      omega[2 * k] = wave * x;
      omega[2 * k + 1] = wave * z;
      if (fine.banded[k]) pair[k] = fine.pair[k]!;
      else {
        let best = 0,
          most = -Infinity;
        for (let p = 0; p < pairCount; p++) {
          const share = sampleSubgrid(shares[1 + p]!, field, fieldStride, i, j);
          if (share > most) {
            most = share;
            best = p;
          }
        }
        pair[k] = best;
      }
    }
  // ψ coarse to fine: each level every other node of the next finer, started from the coarser one carried over.
  const strides = [1];
  while (Math.max(subgrid(grid, strides.at(-1)!).nx, subgrid(grid, strides.at(-1)!).nz) > COARSEST_SIZE)
    strides.push(strides.at(-1)! * 2);
  let psi: Float32Array | null = null;
  let previous: PhaseLevel | null = null;
  for (let l = strides.length - 1; l >= 0; l--) {
    const stride = strides[l]!;
    const size = subgrid(grid, stride);
    const count = size.nx * size.nz;
    const held = new Uint8Array(count),
      levelOmega = new Float32Array(2 * count),
      values = new Float32Array(2 * count);
    for (let j = 0; j < size.nz; j++)
      for (let i = 0; i < size.nx; i++) {
        const c = j * size.nx + i,
          f = j * stride * nx + i * stride;
        levelOmega[2 * c] = omega[2 * f]!;
        levelOmega[2 * c + 1] = omega[2 * f + 1]!;
        if (fine.banded[f]) {
          held[c] = 1;
          values[2 * c] = Math.cos(fine.theta[f]!);
          values[2 * c + 1] = Math.sin(fine.theta[f]!);
        }
      }
    const base = { ...size, stride, held, omega: levelOmega };
    const level: PhaseLevel = { ...base, ...edgeTurns(base) };
    if (psi && previous) carry(previous, psi, level, values);
    progress(level.spacing);
    solvePhase(level, values);
    psi = values;
    previous = level;
  }
  return { psi: psi!, omega, pair };
}

/**
 * The coarser level's ψ carried onto a finer level's free nodes: from each of its coarse neighbours, turned by that
 * neighbour's ω over the way between them (conjugated where their directions disagree), averaged by bilinear weights.
 */
function carry(coarse: PhaseLevel, psi: Float32Array, fine: PhaseLevel, out: Float32Array) {
  for (let j = 0; j < fine.nz; j++)
    for (let i = 0; i < fine.nx; i++) {
      const k = j * fine.nx + i;
      if (fine.held[k]) continue;
      let re = 0,
        im = 0,
        weight = 0;
      // The coarse neighbours: the one at the node, or the two (or four) about it.
      const across = i & 1 ? [i >> 1, (i >> 1) + 1] : [i >> 1],
        along = j & 1 ? [j >> 1, (j >> 1) + 1] : [j >> 1];
      for (const J of along)
        for (const I of across) {
          if (I >= coarse.nx || J >= coarse.nz) continue;
          const c = J * coarse.nx + I;
          const dx = (i - 2 * I) * fine.spacing,
            dz = (j - 2 * J) * fine.spacing;
          const turn = coarse.omega[2 * c]! * dx + coarse.omega[2 * c + 1]! * dz;
          const cos = Math.cos(turn),
            sin = Math.sin(turn);
          const a = psi[2 * c]!,
            b = psi[2 * c + 1]!;
          const x = cos * a - sin * b,
            y = sin * a + cos * b;
          const flip =
            coarse.omega[2 * c]! * fine.omega[2 * k]! + coarse.omega[2 * c + 1]! * fine.omega[2 * k + 1]! < 0;
          re += x;
          im += flip ? -y : y;
          weight++;
        }
      out[2 * k] = re / weight;
      out[2 * k + 1] = im / weight;
    }
}
