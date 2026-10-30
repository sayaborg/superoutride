/**
 * The grades' rule's measure ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Cameras and Measure): a read road, its grades on cell borders linear within a cell, seen by the reading camera on the
 * original's rows, against the original's screen frame by frame, both ways, each screen against its own level road. The
 * cost, its derivative, the look and the differences' Gauss–Newton matrix.
 */
import { romDiffers } from '../conversion-errors.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { RENDER_FAR_DEPTH_METERS } from '../../../src/view/camera.js';
import { ORIGINAL_SCREEN_ROWS } from './screen-pieces.js';

/** This game's screen rows: twice its horizon's row. */
const GAME_ROWS = 2 * CAMERA_DEFINITION.horizonRow;
/** The original's rows a row of this game's: a reading camera's rows on the original's. */
export const ORIGINAL_ROWS_A_ROW = ORIGINAL_SCREEN_ROWS / GAME_ROWS;
const SCALE = ORIGINAL_ROWS_A_ROW;
/** The read road's distance steps: this many of the original's rows apart on the reading camera's level road. */
const DISTANCE_STEP_ROWS = 0.2;
/** How far the read road is seen: as far as this game draws it. */
export const FAR = RENDER_FAR_DEPTH_METERS;
/** A hill frame: one where the original's road lies more than this many rows from its level road. */
const HILL_ROWS = 1;
/**
 * The originals' rows are whole steps of 1/8192 row ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Measure, Row steps), and the measure reads them on those steps: what lies below a step moves none of its choices. A
 * row more than a thousandth of a step from one is not an original's: the reading stops.
 */
const ROW_STEPS = 8192;
const ROW_STEP_SLACK = 1e-3;
function onRowSteps(rows: Float64Array): Float64Array {
  return rows.map((r) => {
    const steps = Math.round(r * ROW_STEPS);
    if (!(Math.abs(r * ROW_STEPS - steps) <= ROW_STEP_SLACK))
      throw romDiffers(`The original's row ${r} lies off its steps of 1/${ROW_STEPS} row`);
    return steps / ROW_STEPS;
  });
}

/** The original's screen, frame by frame. */
export interface ScreenFrames {
  /** Each frame's camera station, metres along the read road. */
  readonly cameras: Float64Array;
  /** Each frame's rows of the original's lines, near to far. */
  readonly rows: readonly Float64Array[];
  /** Each line's distance from the reading camera, metres, ascending. */
  readonly lineDistances: Float64Array;
  /** The original's level road's rows at its lines. */
  readonly levelRows: Float64Array;
  /** Each frame's weight in the cost; 1 where absent, 0 leaves a frame out. */
  readonly weights?: Float64Array;
}

/** The camera that reads the road: its focal length in this game's rows, its eye and its distance behind the player. */
export interface ReadingCamera {
  readonly focal: number;
  readonly eye: number;
  readonly behind: number;
  /** Whether it pitches with the grade under the player (this game's), or stays level (ENDURO RACER's). */
  readonly tilts: boolean;
}

/** This game's camera, the product camera at rest. */
export const GAME_CAMERA: ReadingCamera = Object.freeze({
  focal: CAMERA_DEFINITION.focalLength,
  eye: CAMERA_DEFINITION.height,
  behind: CAMERA_DEFINITION.focalLength / 40,
  tilts: true,
});

/** The rows of both ways' differences over the hill frames: the look, and its parts. */
export interface Look {
  /** Both ways, over the hill frames. */
  readonly both: number;
  /** Both ways, over every frame. */
  readonly all: number;
}

/** A road's measure against an original's screen, on `edges` + 1 cell borders `cell` metres apart. */
export interface Measure {
  readonly cell: number;
  /** The last cell border's index: the grades are `edges` + 1. */
  readonly edges: number;
  /** The frames whose original's road leaves its level road by more than a row, and are weighed. */
  readonly hillFrames: number;
  /** The cost (the squares summed, both ways) and its derivative by every border's grade. */
  cost(g: Float64Array): { readonly cost: number; readonly gradient: Float64Array };
  look(g: Float64Array): Look;
  /** JᵀJ of the differences by the borders' grades, the read road's weights held and hidden rows moving with the crest. */
  gaussNewton(g: Float64Array): Float64Array[];
}

