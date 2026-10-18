/**
 * A stage of OUTRUN as a course document ([Original road data](../../docs/original-road-data.md#course-documents)): its
 * plan from the sub CPU's road path, its lanes from its road width, its strips from its palette words. Nothing is
 * fitted; the constants measured on `k1` are named below.
 */
import { requireInput } from '../course/authoring-io.js';
import { POSITION_PER_KMH, tableRuns, TICKS } from './outrun-hills.js';
import {
  bendOf,
  LOOK,
  profileOf,
  returnedGrades,
  separatedCrossings,
  tableChanges,
  type Crossing,
  type Profile,
} from './outrun-profile.js';
import type { CurvePoint, HeightTable, Path, Stage, WidthHeightPoint } from './outrun-road.js';
import type { ObjectPlacement } from './outrun-scenery.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const CONVERSION_VERSION = 3;

/** One road position in metres: each tick the displayed km/h advances it by 0x12F / 65536 positions. */
const POSITION_METRES = 1 / (3.6 * TICKS * POSITION_PER_KMH);

/** Each road's edges lie this many units from its centre; its three lanes are equal. */
const ROAD_EDGE = 236;
const LANE = (2 * ROAD_EDGE) / 3;
const HALF_LANE = LANE / 2;
/** The road width at a stage's start, units. */
const START_WIDTH = 0x1c2;
/** The road width approaches a width point's target by its speed × 16 / 303 units a position. */
const WIDTH_RATE = 16 / 303;

/** Measured on `k1`: the player picture's width over the lane spacing on its own row. */
const CAR_PER_LANE = 0.5743;
/** Measured on `k1`, units: a lane line's width and an edge band's, which lies outside the road's edge. */
const LANE_LINE = 8;
const EDGE_BAND = 20;
/** Measured on `k1` as time × displayed speed: the surface's light and dark halves together, metres. */
const STRIPE_PERIOD = 6.315;
/**
 * Provisional until the ground's word is read: `k1`'s two sands with its capture's darkening undone by the road's ratio
 * (the ROM's 156 over `k1`'s 148), by half; on `k1` the darker sand lies beside the road's lighter half.
 */
const GROUND = [28471, 29528] as const;
/** The sand beyond each road edge, metres. */
const VERGE = 40;

/** A stage's turn at a join is spread over a position or two: headings are read this far inside a segment. */
const JOIN = 2;
/** A straight's heading varies by at most this much inside it, radians. */
const STRAIGHT_TOLERANCE = (0.1 * Math.PI) / 180;
/** The start grid: as many slots as a run's competitors, this far apart. */
const GRID_SLOTS = 16;
const GRID_SPACING = 12;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
/** A road position's station, metres to the micrometre. */
export const stationOf = (position: number) => round(position * POSITION_METRES);

/** Metres a road-width unit: TESTAROSSA's width over its picture's width in units. */
export const lateralScale = (carWidth: number) => carWidth / (CAR_PER_LANE * LANE);

/** The path's heading at each position, radians, unwrapped: counterclockwise positive in its vectors' (x, y). */
function pathHeadings(path: Path): Float64Array {
  const headings = new Float64Array(path.x.length);
  for (let i = 0; i < headings.length; i++) {
    const a = Math.atan2(path.y[i]!, path.x[i]!);
    if (i === 0) headings[i] = a;
    else {
      const step = a - Math.atan2(path.y[i - 1]!, path.x[i - 1]!);
      headings[i] = headings[i - 1]! + Math.atan2(Math.sin(step), Math.cos(step));
    }
  }
  return headings;
}

