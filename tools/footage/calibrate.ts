import type { FrameFeatures } from './features.js';
import type { FootageCamera, FootageModel, Measured } from './footage-model.js';
import { fitLine, fitPolynomial, solveDense } from './fit.js';
import { mostFrequent, robustCentre } from './statistics.js';

/**
 * Calibration's view of one frame on a straight: the marks along its roads (each road's edges and each line's centre,
 * row by row) all lie on lines `x = x_v + c·(y − y_v)` through one vanishing point, a row index `y` seen at `y + 0.5`.
 */
export interface StraightFrame {
  readonly video: string;
  readonly frame: number;
  readonly t: number;
  /** Where the marks meet, and the standard error of its row. */
  readonly vanishing: { readonly x: number; readonly y: number; readonly rowError: number };
}

/** A mark along a road: its points `(y, x)` on consecutive rows, and its kind (a left edge, a right edge, a line). */
export type Mark = { ys: number[]; xs: number[]; kind: 'left' | 'right' | 'line' };

/**
 * A frame's marks from the ground top down: left road edges, right road edges and line centres, each kind linked row to
 * row on its own, a point to the one on the next row that is its nearest there while it is that one's nearest on its
 * own row. Where a mark's point is missing on a row, its nearest may be another mark's: a mark therefore breaks where
 * its second difference exceeds three deviations of the frame's second differences (their robust spread, no less than
 * that of rounding, √(6/12) px). With a `column`, only the roads connected to the one under it are read
 * ([connectedRoads]).
 */
export function frameMarks(features: FrameFeatures, column?: number): Mark[] {
  const below = features.rows.filter((row) => features.groundTop === null || row.y >= features.groundTop);
  const rows = column === undefined ? below : connectedRoads(below, column);
  const kinds = [
    ['left', (row: (typeof rows)[number]) => row.roads.map((road) => road[0])],
    ['right', (row: (typeof rows)[number]) => row.roads.map((road) => road[1])],
    ['line', (row: (typeof rows)[number]) => row.lines.map((line) => line[0])],
  ] as const;
  const linked = kinds.flatMap(([kind, xs]) =>
    linkRows(
      rows.map((row) => ({
        y: row.y + 0.5,
        xs: xs(row)
          .filter((x): x is number => x !== null)
          .sort((a, b) => a - b),
      })),
      kind,
    ),
  );
  const differences: number[] = [];
  for (const mark of linked)
    for (let k = 1; k + 1 < mark.xs.length; k++) differences.push(mark.xs[k + 1]! - 2 * mark.xs[k]! + mark.xs[k - 1]!);
  const limit = 3 * Math.max(Math.sqrt(0.5), differences.length ? robustCentre(differences).sigma : 0);
  return linked.flatMap((mark) => {
    const pieces: Mark[] = [{ ys: [mark.ys[0]!], xs: [mark.xs[0]!], kind: mark.kind }];
    for (let k = 1; k < mark.xs.length; k++) {
      const piece = pieces.at(-1)!;
      const n = piece.xs.length;
      if (n >= 2 && Math.abs(mark.xs[k]! - 2 * piece.xs[n - 1]! + piece.xs[n - 2]!) > limit)
        pieces.push({ ys: [], xs: [], kind: mark.kind });
      pieces.at(-1)!.ys.push(mark.ys[k]!);
      pieces.at(-1)!.xs.push(mark.xs[k]!);
    }
    return pieces;
  });
}

/**
 * The rows with only the roads connected to the one under `column` at the bottom: going up, a road is kept when it
 * overlaps a kept road of the row below (an edge not measured reaching to the frame's side), so another road seen apart
 * from it, or ground of a road color away from it, drops out while both branches of a fork stay. Lines are kept when a
 * kept road holds them.
 */
