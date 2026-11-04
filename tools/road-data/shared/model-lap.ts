/**
 * A lap on its model ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)): a curve table's
 * lap, each run's intervals one factor longer or shorter and its corners at the course's turn scale, closed nearest its
 * model; how such a lap is laid on its model and measured, and the procedure that solves it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireInput } from '../../authoring/authoring-error.js';
import { contractUnmet } from './conversion-errors.js';
import { curveRuns, type CurveInterval, type CurveRun } from './curve-plan.js';
import type { CourseModel } from './course-models.js';
import {
  CEILING,
  constrainedLeastSquares,
  DAMPING,
  FALL,
  FLOOR,
  GROW,
  RESTORED,
  RESTORES,
  solveLinear,
  type Linearized,
} from './least-squares.js';

/** What a lap on its model is solved from: its curve table from its start, its model, its road's width and least radius. */
export interface LapInputs {
  readonly values: readonly number[];
  readonly model: CourseModel;
  readonly roadWidth: number;
  readonly leastLaneRadius: number;
}

/**
 * A lap's answer: its turn scale, where its start lies on its model (metres from its start line) and its runs' factors,
 * doublings, in its runs' order.
 */
export interface LapAnswer {
  readonly turnScale: number;
  readonly start: number;
  readonly factors: readonly number[];
}

/**
 * The SHA-256 of what a lap is solved from: its table's bytes, its model's geometry, its road's width and least radius,
 * and the procedure's numbers (`PROCEDURE`), so that an answer solved by another rule or procedure is stale.
 */
export function lapDigest(inputs: LapInputs): string {
  const table = Buffer.from(Int8Array.from(inputs.values).buffer).toString('hex');
  return createHash('sha256')
    .update(
      JSON.stringify({
        table,
        model: inputs.model.geometry,
        roadWidth: inputs.roadWidth,
        leastLaneRadius: inputs.leastLaneRadius,
        procedure: PROCEDURE,
      }),
    )
    .digest('hex');
}

/** How closed a lap must be: its heading, radians, and its position and length, metres. */
const CLOSED_HEADING = 1e-9;
const CLOSED_PLACE = 1e-6;
/** The weights of the runs' changes of length, heaviest first; the start is solved from the weight `FREE_START` on. */
const WEIGHTS = [64, 16, 4, 2, 1] as const;
const FREE_START = 2;
/** The margin the separations keep while a lap is solved, road widths, and their stiffness each round. */
const MARGIN = 1e-2;
const SEPARATION_STIFF = [3, 10, 30, 100] as const;
/** A pair of ends is held apart in a round where the lap holds them within this many road widths. */
const NEAR = 3;
/** The turn scale's grid and its rounds of refining, each a fifth of the last's step over two of its steps. */
const SCALE_GRID = { from: 0.15, to: 2, step: 0.05 } as const;
const REFINE_ROUNDS = 2;
const SOLVER = { iterations: 200, costTolerance: 1e-12 } as const;
/** The crossings' polylines: no chord longer than this, metres. */
const CHORD = 2;
/** The last closing's Newton's steps, and how near 0 its closure is brought, road widths. */
const CLOSE_ROUNDS = 8;
const CLOSED_EXACT = 1e-12;
/** Each refining round's step, a share of the last's, and its steps either side of the best. */
const REFINE = { share: 5, steps: 10 } as const;
/** The grid's slack at its last turn scale. */
const GRID_SLACK = 1e-9;

/**
 * The procedure's numbers, every one an answer depends on beside its inputs, and the two terms it weighs; the answers'
 * digest holds them.
 */
const PROCEDURE = {
  terms: 'distances mean + changes sum',
  CLOSED_HEADING,
  CLOSED_PLACE,
  WEIGHTS,
  FREE_START,
  MARGIN,
  SEPARATION_STIFF,
  NEAR,
  SCALE_GRID,
  REFINE_ROUNDS,
  REFINE,
  GRID_SLACK,
  SOLVER,
  CHORD,
  CLOSE_ROUNDS,
  CLOSED_EXACT,
  leastSquares: { DAMPING, GROW, FALL, FLOOR, CEILING, RESTORED, RESTORES },
};

/** An end's derivatives by one variable: its place, distance along and heading. */
interface Derivative {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly s: Float64Array;
  readonly h: Float64Array;
}