/** A plan element over road positions `[from, to)`: a straight, or an arc turning left (+) or right (−). */
export interface PlanSegment {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/**
 * The plan: the curves' segments, moved back by the path's offset, laid on the path to `end`. A straight's heading is
 * the path's inside it, which must not vary; an arc turns from the heading at its start to the heading at its end, each
 * a neighbouring straight's or, between two arcs, the path's at the join, so the arcs' turns sum to the path's. Each
 * arc turns the side its kind says.
 */
export function stagePlan(curves: readonly CurvePoint[], path: Path, offset: number, end: number): PlanSegment[] {
  const headings = pathHeadings(path);
  requireInput(end < headings.length, '/path', `The path ends before position ${end}`);
  const starts = curves.map((c) => Math.max(0, c.position - offset));
  const segments = curves.map((c, i) => ({ kind: c.kind, from: starts[i]!, to: Math.min(starts[i + 1] ?? end, end) }));
  const straight = segments.map((s) => {
    if (s.kind !== 1) return null;
    const inside = Array.from(headings.subarray(s.from + JOIN, s.to - JOIN + 1));
    requireInput(inside.length > 0, `/curves/${s.from}`, `The straight at ${s.from} is too short to read`);
    const least = Math.min(...inside),
      most = Math.max(...inside);
    requireInput(
      most - least <= STRAIGHT_TOLERANCE,
      `/curves/${s.from}`,
      `The path turns on the straight at ${s.from}`,
    );
    return (least + most) / 2;
  });
  // The heading where segment i begins: a straight's own, the straight's before it, or the path's between two arcs.
  const headingAt = (i: number) => straight[i] ?? straight[i - 1] ?? headings[segments[i]!.from]!;
  return segments.map((s, i) => {
    if (s.kind === 1) return { from: s.from, to: s.to, turn: 0 };
    const turn = (straight[i + 1] ?? (i + 1 < segments.length ? headingAt(i + 1) : headings[s.to]!)) - headingAt(i);
    requireInput(
      Math.sign(turn) === (s.kind === 3 ? 1 : -1),
      `/curves/${s.from}`,
      `The path turns ${turn > 0 ? 'left' : 'right'} on the curve at ${s.from} of kind ${s.kind}`,
    );
    return { from: s.from, to: s.to, turn };
  });
}

/**
 * The road width along a stage, units, as knots `[position, width]` to `end`: from 450 at 0, each width point
 * approaches its target from its position at its rate until it is reached or the next point begins.
 */
export function roadWidths(points: readonly WidthHeightPoint[], end: number): [number, number][] {
  const targets = points.filter((p) => p.kind !== 0 && p.position < end);
  const knots: [number, number][] = [[0, START_WIDTH]];
  let width = START_WIDTH;
  targets.forEach((p, i) => {
    const next = targets[i + 1]?.position ?? end;
    knots.push([p.position, width]);
    const rate = Math.abs(p.speed) * WIDTH_RATE;
    if (p.value === width) return;
    requireInput(rate > 0, `/widthsHeights/${p.position}`, `The width point at ${p.position} has no speed`);
    const reach = p.position + Math.abs(p.value - width) / rate;
    if (reach < next) {
      width = p.value;
      knots.push([reach, width]);
    } else {
      width += Math.sign(p.value - width) * rate * (next - p.position);
      knots.push([next, width]);
    }
  });
  knots.push([end, width]);
  return simplified(knots);
}

/** Knots without repeats of a position, nor knots where the value neither starts nor stops changing. */
function simplified(knots: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const knot of knots) {
    if (out.length && out.at(-1)![0] === knot[0]) continue;
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && (b[1] - a[1]) * (knot[0] - b[0]) === (knot[1] - b[1]) * (b[0] - a[0])) out.pop();
    out.push(knot);
  }
  return out;
}

/**
 * The lanes, units, at road width `w`: two roads centred at ±w, each of three lanes. While they are apart the median
 * between them is 2w − 472; where they overlap the outer edges ±(w + 236) are kept and the inner lanes c and d narrow,
 * meeting at 0, until at w = 78.67 they end and lanes b and e meet at 0.
 */
export function lanesAt(w: number) {
  if (w >= ROAD_EDGE) return { a: LANE, b: LANE, c: LANE, m: 2 * (w - ROAD_EDGE), d: LANE, e: LANE, f: LANE };
  if (w >= HALF_LANE) return { a: LANE, b: LANE, c: w - HALF_LANE, m: 0, d: w - HALF_LANE, e: LANE, f: LANE };
  return { a: LANE, b: w + HALF_LANE, c: 0, m: 0, d: 0, e: w + HALF_LANE, f: LANE };
}
/** Lane b's centre, the plan's centreline, across from the two roads' middle at road width `w`. */
export const centreLaneX = (w: number) => (w >= HALF_LANE ? -w : -(w + HALF_LANE) / 2);
type LaneId = keyof ReturnType<typeof lanesAt>;
const LANE_IDS: readonly LaneId[] = ['a', 'b', 'c', 'm', 'd', 'e', 'f'];