/** Sparse rows: the weights of each border's grade in a height difference. */
interface Rows {
  readonly start: Int32Array;
  readonly column: Int32Array;
  readonly weight: Float64Array;
}

/** A height's weights on the borders' grades: the integral of the grade, linear in each cell, from 0 to s. */
function heightWeight(cell: number, edges: number, s: number, j: number): number {
  const at = Math.min(Math.max(s, 0), edges * cell);
  const k = Math.min(Math.floor(at / cell), edges - 1);
  const x = at - k * cell;
  let w = 0;
  if (j >= 1 && j <= k - 1) w += cell;
  if (j === 0 && k >= 1) w += cell / 2;
  if (j === k && k >= 1) w += cell / 2;
  if (j === k) w += x - (x * x) / (2 * cell);
  if (j === k + 1) w += (x * x) / (2 * cell);
  return w;
}

/** The weights of every border's grade in h(b) − h(a), a row for each pair. */
function heightRows(cell: number, edges: number, pairs: readonly (readonly [number, number])[]): Rows {
  const start = new Int32Array(pairs.length + 1);
  const column: number[] = [],
    weight: number[] = [];
  const border = (s: number) => Math.min(Math.floor(Math.min(Math.max(s, 0), edges * cell) / cell), edges - 1);
  pairs.forEach(([a, b], i) => {
    const ka = border(a),
      kb = border(b);
    for (let j = Math.min(ka, kb); j <= Math.max(ka, kb) + 1; j++) {
      const v = heightWeight(cell, edges, b, j) - heightWeight(cell, edges, a, j);
      if (v !== 0) {
        column.push(j);
        weight.push(v);
      }
    }
    start[i + 1] = column.length;
  });
  return { start, column: Int32Array.from(column), weight: Float64Array.from(weight) };
}

const rowDot = (rows: Rows, i: number, g: Float64Array) => {
  let s = 0;
  for (let q = rows.start[i]!; q < rows.start[i + 1]!; q++) s += rows.weight[q]! * g[rows.column[q]!]!;
  return s;
};

/** Linear interpolation in ascending `xs`, held at the ends. */
function interpolate(x: number, xs: Float64Array, ys: ArrayLike<number>): number {
  if (x <= xs[0]!) return ys[0]!;
  const last = xs.length - 1;
  if (x >= xs[last]!) return ys[last]!;
  let lo = 0,
    hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return ys[lo]! + ((x - xs[lo]!) / (xs[hi]! - xs[lo]!)) * (ys[hi]! - ys[lo]!);
}

/** A running least, near to far, of rows cut at the screen's bottom. */
function leastCut(rows: ArrayLike<number>): Float64Array {
  const out = new Float64Array(rows.length);
  let least = Infinity;
  for (let i = 0; i < rows.length; i++) out[i] = least = Math.min(least, Math.min(rows[i]!, ORIGINAL_SCREEN_ROWS));
  return out;
}

/** The original's rows: each whole row's first seen line, near to far (above every nearer line, above the screen's bottom). */
function rowLines(rows: Float64Array, distances: Float64Array): number[] {
  const out: number[] = [];
  const taken = new Set<number>();
  let nearer = ORIGINAL_SCREEN_ROWS;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k]!;
    if (r < nearer && distances[k]! <= FAR) {
      const whole = Math.floor(r);
      if (!taken.has(whole)) {
        taken.add(whole);
        out.push(k);
      }
    }
    nearer = Math.min(nearer, Math.min(r, ORIGINAL_SCREEN_ROWS));
  }
  return out;
}