function connectedRoads(rows: FrameFeatures['rows'], column: number): FrameFeatures['rows'] {
  const out: FrameFeatures['rows'][number][] = [];
  let kept: (readonly [number, number])[] | null = null;
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    if (kept && rows[r + 1] && rows[r + 1]!.y !== row.y + 1) kept = null;
    const spans = row.roads.map((road) => [road[0] ?? -Infinity, road[1] ?? Infinity] as const);
    const keep = row.roads.map((_, i) => {
      const [left, right] = spans[i]!;
      if (!kept) return left <= column && column <= right;
      return kept.some(([l, rt]) => left <= rt && l <= right);
    });
    const roads = row.roads.filter((_, i) => keep[i]);
    const held = spans.filter((_, i) => keep[i]);
    if (!held.length && kept) {
      out.push({ ...row, roads: [], lines: [] });
      continue;
    }
    kept = held.length ? held : kept;
    out.push({
      ...row,
      roads,
      lines: row.lines.filter(([x]) => held.some(([l, rt]) => l <= x && x <= rt)),
    });
  }
  return out.reverse();
}

/** Points on rows linked into marks: each to its mutual nearest on the next row. */
function linkRows(rows: readonly { y: number; xs: readonly number[] }[], kind: Mark['kind']): Mark[] {
  const nearest = (xs: readonly number[], x: number) => {
    let best = -1;
    xs.forEach((candidate, i) => {
      if (best < 0 || Math.abs(candidate - x) < Math.abs(xs[best]! - x)) best = i;
    });
    return best;
  };
  const marks: Mark[] = [];
  let open = new Map<number, Mark>();
  rows.forEach((row, r) => {
    const above = r > 0 && rows[r - 1]!.y === row.y - 1 ? rows[r - 1]! : null;
    const next = new Map<number, Mark>();
    row.xs.forEach((x, i) => {
      let mark: Mark | undefined;
      if (above) {
        const j = nearest(above.xs, x);
        if (j >= 0 && nearest(row.xs, above.xs[j]!) === i) mark = open.get(j);
      }
      if (!mark) marks.push((mark = { ys: [], xs: [], kind }));
      mark.ys.push(row.y);
      mark.xs.push(x);
      next.set(i, mark);
    });
    open = next;
  });
  return marks;
}

/**
 * Marks fitted by least squares to the forward model's road ahead, in rows `w = y − y_v` below the vanishing point:
 * `x = x_v + c_i·w` on a straight and level road, and `x = x_v + c_i·w + (C + c_i·E)/w` with the road ahead curving
 * (`C`, common to every mark, from plan curvature; `E`, in proportion to each mark's slope, from vertical curvature),
 * to first order. Gauss–Newton from `start`, each mark's slope eliminated through the Schur complement. Null when the
 * marks do not fix the point or a mark reaches the vanishing row. Each mark's squared residuals count by its weight.
 */