/** A lap laid: its intervals' ends (the first its start), their distances along it and headings, and their derivatives. */
interface Laid {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly s: Float64Array;
  readonly h: Float64Array;
  /** By each variable, the runs' doublings then the start. */
  readonly d?: readonly Derivative[];
}

/** A pair of the lap's ends held apart, and its model points' direction, the earlier's from the later's. */
interface Pair {
  readonly i: number;
  readonly j: number;
  readonly ux: number;
  readonly uy: number;
}

/** A stage's problem: its turn scale, its weight of the changes, and what it holds. */
interface Stage {
  readonly scale: number;
  readonly weight: number;
  /** The start held there, else free. */
  readonly held?: number;
  /** The headings fitted, else the places. */
  readonly headings?: boolean;
  readonly pairs?: readonly Pair[];
  readonly stiff?: number;
}

const arrays = (n: number) =>
  [0, 0, 0, 0].map(() => new Float64Array(n)) as [Float64Array, Float64Array, Float64Array, Float64Array];

/** A curve table's lap on its model: its runs, a value's curvature at turn scale 1, and its laying. */
class ModelLap {
  readonly runs: readonly CurveRun[];
  /** Each interval's run. */
  readonly runOf: Int32Array;
  readonly n: number;
  readonly mean: number;
  /** A value's curvature at turn scale 1, a metre: the table's turns' sum of magnitudes at its mean is its model's. */
  readonly unit: number;
  constructor(readonly inputs: LapInputs) {
    const { values, model } = inputs;
    this.n = values.length;
    this.mean = model.length / this.n;
    this.runs = curveRuns(values);
    this.runOf = new Int32Array(this.n);
    this.runs.forEach((run, k) => {
      for (let j = 0; j < run.count; j++) this.runOf[(run.from + j) % this.n] = k;
    });
    const modelTurn = model.path.elements.reduce((sum, e) => sum + Math.abs(e.turn), 0);
    this.unit = modelTurn / values.reduce((sum, v) => sum + Math.abs(v), 0) / this.mean;
  }

  /** The tightest radius at turn scale `scale`, whatever the runs' lengths. */
  tightest(scale: number): number {
    return 1 / (scale * this.unit * Math.max(...this.inputs.values.map(Math.abs)));
  }

  /** The intervals as laid at `answer`: their values and lengths, and the curve plan's scale, radians a value a metre. */
  intervals(answer: LapAnswer): { intervals: CurveInterval[]; scale: number } {
    const factors = answer.factors.map((a) => 2 ** a);
    return {
      intervals: this.inputs.values.map((value, i) => ({ value, length: this.mean * factors[this.runOf[i]!]! })),
      scale: answer.turnScale * this.unit,
    };
  }

  /** The model `u` metres from its start line, counted on round its loop: its point, heading and curvature. */
  model(u: number) {
    const { length, turns, path } = this.inputs.model;
    const laps = Math.floor(u / length);
    const at = u - laps * length;
    const elements = path.elements;
    let [lo, hi] = [0, elements.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (elements[mid]!.start <= at) lo = mid;
      else hi = mid - 1;
    }
    const pose = path.pose(at);
    const e = elements[lo]!;
    return { x: pose.x, y: pose.y, heading: pose.heading + 2 * Math.PI * turns * laps, curvature: e.turn / e.length };
  }