/** The knots with a knot added wherever the width crosses `w`, where the lanes' rule changes. */
const crossing = (knots: readonly [number, number][], w: number): [number, number][] =>
  knots.flatMap((knot, i) => {
    const next = knots[i + 1];
    if (!next || (knot[1] - w) * (next[1] - w) >= 0) return [knot];
    return [knot, [knot[0] + ((w - knot[1]) / (next[1] - knot[1])) * (next[0] - knot[0]), w] as [number, number]];
  });

/** The stretches, `[from, to]` positions, where the width is at least `w`. */
function stretchesFrom(knots: readonly [number, number][], w: number): [number, number][] {
  const all = crossing(knots, w);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < all.length; i++) {
    const [a, wa] = all[i]!,
      [b, wb] = all[i + 1]!;
    if (wa < w || wb < w || b <= a) continue;
    if (out.at(-1)?.[1] === a) out.at(-1)![1] = b;
    else out.push([a, b]);
  }
  return out;
}

/** A curve is written this much shorter at each end, so curves that meet stay apart through rounding, metres. */
const CURVE_GAP = 2e-6;

/**
 * A Section's profile knots, stations `[from, to]`: its ends, and a PVI for each of the profile's bends within, at the
 * intersection of the tangents at the bend's ends. A knot next to an end that joins another Section lies on that end's
 * tangent, so the Sections' grades agree there (`joinsBefore`, `joinsAfter`).
 */
export function sectionProfile(profile: Profile, from: number, to: number, joinsBefore: boolean, joinsAfter: boolean) {
  const knots = [{ s: from, y: profile.height(from), curveLength: 0 }];
  for (const { from: a, to: b } of profile.bends) {
    if (a < from || b > to) continue;
    knots.push({
      s: round((a + b) / 2),
      y: profile.height(a) + (profile.grade(a) * (b - a)) / 2,
      curveLength: round(b - a - 2 * CURVE_GAP),
    });
  }
  knots.push({ s: to, y: profile.height(to), curveLength: 0 });
  const n = knots.length;
  if (n > 2 && joinsBefore) knots[1]!.y = knots[0]!.y + profile.grade(from) * (knots[1]!.s - from);
  if (n > 2 && joinsAfter) knots[n - 2]!.y = knots[n - 1]!.y - profile.grade(to) * (to - knots[n - 2]!.s);
  return knots;
}

/**
 * Where the plan passes over itself: pairs of positions at least 200 m apart along it whose roads, each `extent(p)`
 * metres either side of its centreline at most, overlap; a crossing's pairs as stations, grouped where their earlier
 * positions run on.
 */
export function crossingsOf(plan: readonly PlanSegment[], extent: (position: number) => number): Crossing[] {
  const x: number[] = [],
    y: number[] = [];
  let px = 0,
    py = 0,
    heading = 0;
  for (const { from, to, turn } of plan) {
    const step = turn / (to - from);
    for (let p = from; p < to; p++) {
      x[p] = px;
      y[p] = py;
      px += POSITION_METRES * Math.cos(heading + step / 2);
      py += POSITION_METRES * Math.sin(heading + step / 2);
      heading += step;
    }
  }
  const apart = Math.ceil(200 / POSITION_METRES);
  const groups: [number, number][][] = [];
  for (let i = 0; i < x.length; i++)
    for (let j = i + apart; j < x.length; j++) {
      if (Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!) >= extent(i) + extent(j)) continue;
      const last = groups.at(-1);
      if (last && i - last.at(-1)![0] <= 1 && Math.abs(j - last.at(-1)![1]) < apart) last.push([i, j]);
      else groups.push([[i, j]]);
    }
  return groups.map((pairs) => pairs.map(([i, j]) => [stationOf(i), stationOf(j)] as const));
}

/** What a stage's course takes beside its tables. */
export interface StageCourseOptions {
  readonly name: string;
  /** The Sections from their first positions, the first from 0: where the plan passes over itself, its passages lie in
   * different Sections (an overpass), each cut at a joint where the road is one. */
  readonly sections: readonly { readonly id: string; readonly from: number }[];
  /** The stage's length and its finish, positions; the runout past it, positions, on the path's look-ahead. */
  readonly length: number;
  readonly runout: number;
  /** The path's offset against the curves (`pathOffset`). */
  readonly offset: number;
  /** TESTAROSSA's width, metres; the camera's distance behind the player, metres. */
  readonly carWidth: number;
  readonly cameraDistance: number;
  /** The sky's background image and its horizon row. */
  readonly sky: { readonly image: string; readonly horizonY: number };
  /** The height tables the stage's height points name; the speed its holds are counted at, km/h. */
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  /** The stage's objects, given its road width (units) at a position. */
  readonly objects: (width: (position: number) => number) => readonly ObjectPlacement[];
}