export function fitMarks(
  marks: readonly Mark[],
  weights: readonly number[],
  curved: boolean,
  start: { x: number; y: number },
) {
  const globals = curved ? 4 : 2;
  // Globals: x_v, y_v, then C and E.
  const p = [start.x, start.y, 0, 0];
  const slopes = marks.map(() => 0);
  let normal: number[][] | null = null;
  const model = (i: number, y: number) => {
    const w = y - p[1]!,
      c = slopes[i]!;
    return p[0]! + c * w + (curved ? (p[2]! + c * p[3]!) / w : 0);
  };
  const residuals = () =>
    marks.map((mark, i) => mark.ys.reduce((sum, y, k) => sum + (mark.xs[k]! - model(i, y)) ** 2, 0));
  for (let iteration = 0; iteration < 30; iteration++) {
    if (marks.some((mark) => mark.ys.some((y) => !(y - p[1]! > 0)))) return null;
    // Each slope at the globals: linear in it.
    marks.forEach((mark, i) => {
      let num = 0,
        den = 0;
      mark.ys.forEach((y, k) => {
        const w = y - p[1]!;
        const basis = w + (curved ? p[3]! / w : 0);
        num += (mark.xs[k]! - p[0]! - (curved ? p[2]! / w : 0)) * basis;
        den += basis * basis;
      });
      slopes[i] = den > 0 ? num / den : 0;
    });
    const S = Array.from({ length: globals }, () => new Array<number>(globals).fill(0));
    const g = new Array<number>(globals).fill(0);
    marks.forEach((mark, i) => {
      const c = slopes[i]!;
      const A = Array.from({ length: globals }, () => new Array<number>(globals).fill(0));
      const B = new Array<number>(globals).fill(0);
      const r = new Array<number>(globals).fill(0);
      let cc = 0,
        rc = 0;
      mark.ys.forEach((y, k) => {
        const w = y - p[1]!;
        const residual = mark.xs[k]! - model(i, y);
        const J = curved ? [1, -c + (p[2]! + c * p[3]!) / (w * w), 1 / w, c / w] : [1, -c];
        const Jc = w + (curved ? p[3]! / w : 0);
        for (let a = 0; a < globals; a++) {
          for (let b = 0; b < globals; b++) A[a]![b]! += J[a]! * J[b]!;
          B[a]! += J[a]! * Jc;
          r[a]! += J[a]! * residual;
        }
        cc += Jc * Jc;
        rc += Jc * residual;
      });
      if (!(cc > 0)) return;
      const weight = weights[i]!;
      for (let a = 0; a < globals; a++) {
        for (let b = 0; b < globals; b++) S[a]![b]! += weight * (A[a]![b]! - (B[a]! * B[b]!) / cc);
        g[a]! += weight * (r[a]! - (B[a]! * rc) / cc);
      }
    });
    const step = solveDense(S, g);
    if (!step) return null;
    normal = S;
    step.forEach((value, a) => (p[a] = p[a]! + value));
    if (Math.hypot(...step) < 1e-6) break;
  }
  if (!normal || marks.some((mark) => mark.ys.some((y) => !(y - p[1]! > 0)))) return null;
  const each = residuals();
  const chiSquare = each.reduce((sum, value, i) => sum + value * weights[i]!, 0);
  // The vanishing row's standard error: its diagonal of the normal equations' inverse, scaled by the fit's reduced
  // chi-square when the marks lie further apart than their weights say.
  const points = marks.reduce((sum, mark) => sum + mark.ys.length, 0);
  const column = solveDense(
    normal,
    normal.map((_, a) => (a === 1 ? 1 : 0)),
  );
  const scale = Math.max(1, chiSquare / Math.max(1, points - globals - marks.length));
  return {
    x: p[0]!,
    y: p[1]!,
    rowError: column ? Math.sqrt(column[1]! * scale) : Infinity,
    curve: curved ? { plan: p[2]!, vertical: p[3]! } : null,
    slopes: [...slopes],
    residuals: each,
    chiSquare,
  };
}

/** Where two lines `x = a + b·y` meet, if they do. */
function meeting(one: { a: number; b: number }, other: { a: number; b: number }) {
  if (one.b === other.b) return null;
  const y = (other.a - one.a) / (one.b - other.b);
  return { x: one.a + one.b * y, y };
}

/** A frame's marks of five rows or more, longest first, each with its own line and its weight. */
function weighedMarks(features: FrameFeatures) {
  const marks = frameMarks(features)
    .filter((mark) => mark.ys.length >= 5)
    .sort((a, b) => b.ys.length - a.ys.length);
  const lines = marks.map((mark) => fitLine(mark.ys, mark.xs));
  // A mark's noise about its own parabola, which a curve does not inflate, no less than a pixel's rounding.
  const weights = marks.map((mark) => {
    const parabola = fitPolynomial(mark.ys, mark.xs, 2);
    return 1 / Math.max(1 / 12, parabola ? parabola.rss / (mark.ys.length - 3) : Infinity);
  });
  return { marks, lines, weights };
}

/**
 * The marks that meet at one vanishing point ([fitMarks]), and their fit. The set grows from the two longest marks: the
 * mark that adds least to the fit joins while its residual through the point, at its own best slope, exceeds its own
 * line's by no more than three deviations, so marks that meet elsewhere (an object's side, a sprite's run of a road
 * color) stay out however many they are.
 */