  /**
   * The lap laid at `p` (its runs' doublings, then where its start lies on its model) at turn scale `scale`, from its
   * start on its model's heading there; with `derivatives`, the ends' derivatives by each of `p`.
   */
  lay(p: ArrayLike<number>, scale: number, derivatives = false): Laid {
    const { n, mean } = this;
    const runs = this.runs.length;
    const values = this.inputs.values;
    const start = this.model(p[runs]!);
    const [x, y, s, h] = arrays(n + 1);
    [x[0], y[0], h[0]] = [start.x, start.y, start.heading];
    const d = derivatives
      ? Array.from({ length: runs + 1 }, () => {
          const [dx, dy, ds, dh] = arrays(n + 1);
          return { x: dx, y: dy, s: ds, h: dh };
        })
      : undefined;
    // Each run's sums over its intervals before an end: ℓ e^{iθ} at their ends, ℓκ, ℓκ P at their ends, and ℓ.
    const sums = Array.from({ length: d ? runs : 0 }, () => new Float64Array(6));
    for (let i = 0; i < n; i++) {
      const r = this.runOf[i]!;
      const length = mean * 2 ** p[r]!;
      const curvature = scale * this.unit * values[i]!;
      const half = (curvature * length) / 2;
      const chord = Math.abs(half) < 1e-9 ? length : (length * Math.sin(half)) / half;
      x[i + 1] = x[i]! + chord * Math.cos(h[i]! + half);
      y[i + 1] = y[i]! + chord * Math.sin(h[i]! + half);
      s[i + 1] = s[i]! + length;
      h[i + 1] = h[i]! + 2 * half;
      if (!d) continue;
      const sum = sums[r]!;
      sum[0] = sum[0]! + length * Math.cos(h[i + 1]!);
      sum[1] = sum[1]! + length * Math.sin(h[i + 1]!);
      sum[2] = sum[2]! + length * curvature;
      sum[3] = sum[3]! + length * curvature * x[i + 1]!;
      sum[4] = sum[4]! + length * curvature * y[i + 1]!;
      sum[5] = sum[5]! + length;
      // ∂P/∂ℓ_j = e^{iθ_{j+1}} + iκ_j (P − P_{j+1}), and ∂ℓ_j/∂a = ℓ_j ln 2.
      for (let q = 0; q < runs; q++) {
        const [ax, ay, b, cx, cy, l] = sums[q]!;
        const dq = d[q]!;
        dq.x[i + 1] = Math.LN2 * (ax! - (y[i + 1]! * b! - cy!));
        dq.y[i + 1] = Math.LN2 * (ay! + (x[i + 1]! * b! - cx!));
        dq.s[i + 1] = Math.LN2 * l!;
        dq.h[i + 1] = Math.LN2 * b!;
      }
    }
    if (d) {
      // The start moved along its model: the lap moved with it and turned by its model's heading about it.
      const ds = d[runs]!;
      const [c, sn, k] = [Math.cos(start.heading), Math.sin(start.heading), start.curvature];
      for (let i = 0; i <= n; i++) {
        ds.x[i] = c - k * (y[i]! - start.y);
        ds.y[i] = sn + k * (x[i]! - start.x);
        ds.h[i] = k;
      }
    }
    return { x, y, s, h, ...(d ? { d } : {}) };
  }

  /**
   * What the lap must meet exactly, road widths: its turning its model's and its length its model's, and with `place`
   * its end at its start; and their derivatives where it was laid with them.
   */
  closure(laid: Laid, place = true): { values: Float64Array; columns?: Float64Array[] } {
    const { n } = this;
    const { roadWidth: width, model } = this.inputs;
    const turn = model.length / (2 * Math.PI * width);
    const count = place ? 4 : 2;
    const values = Float64Array.from(
      [
        (laid.h[n]! - laid.h[0]! - 2 * Math.PI * model.turns) * turn,
        (laid.s[n]! - model.length) / width,
        (laid.x[n]! - laid.x[0]!) / width,
        (laid.y[n]! - laid.y[0]!) / width,
      ].slice(0, count),
    );
    const columns = laid.d?.map((dk) =>
      Float64Array.from(
        [
          (dk.h[n]! - dk.h[0]!) * turn,
          dk.s[n]! / width,
          (dk.x[n]! - dk.x[0]!) / width,
          (dk.y[n]! - dk.y[0]!) / width,
        ].slice(0, count),
      ),
    );
    return { values, ...(columns ? { columns } : {}) };
  }