type Lateral = Record<string, unknown>;
const lane = (id: string, side: string, offset = 0): Lateral => ({ lane: id, side, offset: round(offset) });
const boundary = (id: string, offset = 0): Lateral => ({ boundary: id, offset: round(offset) });
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * `stage` as a course document, its Positions still measured from each Section's first joint: Sections from road
 * position 0 (GO, the camera's) to the stage's length, the finish, and the runout past it, joined by Links on lane b;
 * the lanes a, b, c | median | d, e, f, b the centre lane; the profile from its height tables. The surface's halves keep
 * their phase across the Sections. Returns the document and its profile.
 */
export function stageCourse(stage: Stage, options: StageCourseOptions) {
  const { length, runout } = options;
  const end = length + runout;
  const plan = stagePlan(stage.curves, stage.path, options.offset, end);
  // The look-ahead past the stage carries on the stage's last segment, which must be straight.
  requireInput(plan.at(-1)!.turn === 0, '/curves', 'The stage does not end on a straight');
  const metres = lateralScale(options.carWidth);
  const m = (units: number) => round(units * metres);
  const band = m(EDGE_BAND),
    lineHalf = m(LANE_LINE) / 2;

  // The road width, held past the stage; a knot wherever the lanes' rule changes.
  const widths = crossing(crossing(roadWidths(stage.widthsHeights, length), ROAD_EDGE), HALF_LANE);
  if (runout > 0) widths.push([end, widths.at(-1)![1]]);
  const widthAt = (p: number) => {
    const i = widths.findIndex(([at]) => at >= p);
    const [a, wa] = widths[Math.max(0, i - 1)]!,
      [b, wb] = widths[i]!;
    return b === a ? wb : wa + ((wb - wa) * (p - a)) / (b - a);
  };

  const objects = options.objects(widthAt);

  // The palette's halves: half 0 then half 1 along the road, each half of the period, half 0 from GO.
  const { surface, laneLines, edges, centreLine } = stage.colors;
  for (const [name, c] of Object.entries({ surface, laneLines, edges, centreLine }))
    requireInput(
      c.rgb555.length === 4 && c.rgb555[2] === c.rgb555[0] && c.rgb555[3] === c.rgb555[1],
      `/colors/${name}`,
      `The ${name} colors are not two halves repeated`,
    );
  requireInput(
    centreLine.rgb555[0] === surface.rgb555[0] && centreLine.rgb555[1] === surface.rgb555[1],
    '/colors/centreLine',
    'The centre line differs from the surface, and its place is not yet read',
  );

  // The profile: the tables' grades, the grades they leave returned, the plan's crossings kept apart; bends break at
  // the Sections' cuts, where Sections join on a tangent or within one bend.
  const total = stationOf(end);
  const runs = tableRuns(
    stage.widthsHeights.filter((p) => p.position < length),
    options.tables,
    () => options.kmh,
  );
  const gaps = runs.map((r, i) => [stationOf(r.end), stationOf(runs[i + 1]?.start ?? end)] as [number, number]);
  const extent = (p: number) => {
    const w = lanesAt(widthAt(p));
    return (Math.max(w.b / 2 + w.a, w.b / 2 + w.c + w.m + w.d + w.e + w.f) + EDGE_BAND) * metres;
  };
  const crossings = crossingsOf(plan, extent);
  const changes = separatedCrossings(
    returnedGrades(tableChanges(runs, LOOK, stationOf), gaps, total),
    crossings,
    total,
  ).filter((c) => c.from >= 0 && c.to <= total);
  const profile = profileOf(
    changes.map(bendOf),
    options.sections.map(({ from }) => stationOf(from)),
  );

  const elementId = (s: PlanSegment) => (s.turn === 0 ? 's' : 'c') + s.from;
  let heading = 0;
  const sections = options.sections.map(({ id, from }, k) => {
    const to = options.sections[k + 1]?.from ?? end;
    const own = plan.filter((s) => s.from >= from && s.to <= to);
    requireInput(
      own[0]?.from === from && own.at(-1)!.to === to,
      `/sections/${k}`,
      `Section ${id} is not cut at joints`,
    );
    const origin = stationOf(from),
      size = round(stationOf(to) - origin);
    const first = elementId(own[0]!);
    const at = (position: number) => ({ joint: first, offset: round(stationOf(position) - origin) });
    const elements = own.map((s) => {
      const id = elementId(s);
      const length = round(stationOf(s.to) - stationOf(s.from));
      return s.turn === 0
        ? { kind: 'straight', id, length }
        : { kind: 'arc', id, length, radius: round(length / Math.abs(s.turn)), turn: s.turn > 0 ? 'left' : 'right' };
    });
    // The sky keeps its direction in the world: each Section's frame faces the heading its plan reaches.
    const yawOrigin = round(wrapDegrees(heading));
    for (const e of elements)
      if (e.kind === 'arc') heading += (((e.turn === 'left' ? 1 : -1) * e.length) / e.radius!) * (180 / Math.PI);

    const knots: [number, number][] = [
      [from, widthAt(from)],
      ...widths.filter(([at]) => at > from && at < to),
      [to, widthAt(to)],
    ];
    const lanes = LANE_IDS.flatMap((id) => {
      const values = knots.map(([position, w]) => [position, m(lanesAt(w)[id])] as const);
      if (values.every(([, v]) => v === 0)) return [];
      const width = values.every(([, v]) => v === values[0]![1])
        ? values[0]![1]
        : simplified(values.map(([p, v]) => [p, v])).map(([position, v]) => ({ at: at(position), width: v }));
      return [id === 'm' ? { kind: 'median', width } : { kind: 'lane', id, width }];
    });
    const has = (id: LaneId) => lanes.some((l) => ('id' in l ? l.id === id : id === 'm'));

    const strip = (
      a: number,
      b: number,
      left: Lateral | null,
      right: Lateral | null,
      color: number | null,
      material: string | null,
    ) => ({
      kind: 'strip',
      start: { joint: first, offset: round(a) },
      end: { joint: first, offset: round(b) },
      left,
      right,
      color,
      material,
    });
    const whole = (left: Lateral | null, right: Lateral | null, color: number | null, material: string | null) =>
      strip(0, size, left, right, color, material);
    // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO.
    const half = STRIPE_PERIOD / 2;
    const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: number) => {
      const phase = h * half - origin;
      const start = phase + Math.ceil((a - phase) / STRIPE_PERIOD - 1e-9) * STRIPE_PERIOD;
      const count = Math.floor((b - start - half) / STRIPE_PERIOD + 1e-9) + 1;
      if (count < 1) return [];
      const element = strip(start, start + half, left, right, color, null);
      return [count === 1 ? element : { kind: 'repeat', every: STRIPE_PERIOD, count, elements: [element] }];
    };
    // A line's color over each half where it differs from the surface's.
    const line = (colors: readonly number[], a: number, b: number, left: Lateral, right: Lateral) =>
      ([0, 1] as const).flatMap((h) =>
        colors[h] === surface.rgb555[h] ? [] : halves(h, a, b, left, right, colors[h]!),
      );
    // The stretches of this Section, Section metres, where the road width is at least `w`.
    const stretches = (w: number) =>
      stretchesFrom(knots, w).map(([a, b]) => [stationOf(a) - origin, stationOf(b) - origin] as const);
    const lineAt = (id: string, stretch: readonly (readonly [number, number])[]) =>
      stretch.flatMap(([a, b]) =>
        line(laneLines.rgb555, a, b, lane(id, 'right', -lineHalf), lane(id, 'right', lineHalf)),
      );
    const everywhere = [[0, size]] as const;
    const strips = [
      // The ground, sand beside the roads and between them, and the surface, each by half.
      whole(null, null, GROUND[1], null),
      ...halves(0, 0, size, null, null, GROUND[0]),
      whole(boundary('outer-left'), boundary('road-left'), null, 'SAND'),
      whole(boundary('road-right'), boundary('outer-right'), null, 'SAND'),
      whole(boundary('road-left'), boundary('road-right'), surface.rgb555[1]!, 'ASPHALT'),
      ...(surface.rgb555[0] === surface.rgb555[1]
        ? []
        : halves(0, 0, size, boundary('road-left'), boundary('road-right'), surface.rgb555[0]!)),
      ...(has('m')
        ? [
            whole(lane('c', 'right'), lane('d', 'left'), GROUND[1], 'SAND'),
            ...halves(0, 0, size, lane('c', 'right'), lane('d', 'left'), GROUND[0]),
          ]
        : []),
      // Edge bands: outside the outer lanes, and inside the median where it holds both roads' bands.
      ...line(edges.rgb555, 0, size, boundary('road-left'), lane('a', 'left')),
      ...line(edges.rgb555, 0, size, lane('f', 'right'), boundary('road-right')),
      ...(has('m')
        ? stretches(ROAD_EDGE + EDGE_BAND).flatMap(([a, b]) => [
            ...line(edges.rgb555, a, b, lane('c', 'right'), lane('c', 'right', band)),
            ...line(edges.rgb555, a, b, lane('d', 'left', -band), lane('d', 'left')),
          ])
        : []),
      // Lane lines: each road's, while its inner lane is there.
      ...lineAt('a', everywhere),
      ...lineAt('e', everywhere),
      ...(has('c') ? [...lineAt('b', stretches(HALF_LANE)), ...lineAt('d', stretches(HALF_LANE))] : []),
    ];

    const gates = [];
    // The start grid: the player in the last slot, the camera at GO; the slots ahead alternate lanes c and b.
    if (k === 0)
      gates.push({
        kind: 'start',
        grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
          at: { joint: first, offset: round(options.cameraDistance + (GRID_SLOTS - 1 - i) * GRID_SPACING) },
          lane: i % 2 ? 'c' : 'b',
        })),
        bikeGrid: null,
      });
    if (from < length && length <= to) gates.push({ kind: 'finish', id: `${id}-FINISH`, at: at(length) });

    return {
      id,
      plan: elements,
      profile: sectionProfile(profile, origin, origin + size, k > 0, k + 1 < options.sections.length).map(
        ({ s, y, curveLength }) => ({
          at: { joint: first, offset: round(s - origin) },
          y,
          curveLength,
        }),
      ),
      lanes,
      centerLane: 'b',
      boundaries: [
        { id: 'outer-left', knots: [from, to].map((p) => ({ at: at(p), lateral: lane('a', 'left', -band - VERGE) })) },
        { id: 'road-left', knots: [from, to].map((p) => ({ at: at(p), lateral: lane('a', 'left', -band) })) },
        { id: 'road-right', knots: [from, to].map((p) => ({ at: at(p), lateral: lane('f', 'right', band) })) },
        { id: 'outer-right', knots: [from, to].map((p) => ({ at: at(p), lateral: lane('f', 'right', band + VERGE) })) },
      ],
      strips,
      walls: [],
      openLimits: [],
      // Each object where the camera passes it, its board standing beside the road; the car hits those with a width.
      sprites: objects
        .filter((o) => o.position >= from && o.position < to)
        .map((o) => ({
          kind: 'sprite',
          image: o.image,
          palette: o.palette,
          at: at(o.position),
          lateral: round((o.x - centreLaneX(widthAt(o.position))) * metres),
          groundOffset: round(o.y * metres),
          unselectedLink: null,
          body: o.hit === null ? null : { width: round(o.hit * metres), movable: null },
        })),
      environments: [
        {
          at: at(from),
          name: options.name,
          background: { image: options.sky.image, horizonY: options.sky.horizonY, yawOrigin },
          arrival: 'cut',
        },
      ],
      gates,
    };
  });

  const document = {
    format: 'superoutride.course',
    version: 52,
    name: options.name,
    entry: options.sections[0]!.id,
    maxLaps: 1,
    bearing: 0,
    sections,
    links: options.sections.slice(1).map(({ id }, k) => ({
      id: `${options.sections[k]!.id}-${id}`,
      from: { section: options.sections[k]!.id, lane: 'b' },
      to: id,
    })),
  };
  return { document, profile, crossings, objects };
}

/** The stages raised as courses: their course IDs, names, Sections, skies and runouts (positions on the look-ahead). */
export const OUTRUN_COURSES = Object.freeze([
  {
    id: 'outrun-coconut-beach',
    stage: 0x3c,
    name: 'COCONUT BEACH',
    // The game's first stage: the objects standing at its start are its.
    start: true,
    // The plan passes over itself, the stage's end over its curve at 795: the Sections part between the passages.
    sections: [
      { id: 'coconut-beach-1', from: 0 },
      { id: 'coconut-beach-2', from: 1243 },
    ],
    runout: 225,
    sky: { image: 'coast-sky', horizonY: 320 },
  },
] as const);