function meetingMarks({ marks, lines, weights }: ReturnType<typeof weighedMarks>) {
  if (marks.length < 2) return null;
  const fit = (members: readonly number[], curved: boolean, start: { x: number; y: number }) =>
    fitMarks(
      members.map((i) => marks[i]!),
      members.map((i) => weights[i]!),
      curved,
      start,
    );
  let members = [0, 1];
  const first = meeting(lines[0]!, lines[1]!);
  let point = first && fit(members, false, first);
  if (!point) return null;
  for (;;) {
    let best = -1,
      bestExcess = 9;
    for (let i = 0; i < marks.length; i++) {
      if (members.includes(i)) continue;
      const excess = (markResidual(marks[i]!, point) - lines[i]!.rss) * weights[i]!;
      if (excess <= bestExcess) [best, bestExcess] = [i, excess];
    }
    if (best < 0) break;
    const next = fit([...members, best], false, point);
    if (!next) break;
    members = [...members, best];
    point = next;
  }
  return { members, fit: point, curved: () => fit(members, true, point!) };
}

/** A mark's residual sum through a point at its own best slope (infinite if it reaches the vanishing row). */
function markResidual(mark: Mark, point: { x: number; y: number }) {
  let num = 0,
    den = 0;
  for (let k = 0; k < mark.ys.length; k++) {
    const w = mark.ys[k]! - point.y;
    if (!(w > 0)) return Infinity;
    num += (mark.xs[k]! - point.x) * w;
    den += w * w;
  }
  const slope = num / den;
  return mark.ys.reduce((sum, y, k) => sum + (mark.xs[k]! - point.x - slope * (y - point.y)) ** 2, 0);
}

/**
 * A frame is on a straight when marks of five rows or more meet at one point and run straight ([meetingMarks]). With
 * three marks or more, BIC (each mark's variance known) must prefer their sharing the point both to each mark's own
 * line and to the road ahead curving.
 */
export function straightFrame(video: string, features: FrameFeatures): StraightFrame | null {
  const weighed = weighedMarks(features);
  const met = meetingMarks(weighed);
  if (!met || met.members.length < 3) return null;
  const { members, fit: point } = met;
  const points = members.reduce((sum, i) => sum + weighed.marks[i]!.ys.length, 0);
  const own = members.reduce((sum, i) => sum + weighed.lines[i]!.rss * weighed.weights[i]!, 0);
  // BIC with each mark's variance known: its chi-square plus each parameter's cost.
  const preferred = point.chiSquare + (2 + members.length) * Math.log(points);
  if (preferred > own + 2 * members.length * Math.log(points)) return null;
  const curved = met.curved();
  if (curved && curved.chiSquare + (4 + members.length) * Math.log(points) < preferred) return null;
  return {
    video,
    frame: features.frame,
    t: features.t,
    vanishing: { x: point.x, y: point.y, rowError: point.rowError },
  };
}

/** The main road on a row: the road containing the player's column, or the nearest. */
export function mainRoad(row: FrameFeatures['rows'][number], column: number) {
  let best: (typeof row.roads)[number] | null = null,
    bestDistance = Infinity;
  for (const road of row.roads) {
    const left = road[0] ?? -Infinity,
      right = road[1] ?? Infinity;
    const distance = column < left ? left - column : column > right ? column - right : 0;
    if (distance < bestDistance) [best, bestDistance] = [road, distance];
  }
  return best;
}

/** The player's column: the middle of the player mask. */
export function playerColumn(model: FootageModel): number {
  const mask = model.masks.find((m) => m.kind === 'player');
  return mask ? mask.x + mask.width / 2 : model.frame.width / 2;
}

/**
 * The centre column and the horizon row of a level camera: the most frequent column and row where the marks of straights
 * meet. A yaw that never changes cannot be told from `x₀`, so `x₀` is where the original most often
 * faces along the road; with either pitch rule a constant grade's road meets at `y₀` most often (a level camera on a
 * level road, or a camera pitched with its road).
 */