  /**
   * A stage's problem: with `headings`, the ends' headings' departures from their model's as far along (a radian as a
   * road's width) with the lap's turning and length closed; else the ends' distances from their model's points as far
   * along, road widths, the separations `pairs` wanted at the stiffness `stiff`, and the whole closure; and the runs'
   * doublings at the weight. Its variables are the runs' doublings and, where it is free, the start.
   */
  problem(stage: Stage) {
    const { n } = this;
    const runs = this.runs.length;
    const { roadWidth: width } = this.inputs;
    const { scale, weight, held, headings = false, pairs = [], stiff = 0 } = stage;
    const free = held === undefined ? runs + 1 : runs;
    const p = (x: Float64Array) => (held === undefined ? x : Float64Array.from([...x, held]));
    const each = 1 / Math.sqrt(n);
    const w = Math.sqrt(weight);
    const fits = headings ? n : 2 * n;
    const residuals: Linearized = (x, jacobian) => {
      const q = p(x);
      const laid = this.lay(q, scale, jacobian);
      const size = fits + runs + pairs.length;
      const values = new Float64Array(size);
      const columns = jacobian ? Array.from({ length: free }, () => new Float64Array(size)) : undefined;
      for (let i = 1; i <= n; i++) {
        const t = this.model(q[runs]! + laid.s[i]!);
        if (headings) {
          values[i - 1] = (laid.h[i]! - t.heading) * each;
          columns?.forEach((col, k) => {
            const dk = laid.d![k]!;
            col[i - 1] = (dk.h[i]! - t.curvature * (dk.s[i]! + (k === runs ? 1 : 0))) * each;
          });
          continue;
        }
        const e = each / width;
        values[2 * i - 2] = (laid.x[i]! - t.x) * e;
        values[2 * i - 1] = (laid.y[i]! - t.y) * e;
        const [c, sn] = [Math.cos(t.heading), Math.sin(t.heading)];
        columns?.forEach((col, k) => {
          const dk = laid.d![k]!;
          const along = dk.s[i]! + (k === runs ? 1 : 0);
          col[2 * i - 2] = (dk.x[i]! - c * along) * e;
          col[2 * i - 1] = (dk.y[i]! - sn * along) * e;
        });
      }
      for (let k = 0; k < runs; k++) {
        values[fits + k] = w * q[k]!;
        if (columns) columns[k]![fits + k] = w;
      }
      pairs.forEach(({ i, j, ux, uy }, m) => {
        const want = width * (1 + MARGIN) - ((laid.x[i]! - laid.x[j]!) * ux + (laid.y[i]! - laid.y[j]!) * uy);
        if (want <= 0) return;
        values[fits + runs + m] = (stiff * want) / width;
        columns?.forEach((col, k) => {
          const dk = laid.d![k]!;
          col[fits + runs + m] = (-stiff * ((dk.x[i]! - dk.x[j]!) * ux + (dk.y[i]! - dk.y[j]!) * uy)) / width;
        });
      });
      return { values, ...(columns ? { columns } : {}) };
    };
    const constraints: Linearized = (x, jacobian) => {
      const c = this.closure(this.lay(p(x), scale, jacobian), !headings);
      return { values: c.values, ...(c.columns ? { columns: c.columns.slice(0, free) } : {}) };
    };
    return { residuals, constraints, x0: (q: Float64Array) => q.slice(0, free), p };
  }

  /** One stage solved from `p`: its variables solved, a held start kept. */
  stage(p: Float64Array, stage: Stage): Float64Array {
    const problem = this.problem(stage);
    return problem.p(constrainedLeastSquares(problem.residuals, problem.constraints, problem.x0(p), SOLVER));
  }

  /**
   * The pairs of the lap's ends whose model points keep apart: at least a road's width apart, the model between them
   * longer than the half circle on them; with `near`, those alone that the lap holds within it.
   */
  apartPairs(laid: Laid, start: number, near = Infinity): Pair[] {
    const { n } = this;
    const { roadWidth: width, model } = this.inputs;
    const t = Array.from(laid.s, (s) => this.model(start + s));
    const pairs: Pair[] = [];
    for (let i = 1; i <= n; i++)
      for (let j = i + 1; j <= n; j++) {
        const [dx, dy] = [t[i]!.x - t[j]!.x, t[i]!.y - t[j]!.y];
        const d = Math.hypot(dx, dy);
        const gap = Math.abs(laid.s[j]! - laid.s[i]!);
        if (d < width || Math.min(gap, model.length - gap) <= (Math.PI * d) / 2) continue;
        if (Math.hypot(laid.x[i]! - laid.x[j]!, laid.y[i]! - laid.y[j]!) >= near) continue;
        pairs.push({ i, j, ux: dx / d, uy: dy / d });
      }
    return pairs;
  }

  /**
   * The two terms: the mean of the ends' squared distances from their model points, road widths, and the sum of the
   * runs' squared doublings, each run counting on its own.
   */
  terms(p: ArrayLike<number>, scale: number) {
    const runs = this.runs.length;
    const laid = this.lay(p, scale);
    let distance = 0;
    for (let i = 1; i <= this.n; i++) {
      const t = this.model(p[runs]! + laid.s[i]!);
      distance += ((laid.x[i]! - t.x) ** 2 + (laid.y[i]! - t.y) ** 2) / this.inputs.roadWidth ** 2;
    }
    let change = 0;
    for (let k = 0; k < runs; k++) change += p[k]! ** 2;
    return { distance: distance / this.n, change };
  }