/**
 * The measure of a read road over `frames` seen by `camera`, its grades on borders `cell` apart from the first frame's
 * camera to past the last's farthest step (the road level beyond).
 */
export function screenMeasure(frames: ScreenFrames, camera: ReadingCamera, cell: number): Measure {
  const { cameras, lineDistances } = frames;
  const rows = frames.rows.map(onRowSteps),
    levelRows = onRowSteps(frames.levelRows);
  const V = cameras.length;
  const weights = frames.weights ?? new Float64Array(V).fill(1);
  const edges = Math.ceil((cameras[V - 1]! + FAR + 2 * cell) / cell);
  const { focal: F, eye, behind } = camera;
  const bases = cameras.map((c) => c + behind);
  // The read road's rows: the level road's, and their change by the camera's pitch and the road's heights.
  const straight = (D: number) => SCALE * (CAMERA_DEFINITION.horizonRow + (F * eye) / D);
  // Even in 1/D from the nearest line to `FAR`, a step's rows on the reading camera's level road `DISTANCE_STEP_ROWS`.
  // (The steps are counted to 1/FAR less 1e-12 and taken, as an evenly spaced range is, from its first two.)
  const from = 1 / lineDistances[0]!,
    step = (DISTANCE_STEP_ROWS * GAME_ROWS) / ORIGINAL_SCREEN_ROWS / (F * eye),
    delta = from - step - from;
  const Dk = Float64Array.from(
    { length: Math.ceil((1 / FAR - 1e-12 - from) / -step) },
    (_, i) => 1 / (from + i * delta),
  );
  const K = Dk.length;
  const straightK = Dk.map(straight);
  // The original's rows: one a whole row, against the read road at its line's distance.
  const samples: { frame: number; D: number; difference: number; step: number }[] = [];
  const deviation = new Float64Array(V);
  const level = leastCut(levelRows);
  const seen = rows.map((ro, p) => {
    for (const k of rowLines(ro, lineDistances)) {
      const D = lineDistances[k]!;
      let j = 0;
      while (j + 1 < K && Dk[j + 1]! <= D) j++;
      samples.push({ frame: p, D, difference: ro[k]! - levelRows[k]!, step: j });
      deviation[p] = Math.max(deviation[p]!, Math.abs(ro[k]! - levelRows[k]!));
    }
    // What the original's road shows at each step, against its level road's.
    const shown = leastCut(ro);
    return Dk.map((D) => interpolate(D, lineDistances, shown) - interpolate(D, lineDistances, level));
  });
  const hill = Uint8Array.from(deviation, (d, p) => (d > HILL_ROWS && weights[p]! > 0 ? 1 : 0));
  const grid = heightRows(
    cell,
    edges,
    Array.from(
      { length: V * K },
      (_, i) => [bases[Math.floor(i / K)]!, cameras[Math.floor(i / K)]! + Dk[i % K]!] as const,
    ),
  );
  const lines = heightRows(
    cell,
    edges,
    samples.map((s) => [bases[s.frame]!, cameras[s.frame]! + s.D] as const),
  );
  const byFrame = Array.from({ length: V + 1 }, () => 0);
  samples.forEach((s) => byFrame[s.frame + 1]!++);
  for (let p = 0; p < V; p++) byFrame[p + 1]! += byFrame[p]!;

  /** The grade at the player's station and its weights on the borders k and k + 1; the camera's pitch. */
  const pose = (g: Float64Array, p: number) => {
    const s = bases[p]!;
    if (!(s > 0 && s < edges * cell)) return { k: 0, w0: 0, w1: 0, sin: 0, cos: 1, dth: camera.tilts ? -1 : 0 };
    const k = Math.min(Math.max(Math.floor(s / cell), 0), edges - 1);
    const t = Math.min(Math.max(s / cell - k, 0), 1);
    const grade = g[k]! * (1 - t) + g[k + 1]! * t;
    if (!camera.tilts) return { k, w0: 1 - t, w1: t, sin: 0, cos: 1, dth: 0 };
    const th = -Math.atan(grade);
    return { k, w0: 1 - t, w1: t, sin: Math.sin(th), cos: Math.cos(th), dth: -1 / (1 + grade * grade) };
  };
  const rowAt = (D: number, dh: number, sin: number, cos: number) =>
    straight(D) + SCALE * (-F * sin - (F / D) * dh * cos + (F / D) * behind * sin);
  const dRow = (D: number, dh: number, sin: number, cos: number) => ({
    a: SCALE * (-F * cos + (F / D) * dh * sin + (F / D) * behind * cos),
    b: -SCALE * (F / D) * cos,
  });

  /**
   * One frame both ways: calls `game(k, w, r)` for each step's rows and `original(i, a, seen)` for each original row,
   * with the steps' envelope's crest `arg`; returns the steps' rows.
   */
  function frame(g: Float64Array, p: number) {
    const { sin, cos } = pose(g, p);
    const y = new Float64Array(K),
      dh = new Float64Array(K),
      arg = new Int32Array(K),
      env = new Float64Array(K);
    let least = Infinity,
      at = 0;
    for (let k = 0; k < K; k++) {
      dh[k] = rowDot(grid, p * K + k, g);
      y[k] = rowAt(Dk[k]!, dh[k]!, sin, cos);
      if (y[k]! <= least) {
        least = y[k]!;
        at = k;
      }
      env[k] = least;
      arg[k] = at;
    }
    return { y, dh, arg, env, sin, cos };
  }

  function cost(g: Float64Array) {
    const gradient = new Float64Array(edges + 1);
    let total = 0;
    const coef = new Float64Array(K);
    for (let p = 0; p < V; p++) {
      const vw = weights[p]!;
      const { y, dh, arg, env, sin, cos } = frame(g, p);
      const { k: kb, w0, w1, dth } = pose(g, p);
      coef.fill(0);
      for (let k = 1; k < K; k++) {
        const w = Math.max(0, env[k - 1]! - y[k]!);
        const r = y[k]! - straightK[k]! - seen[p]![k]!;
        total += vw * w * r * r;
        if (w > 0) {
          coef[k]! += vw * (-r * r + 2 * w * r);
          coef[arg[k - 1]!]! += vw * r * r;
        }
      }
      let perView = 0;
      for (let i = byFrame[p]!; i < byFrame[p + 1]!; i++) {
        const s = samples[i]!;
        const dhs = rowDot(lines, i, g);
        const yo = rowAt(s.D, dhs, sin, cos);
        const visible = yo <= env[s.step]!;
        const a = (visible ? yo : env[s.step]!) - straight(s.D) - s.difference;
        total += vw * a * a;
        if (!visible) coef[arg[s.step]!]! += 2 * vw * a;
        else {
          const d = dRow(s.D, dhs, sin, cos);
          perView += 2 * vw * a * d.a;
          for (let q = lines.start[i]!; q < lines.start[i + 1]!; q++)
            gradient[lines.column[q]!]! += 2 * vw * a * d.b * lines.weight[q]!;
        }
      }
      for (let k = 0; k < K; k++) {
        if (coef[k] === 0) continue;
        const d = dRow(Dk[k]!, dh[k]!, sin, cos);
        perView += coef[k]! * d.a;
        const row = p * K + k;
        for (let q = grid.start[row]!; q < grid.start[row + 1]!; q++)
          gradient[grid.column[q]!]! += coef[k]! * d.b * grid.weight[q]!;
      }
      gradient[kb]! += perView * dth * w0;
      if (kb + 1 <= edges) gradient[kb + 1]! += perView * dth * w1;
    }
    return { cost: total, gradient };
  }

  function look(g: Float64Array): Look {
    let sqHill = 0,
      nHill = 0,
      sqAll = 0,
      nAll = 0;
    for (let p = 0; p < V; p++) {
      const { y, env, sin, cos } = frame(g, p);
      let sq = 0,
        n = 0;
      for (let k = 1; k < K; k++) {
        const w = Math.max(0, env[k - 1]! - y[k]!);
        const r = y[k]! - straightK[k]! - seen[p]![k]!;
        sq += w * r * r;
        n += w;
      }
      for (let i = byFrame[p]!; i < byFrame[p + 1]!; i++) {
        const s = samples[i]!;
        const yo = rowAt(s.D, rowDot(lines, i, g), sin, cos);
        const a = Math.min(yo, env[s.step]!) - straight(s.D) - s.difference;
        sq += a * a;
        n += 1;
      }
      sqAll += sq;
      nAll += n;
      if (hill[p]) {
        sqHill += sq;
        nHill += n;
      }
    }
    return { both: Math.sqrt(sqHill / nHill), all: Math.sqrt(sqAll / nAll) };
  }

  function gaussNewton(g: Float64Array): Float64Array[] {
    const H = Array.from({ length: edges + 1 }, () => new Float64Array(edges + 1));
    const add = (cols: number[], vals: number[]) => {
      for (let a = 0; a < cols.length; a++)
        for (let b = 0; b < cols.length; b++) H[cols[a]!]![cols[b]!]! += vals[a]! * vals[b]!;
    };
    const sq = new Float64Array(K);
    for (let p = 0; p < V; p++) {
      const vw = weights[p]!;
      const { y, dh, arg, env, sin, cos } = frame(g, p);
      const { k: kb, w0, w1, dth } = pose(g, p);
      sq.fill(0);
      for (let k = 1; k < K; k++) sq[k] = Math.max(0, env[k - 1]! - y[k]!) * vw;
      const visible: boolean[] = [];
      const dhs: number[] = [];
      for (let i = byFrame[p]!; i < byFrame[p + 1]!; i++) {
        const s = samples[i]!;
        dhs.push(rowDot(lines, i, g));
        const shown = rowAt(s.D, dhs.at(-1)!, sin, cos) <= env[s.step]!;
        visible.push(shown);
        // A hidden original row moves with the crest's step.
        if (!shown) sq[arg[s.step]!]! += vw;
      }
      const row = (a: number, b: number, rows: Rows, r: number, scale: number): [number[], number[]] => {
        const cols: number[] = [],
          vals: number[] = [];
        const put = (c: number, v: number) => {
          const at = cols.indexOf(c);
          if (at >= 0) vals[at]! += v;
          else {
            cols.push(c);
            vals.push(v);
          }
        };
        put(kb, scale * a * dth * w0);
        if (kb + 1 <= edges) put(kb + 1, scale * a * dth * w1);
        for (let q = rows.start[r]!; q < rows.start[r + 1]!; q++) put(rows.column[q]!, scale * b * rows.weight[q]!);
        return [cols, vals];
      };
      for (let k = 0; k < K; k++) {
        if (!(sq[k]! > 0)) continue;
        const d = dRow(Dk[k]!, dh[k]!, sin, cos);
        add(...row(d.a, d.b, grid, p * K + k, Math.sqrt(sq[k]!)));
      }
      visible.forEach((shown, n) => {
        if (!shown) return;
        const i = byFrame[p]! + n;
        const d = dRow(samples[i]!.D, dhs[n]!, sin, cos);
        add(...row(d.a, d.b, lines, i, Math.sqrt(vw)));
      });
    }
    return H;
  }

  let hillFrames = 0;
  for (const h of hill) hillFrames += h;
  return { cell, edges, hillFrames, cost, look, gaussNewton };
}

/** The heights at the borders of grades `g` from 0: the trapezoids of each cell. */
export function heightsOf(g: Float64Array, cell: number): Float64Array {
  const h = new Float64Array(g.length);
  for (let k = 1; k < g.length; k++) h[k] = h[k - 1]! + (cell * (g[k - 1]! + g[k]!)) / 2;
  return h;
}