export function horizonAndCentre(straights: readonly StraightFrame[]) {
  const xs = straights.map((s) => s.vanishing.x),
    ys = straights.map((s) => s.vanishing.y);
  return {
    centerX: mostFrequent(xs),
    horizonRow: mostFrequent(ys),
    spread: { x: robustCentre(xs).sigma, y: robustCentre(ys).sigma },
    frames: straights.length,
  };
}

/** One video's frames as calibration reads them. */
export interface CalibrationVideo {
  readonly id: string;
  readonly features: readonly FrameFeatures[];
}

/**
 * The speed shown at each frame, m/s: the HUD's km/h, and between readings over frames it could not be read in, linear in
 * time; frames before the first reading and after the last take it.
 */
export function displayedSpeeds(features: readonly FrameFeatures[]): Float64Array {
  const speeds = new Float64Array(features.length).fill(NaN);
  let previous = -1;
  features.forEach((f, i) => {
    if (f.speed === null) return;
    speeds[i] = f.speed / 3.6;
    for (let j = previous + 1; j < i; j++) {
      // The earlier reading's share: all of it before the first reading has none.
      const earlier = previous < 0 ? 0 : (f.t - features[j]!.t) / (f.t - features[previous]!.t);
      speeds[j] = earlier * (speeds[previous] ?? 0) + (1 - earlier) * speeds[i]!;
    }
    previous = i;
  });
  if (previous >= 0) speeds.fill(speeds[previous]!, previous + 1);
  return speeds;
}

/** The distance travelled by each frame: the displayed speed integrated over the frames' times (trapezoids). */
export function travelled(features: readonly FrameFeatures[], speeds: Float64Array): Float64Array {
  const s = new Float64Array(features.length);
  for (let i = 1; i < features.length; i++)
    s[i] = s[i - 1]! + ((speeds[i]! + speeds[i - 1]!) / 2) * (features[i]!.t - features[i - 1]!.t);
  return s;
}

/**
 * The stripe edges of a frame's main road: the continuous rows where its road color changes, below the horizon. The
 * light and dark road colors may lie one step apart, so a run of one row is not told from a row read wrongly: such runs
 * are dropped, and an edge lies between two runs of two rows or more of different colors, on consecutive rows of the
 * main road. Rows are seen at their centres, so a change between rows `y − 1` and `y` lies at the boundary between them,
 * the continuous row `y`; across a dropped row `y`, at its middle, `y + ½`.
 */
export function stripeEdges(features: FrameFeatures, column: number, horizon: number): number[] {
  // Runs of consecutive rows reading the main road in one color.
  const runs: { first: number; last: number; color: number }[] = [];
  for (const row of features.rows) {
    if (row.y + 0.5 <= horizon) continue;
    const color = mainRoad(row, column)?.[2] ?? null;
    const run = runs.at(-1);
    if (color === null) continue;
    if (run && run.color === color && run.last === row.y - 1) run.last = row.y;
    else runs.push({ first: row.y, last: row.y, color });
  }
  const edges: number[] = [];
  let previous: (typeof runs)[number] | null = null;
  for (const run of runs) {
    if (run.last === run.first) continue;
    const gap = previous ? run.first - previous.last - 1 : Infinity;
    if (previous && previous.color === run.color && gap <= 1) previous.last = run.last;
    else {
      if (previous && gap <= 1) edges.push(run.first - gap / 2);
      previous = run;
    }
  }
  return edges;
}

/**
 * `K = f·h` from stripe edges followed over level straights, each frame's edges in rows `u` below the horizon `level`
 * gives it. An edge fixed at station `s_m` stands at `1/u = (s_m − s_c)/K`, so along one edge's track `1/u` falls by
 * `Δs/K` as the camera travels `Δs` (the displayed speed's integral). Each edge is predicted on the next level frame,
 * and a prediction and an observed edge that are each other's nearest, within the two rows' rounding (the earlier
 * magnified by the motion) and the motion's share of `K`'s uncertainty (at first the single steps' spread), continue
 * one track. Every track shares the one slope `−1/K` with an intercept of its own, fitted by least squares, each reading
 * weighted by `u⁴` (a row's rounding is `1/u²` in `1/u`), its standard error clustered by track (readings along one
 * edge are not independent). From a rough start, following and fitting repeat until `K` moves by less than its
 * standard error.
 */