  /** The runs' doublings moved least so that the lap closes exactly: Newton's steps on the closure, least in norm. */
  close(p: Float64Array, scale: number): Float64Array {
    const runs = this.runs.length;
    let q = Float64Array.from(p);
    for (let round = 0; round < CLOSE_ROUNDS; round++) {
      const c = this.closure(this.lay(q, scale, true));
      if (c.values.every((v) => Math.abs(v) <= CLOSED_EXACT)) break;
      const rows = [0, 1, 2, 3].map((m) => Float64Array.from({ length: runs }, (_, k) => c.columns![k]![m]!));
      const normal = rows.map((a) => Float64Array.from(rows, (b) => a.reduce((sum, v, k) => sum + v * b[k]!, 0)));
      const y = solveLinear(normal, c.values);
      if (!y) break;
      q = Float64Array.from(q, (v, k) => (k < runs ? v - rows.reduce((sum, row, m) => sum + row[k]! * y[m]!, 0) : v));
    }
    return q;
  }

  /**
   * The lap solved at turn scale `scale`: from the table's lengths and its start at its model's line, the headings first,
   * the start free, then the distances at each weight in turn, the start held until `FREE_START`, then the separations
   * round by round, chosen again each round; closed exactly at last.
   */
  solveAt(scale: number): LapAnswer {
    const runs = this.runs.length;
    let p: Float64Array = new Float64Array(runs + 1);
    p = this.stage(p, { scale, weight: WEIGHTS[0], headings: true });
    for (const weight of WEIGHTS)
      p = this.stage(p, { scale, weight, ...(weight > FREE_START ? { held: p[runs]! } : {}) });
    for (const stiff of SEPARATION_STIFF) {
      const pairs = this.apartPairs(this.lay(p, scale), p[runs]!, NEAR * this.inputs.roadWidth);
      p = this.stage(p, { scale, weight: 1, pairs, stiff });
    }
    p = this.close(p, scale);
    const length = this.inputs.model.length;
    return {
      turnScale: scale,
      start: ((p[runs]! % length) + length) % length,
      factors: Array.from(p.subarray(0, runs)),
    };
  }
}

/** A lap as measured: whether it meets the rule, and the report's figures. */
export interface LapMeasure {
  /** Its closure: its turning's departure, radians, its length's, its end's from its start, metres. */
  readonly closure: readonly number[];
  readonly crossings: number;
  readonly modelCrossings: number;
  readonly leastApart: number;
  readonly tightest: number;
  /** Its two terms: its distances' mean, road widths squared, and its changes' sum, doublings squared. */
  readonly terms: { readonly distance: number; readonly change: number };
  readonly sum: number;
  readonly meets: boolean;
  /** The ends' distances from their model's points as far along and from its nearest, metres: their mean and most. */
  readonly distances?: { readonly same: Spread; readonly nearest: Spread };
  /** The runs' changes of length, corners' and straights', shares of their table's: median, most and least. */
  readonly changes?: { readonly corners: Changes; readonly straights: Changes };
}

/** A mean and a most. */
export interface Spread {
  readonly mean: number;
  readonly most: number;
}

/** A median, a most and a least. */
export interface Changes {
  readonly median: number;
  readonly most: number;
  readonly least: number;
}

const spread = (values: readonly number[]): Spread => ({
  mean: values.reduce((sum, v) => sum + v, 0) / values.length,
  most: Math.max(...values),
});

function changesOf(values: readonly number[]): Changes {
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2;
  return { median, most: sorted.at(-1)!, least: sorted[0]! };
}