export function measureK(
  videos: readonly CalibrationVideo[],
  level: ReadonlyMap<string, number>,
  column: number,
): { K: number; tracks: number; readings: number; standardError: number } {
  type Track = { u: number[]; s: number[] };
  const perVideo = videos.map((video) => {
    const s = travelled(video.features, displayedSpeeds(video.features));
    // Each edge in rows below its frame's horizon.
    const edges = video.features.map((f) => {
      const vanishing = level.get(`${video.id} ${f.frame}`);
      return vanishing === undefined ? null : stripeEdges(f, column, vanishing).map((y) => y - vanishing);
    });
    return { s, edges };
  });
  const nearest = (values: readonly number[], x: number) => {
    let best = -1;
    values.forEach((value, i) => {
      if (best < 0 || Math.abs(value - x) < Math.abs(values[best]! - x)) best = i;
    });
    return best;
  };
  // Where an edge `u` rows below the horizon stands after the camera travels `ds`.
  const moved = (u: number, ds: number, K: number) => 1 / (1 / u - ds / K);
  // A rough start: each edge against the next edge below it in the next frame, their median weighted by `u⁴` as the
  // fit weighs them (edges near the horizon are often not stripes' and seldom continue), its spread their own.
  const steps: { K: number; weight: number }[] = [];
  for (const { s, edges } of perVideo)
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i],
        b = edges[i + 1];
      const ds = s[i + 1]! - s[i]!;
      if (!a || !b || !(ds > 0)) continue;
      for (const y of a) {
        const next = b.find((candidate) => candidate > y);
        if (next !== undefined) steps.push({ K: ds / (1 / y - 1 / next), weight: y ** 4 });
      }
    }
  const start = weightedMedian(steps);
  let result = { K: start, tracks: 0, readings: 0, standardError: robustCentre(steps.map((step) => step.K)).sigma };
  for (let pass = 0; pass < 20; pass++) {
    const K = result.K;
    const uncertainty = result.standardError / K;
    const tracks: Track[] = [];
    for (const { s, edges } of perVideo) {
      let open: { track: Track; y: number }[] = [];
      for (let i = 0; i < edges.length; i++) {
        const here = edges[i];
        if (!here) {
          open = [];
          continue;
        }
        // A prediction and an edge continue one track when each is the other's nearest and they lie within the two
        // rows' rounding (half a row each, the earlier magnified by the motion, (u′/u)²) and the motion's share of K's
        // uncertainty.
        const predicted = open.map(({ track, y }) => {
          const value = moved(y, s[i]! - track.s.at(-1)!, K);
          return value > y && Number.isFinite(value)
            ? { value, reach: 0.5 + 0.5 * (value / y) ** 2 + (value - y) * uncertainty }
            : null;
        });
        const values = predicted.map((p) => p?.value ?? -Infinity);
        const continued = here.map((y, k) => {
          const p = nearest(values, y);
          const prediction = p >= 0 ? predicted[p] : null;
          return prediction &&
            Math.abs(prediction.value - y) <= prediction.reach &&
            nearest(here, prediction.value) === k
            ? p
            : -1;
        });
        open = here.map((y, k) => {
          const p = continued[k]!;
          const track = p >= 0 ? open[p]!.track : { u: [], s: [] };
          if (p < 0) tracks.push(track);
          track.u.push(y);
          track.s.push(s[i]!);
          return { track, y };
        });
      }
    }
    // One slope, an intercept per track: weighted least squares of 1/u on s. A track whose own slope departs from the
    // others' by more than three deviations (its rows' rounding, 1/12 row², scaled by the tracks' robust spread) is not
    // a fixed stripe edge (one the drawing holds still near the horizon) and is left out.
    const fitted = tracks
      .filter((track) => track.u.length >= 2)
      .map((track) => {
        let w = 0,
          ws = 0,
          wz = 0;
        track.u.forEach((u, j) => {
          w += u ** 4;
          ws += u ** 4 * track.s[j]!;
          wz += u ** 3;
        });
        const centre = { s: ws / w, z: wz / w };
        let sxx = 0,
          sxy = 0;
        track.u.forEach((u, j) => {
          sxx += u ** 4 * (track.s[j]! - centre.s) ** 2;
          sxy += u ** 4 * (track.s[j]! - centre.s) * (1 / u - centre.z);
        });
        return { track, centre, sxx, sxy };
      })
      .filter(({ sxx }) => sxx > 0);
    const common = (set: typeof fitted) =>
      set.reduce((sum, t) => sum + t.sxy, 0) / set.reduce((sum, t) => sum + t.sxx, 0);
    // Each track's departure in deviations of its rounding; their robust spread, no less than one, scales the cut.
    const departures = fitted.map((t) => (t.sxy / t.sxx - common(fitted)) * Math.sqrt(12 * t.sxx));
    const { median: centre, sigma } = robustCentre(departures);
    const kept = fitted.filter((_, i) => Math.abs(departures[i]! - centre) <= 3 * Math.max(1, sigma));
    const slope = common(kept);
    const sxx = kept.reduce((sum, t) => sum + t.sxx, 0);
    const readings = kept.reduce((sum, t) => sum + t.track.u.length, 0);
    // The slope's error clustered by track: readings along one edge share its rounding and its stripe's drawing.
    let clustered = 0;
    for (const { track, centre } of kept) {
      let score = 0;
      track.u.forEach((u, j) => {
        const x = track.s[j]! - centre.s;
        score += u ** 4 * x * (1 / u - centre.z - slope * x);
      });
      clustered += score * score;
    }
    const slopeError = Math.sqrt(clustered) / sxx;
    const next = { K: -1 / slope, tracks: kept.length, readings, standardError: slopeError / slope ** 2 };
    const settled = Math.abs(next.K - K) < next.standardError;
    result = next;
    if (settled) break;
  }
  return result;
}

/** The weighted median: the value at which half the total weight lies on either side. */
function weightedMedian(values: readonly { K: number; weight: number }[]) {
  const sorted = [...values].sort((a, b) => a.K - b.K);
  const half = sorted.reduce((sum, v) => sum + v.weight, 0) / 2;
  let total = 0;
  for (const v of sorted) if ((total += v.weight) >= half) return v.K;
  return NaN;
}

/**
 * The mean of the values within three robust deviations of their median, a deviation no less than one pixel (readings
 * in whole pixels), and its standard error.
 */
function trimmedMean(values: readonly number[]) {
  const { median, sigma } = robustCentre(values);
  const kept = values.filter((value) => Math.abs(value - median) <= 3 * Math.max(1, sigma));
  const mean = kept.reduce((sum, value) => sum + value, 0) / kept.length;
  const variance = kept.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, kept.length - 1);
  return { mean, error: Math.sqrt(variance / kept.length), n: kept.length };
}

/**
 * The player picture on level straights: its lowest row's bottom edge stands `u` rows below the frame's horizon
 * (`level`), on level road at `D′ = K/u`, and its width `b` there spans the gauge width `B` at the road's scale `f/D′ = u/h`, so
 * `h = B·u/b`. Each is the mean over the frames within three robust deviations of their median (a picture turning or
 * cut off stands apart), with its standard error.
 */
export function measurePlayer(videos: readonly CalibrationVideo[], level: ReadonlyMap<string, number>) {
  const rows: number[] = [],
    widths: number[] = [];
  for (const video of videos)
    for (const f of video.features) {
      const vanishing = level.get(`${video.id} ${f.frame}`);
      if (vanishing === undefined || !f.player) continue;
      rows.push(f.player.bottom - vanishing);
      widths.push(f.player.right - f.player.left);
    }
  return { u: trimmedMean(rows), b: trimmedMean(widths) };
}

/**
 * Several videos' measurements of one value: their weighted mean, and its standard error scaled by their disagreement
 * (the square root of their reduced chi-square) when they disagree beyond their own errors.
 */