/** The distance from (x, y) to the segment from a to b. */
function segmentDistance(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

/** The segments of a closed polyline that cross another not beside it, counted once a pair. */
function crossings(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  const cell = 4 * CHORD;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const middle = (k: number) => {
    const [a, b] = [points[k]!, points[(k + 1) % n]!];
    return [Math.floor((a.x + b.x) / 2 / cell), Math.floor((a.y + b.y) / 2 / cell)] as const;
  };
  for (let k = 0; k < n; k++) {
    const [cx, cy] = middle(k);
    const list = grid.get(key(cx, cy));
    if (list) list.push(k);
    else grid.set(key(cx, cy), [k]);
  }
  const side = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  let count = 0;
  for (let k = 0; k < n; k++) {
    const [a, b] = [points[k]!, points[(k + 1) % n]!];
    const [cx, cy] = middle(k);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const m of grid.get(key(gx, gy)) ?? []) {
          if (m <= k + 1 || (k === 0 && m === n - 1)) continue;
          const [c, d] = [points[m]!, points[(m + 1) % n]!];
          if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) count++;
        }
  }
  return count;
}

function measureLap(lap: ModelLap, answer: LapAnswer): LapMeasure {
  const { inputs } = lap;
  const p = [...answer.factors, answer.start];
  const laid = lap.lay(p, answer.turnScale);
  const n = lap.n;
  const closure = [
    laid.h[n]! - laid.h[0]! - 2 * Math.PI * inputs.model.turns,
    laid.s[n]! - inputs.model.length,
    laid.x[n]! - laid.x[0]!,
    laid.y[n]! - laid.y[0]!,
  ];
  const closed =
    closure.every(Number.isFinite) &&
    Math.abs(closure[0]!) <= CLOSED_HEADING &&
    closure.slice(1).every((v) => Math.abs(v) <= CLOSED_PLACE);
  const terms = lap.terms(p, answer.turnScale);
  const tightest = lap.tightest(answer.turnScale);
  // A lap that does not close is measured no further.
  if (!closed)
    return { closure, crossings: NaN, modelCrossings: NaN, leastApart: NaN, tightest, terms, sum: NaN, meets: false };
  const leastApart = Math.min(
    ...lap
      .apartPairs(laid, answer.start)
      .map(({ i, j, ux, uy }) => (laid.x[i]! - laid.x[j]!) * ux + (laid.y[i]! - laid.y[j]!) * uy),
  );
  const { intervals, scale } = lap.intervals(answer);
  // The lap's points along it from its start, at most `CHORD` apart.
  const points: { x: number; y: number }[] = [];
  intervals.forEach(({ value, length }, i) => {
    const steps = Math.ceil(length / CHORD);
    for (let k = 0; k < steps; k++) {
      const u = (k * length) / steps;
      const half = (value * scale * u) / 2;
      const chord = Math.abs(half) < 1e-9 ? u : (u * Math.sin(half)) / half;
      points.push({
        x: laid.x[i]! + chord * Math.cos(laid.h[i]! + half),
        y: laid.y[i]! + chord * Math.sin(laid.h[i]! + half),
      });
    }
  });
  const length = inputs.model.length;
  const steps = Math.ceil(length / CHORD);
  // The model's points, at most `CHORD` apart.
  const modelPoints = Array.from({ length: steps }, (_, k) => lap.model((k * length) / steps));
  const modelCrossings = crossings(modelPoints);
  const lapCrossings = crossings(points);
  const same: number[] = [];
  const nearest: number[] = [];
  for (let i = 1; i <= n; i++) {
    const t = lap.model(answer.start + laid.s[i]!);
    same.push(Math.hypot(laid.x[i]! - t.x, laid.y[i]! - t.y));
    let least = Infinity;
    for (let k = 0; k < steps; k++)
      least = Math.min(least, segmentDistance(laid.x[i]!, laid.y[i]!, modelPoints[k]!, modelPoints[(k + 1) % steps]!));
    nearest.push(least);
  }
  const shares = (sign: boolean) =>
    lap.runs.flatMap((run, k) => ((run.sign !== 0) === sign ? [2 ** answer.factors[k]! - 1] : []));
  const meets = lapCrossings === modelCrossings && leastApart >= inputs.roadWidth && tightest >= inputs.leastLaneRadius;
  return {
    closure,
    crossings: lapCrossings,
    modelCrossings,
    leastApart,
    tightest,
    terms,
    sum: terms.distance + terms.change,
    meets,
    distances: { same: spread(same), nearest: spread(nearest) },
    changes: { corners: changesOf(shares(true)), straights: changesOf(shares(false)) },
  };
}