export function combine(values: readonly Measured[]): Measured {
  const weights = values.map((v) => 1 / v.error ** 2);
  const total = weights.reduce((sum, w) => sum + w, 0);
  const value = values.reduce((sum, v, i) => sum + v.value * weights[i]!, 0) / total;
  const chiSquare = values.reduce((sum, v, i) => sum + (v.value - value) ** 2 * weights[i]!, 0);
  const scale = values.length > 1 ? Math.max(1, Math.sqrt(chiSquare / (values.length - 1))) : 1;
  return { value, error: scale / Math.sqrt(total) };
}

/**
 * The footage's camera as calibration measures it, each value with its standard error, and what it was measured from.
 * Each video is measured on its own and the original's values are combined from them ([combine]), so differences
 * between captures enter the errors. Level straights are measured from the combined horizon. The player's base row is a
 * whole row at one depth throughout and in every video, so its rounding (1/12 row²) never averages out and is added to
 * the combined `u`'s error. Errors
 * propagate to first order: `h = B·u/b`, `f = K/h` and `D′ = K/u`. The background scale needs the road's heading, so
 * the initial estimate measures it.
 */
export function calibrateCamera(videos: readonly CalibrationVideo[], model: FootageModel) {
  const column = playerColumn(model);
  const straights = videos.map((video) =>
    video.features
      .filter((f) => f.updated && f.speed !== null && f.speed > 0)
      .map((f) => straightFrame(video.id, f))
      .filter((s): s is StraightFrame => s !== null),
  );
  if (straights.some((set) => !set.length)) throw new RangeError('No level straight to calibrate on');
  const views = straights.map((set) => {
    const { centerX, horizonRow, spread, frames } = horizonAndCentre(set);
    return {
      centerX: { value: centerX, error: spread.x / Math.sqrt(frames) },
      horizonRow: { value: horizonRow, error: spread.y / Math.sqrt(frames) },
    };
  });
  const centerX = combine(views.map((view) => view.centerX));
  const horizonRow = combine(views.map((view) => view.horizonRow));
  const each = videos.map((video, v) => {
    // Level straights: those whose vanishing row agrees with the horizon within three deviations of both.
    const level = new Map(
      straights[v]!.filter(
        (s) => Math.abs(s.vanishing.y - horizonRow.value) <= 3 * Math.hypot(s.vanishing.rowError, horizonRow.error),
      ).map((s) => [`${s.video} ${s.frame}`, horizonRow.value]),
    );
    const k = measureK([video], level, column);
    const { u, b } = measurePlayer([video], level);
    if (!u.n) throw new RangeError(`No player picture on a level straight in ${video.id}`);
    return {
      video: video.id,
      straights: straights[v]!.length,
      levelStraights: level.size,
      K: { value: k.K, error: k.standardError },
      stripeTracks: k.tracks,
      u: { value: u.mean, error: u.error },
      b: { value: b.mean, error: b.error },
    };
  });
  const K = combine(each.map((e) => e.K));
  // Every video shows the player at the same whole row: its rounding is common to them all.
  const rows = combine(each.map((e) => e.u));
  const u = { value: rows.value, error: Math.hypot(rows.error, Math.sqrt(1 / 12)) };
  const b = combine(each.map((e) => e.b));
  const B = model.gauge.width;
  const relativeK = K.error / K.value,
    relativeU = Math.hypot(u.error, horizonRow.error) / u.value,
    relativeH = Math.hypot(relativeU, b.error / b.value);
  const height = (B * u.value) / b.value;
  const focalLength = K.value / height;
  const playerDistance = K.value / u.value;
  const camera: FootageCamera = {
    focalLength: { value: focalLength, error: focalLength * Math.hypot(relativeK, relativeH) },
    height: { value: height, error: height * relativeH },
    centerX,
    horizonRow,
    playerDistance: { value: playerDistance, error: playerDistance * Math.hypot(relativeK, relativeU) },
  };
  return {
    camera,
    evidence: { K, playerRows: u, playerWidth: b, videos: each.map((e, v) => ({ ...e, ...views[v] })) },
  };
}