/** The lap of `inputs` at `answer`: its intervals for its plan, and its measure. */
export function lapOnModel(inputs: LapInputs, answer: LapAnswer) {
  const lap = new ModelLap(inputs);
  if (answer.factors.length !== lap.runs.length) throw contractUnmet("A lap's answer has a factor for each run");
  return { ...lap.intervals(answer), measure: measureLap(lap, answer) };
}

/**
 * The lap of `inputs` solved by the procedure: at each turn scale of a fixed grid, then of its rounds of refining about
 * the best, whose tightest arc keeps its lanes' least radius, the lap solved at it; of those that meet the rule, the one
 * whose two terms' sum is least, its distances' mean and its changes' sum (of equal ones the earliest). The answer is
 * the procedure's, not the least of all.
 */
export function solveLap(inputs: LapInputs): { answer: LapAnswer; measure: LapMeasure } | undefined {
  const lap = new ModelLap(inputs);
  let best: { answer: LapAnswer; measure: LapMeasure } | undefined;
  const tryScale = (scale: number) => {
    if (lap.tightest(scale) < inputs.leastLaneRadius) return;
    const answer = lap.solveAt(scale);
    const measure = measureLap(lap, answer);
    if (measure.meets && (!best || measure.sum < best.measure.sum)) best = { answer, measure };
  };
  const { from, to } = SCALE_GRID;
  let step: number = SCALE_GRID.step;
  for (let k = 0; from + k * step <= to + GRID_SLACK; k++) tryScale(from + k * step);
  for (let round = 0; round < REFINE_ROUNDS && best; round++) {
    const centre = best.answer.turnScale;
    step /= REFINE.share;
    for (let k = -REFINE.steps; k <= REFINE.steps; k++) if (k !== 0) tryScale(centre + k * step);
  }
  return best;
}

/**
 * A lap as the answers' file keeps it: its course, its model, the digest of its inputs and the procedure that solved it
 * (`lapDigest`), and its answer.
 */
export interface KeptLap extends LapAnswer {
  readonly course: string;
  readonly model: string;
  readonly inputs: string;
}

const LAPS_FILE = '/tools/road-data/shared/model-laps.json';
/** The command that solves the laps again. */
export const SOLVE_AGAIN = 'npm run road-data -- model-laps';

let kept: ReadonlyMap<string, KeptLap> | undefined;

/** The answers' file, admitted once: its shape, one lap a course, each a turn scale, a start and factors. */
function readLaps(): ReadonlyMap<string, KeptLap> {
  const document: unknown = JSON.parse(readFileSync(new URL('./model-laps.json', import.meta.url), 'utf8'));
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  requireInput(isRecord(document) && Array.isArray(document.laps), LAPS_FILE, 'Its shape');
  const laps = new Map<string, KeptLap>();
  document.laps.forEach((lap: unknown, k) => {
    const at = `${LAPS_FILE}/laps/${k}`;
    requireInput(
      isRecord(lap) &&
        typeof lap.course === 'string' &&
        typeof lap.model === 'string' &&
        typeof lap.inputs === 'string' &&
        finite(lap.turnScale) &&
        lap.turnScale > 0 &&
        finite(lap.start) &&
        Array.isArray(lap.factors) &&
        lap.factors.every(finite),
      at,
      'A lap: its course, model, inputs, turn scale, start and factors',
    );
    requireInput(!laps.has(lap.course), `${at}/course`, 'One lap a course');
    laps.set(
      lap.course,
      Object.freeze({
        course: lap.course,
        model: lap.model,
        inputs: lap.inputs,
        turnScale: lap.turnScale,
        start: lap.start,
        factors: Object.freeze([...(lap.factors as number[])]),
      }),
    );
  });
  return laps;
}

/**
 * Course `course`'s lap on its model as solved: its answer from the answers' file, where it was solved from these
 * inputs by this procedure (its digest the same); else the conversion stops, naming the command that solves it again.
 */
export function solvedLap(course: string, inputs: LapInputs): LapAnswer {
  kept ??= readLaps();
  const lap = kept.get(course);
  requireInput(lap, LAPS_FILE, `The answers' file holds no lap of ${course}: solve it (${SOLVE_AGAIN})`);
  requireInput(
    lap.model === inputs.model.id && lap.inputs === lapDigest(inputs),
    LAPS_FILE,
    `${course}'s lap was solved from other inputs or by another procedure than its table, model, road width, least radius and the procedure now: solve it again (${SOLVE_AGAIN})`,
  );
  return lap;
}
