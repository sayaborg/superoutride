/**
 * OUTRUN's roads ([OUTRUN road data](../../../docs/outrun-road-data.md#outruns-roads)): pieces laid one after another
 * as one LINEAR course each. Each span is laid on its road path P, the plan from its heading table, and in the world
 * after the one before; the
 * road's overpasses are kept apart and its passages over itself parted into Sections; its objects stand along the whole
 * road; each Section is written with its lanes, verges, strips (the roads' surfaces, lines and edges as the original
 * draws two roads), objects, gates and skies.
 */
import { BEARING } from '../shared/shared-constants.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { computedValue } from '../../authoring/course-joints.js';
import { COURSE_DOCUMENT_VERSION } from '../../../src/course/course-document.js';
import { OUTRUN_ROAD } from './outrun-cross-section.js';
import {
  arrangements,
  compositeOf,
  narrowGround,
  ROAD_HALF,
  THERE,
  THIN,
  type FeatureEdge,
} from '../out-run-hardware/two-roads.js';
import { sceneryReach } from '../out-run-hardware/strips.js';
import { positionMetres, stripePeriod, type ProgramClock } from '../out-run-hardware/clock.js';
import { CoursePath, type Pose } from '../shared/course-path.js';
import { headingPlan, planFidelity, type PlanElement } from '../shared/heading-plan.js';
import { leastLaneRadius } from '../../../src/course/plan-clearance.js';
import {
  forkSpan,
  stageSpan,
  type DrawnRoad,
  type LaneRef,
  type Span,
  type GoalOptions,
  sliceSpan,
  joinedWidth,
  withEntry,
} from './outrun-pieces.js';
import { GOAL_CENTRE } from './outrun-constants.js';
import type { Quadratic } from '../shared/quadratic.js';
import { bendOf, profileOf, sectionProfile, type Profile } from '../shared/road-profile.js';
import { tableRuns } from '../out-run-hardware/hills.js';
import { overlaps } from '../shared/screen-pieces.js';
import { tableGrades } from '../out-run-hardware/table-grades.js';
import { overpassesOf, partedOverpasses, roadCells } from '../shared/overpasses.js';
import { sectionYawOrigin, skyYawOrigin } from '../shared/sky-baking.js';
import { colorStretches, stretchColor, type ColorStretch } from '../shared/color-stretches.js';
import { BACKGROUND_SCROLL } from '../out-run-hardware/backgrounds.js';
import {
  domainCuts,
  laneCentre,
  micrometre,
  repeated,
  sectionStations,
  simplified,
  stripeHalves,
  writtenPlan,
} from '../shared/section-writing.js';
import { startGate } from '../shared/grid-rule.js';
import type { ForkStretch, Parting, Stage, Stretch } from './outrun-road.js';
import type { HeightTable, Path } from '../out-run-hardware/road-tables.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import { BACK_WIDTH, PIXEL_ASPECT } from '../sega-16/display.js';
import { VECTOR_RESOLUTION } from '../shared/shared-constants.js';
import { UNIT_METRES } from '../out-run-hardware/constants.js';

const metres = (units: number) => micrometre(units * UNIT_METRES);
/** The metres along P to position `p`: P is the plan, a position `positionMetres` along it at OUTRUN's `clock`. */
const alongAt = (clock: ProgramClock) => (p: number) => p * positionMetres(clock);
/** A Strip's color: one, or a pair through a change of sky. */
type StripColor = number | { readonly from: number; readonly to: number };
/** A fork's change of stage in road positions: the original's frames, at its top speed `kmh` × `step` / 65536 a tick. */
const changePositions = (options: RoadOptions, clock: ProgramClock) =>
  ((options.changeFrames / clock.frames) * options.kmh * clock.step) / 65536;

/** A span of a road: what it is, and the lanes its Link leaves by. */
export interface RoadSpan {
  readonly span: Span;
  /** Its Sections' ids' stem. */
  readonly id: string;
  /** The lane its last Section's Link leaves by, toward the next span. */
  readonly leaves: string;
  /** Where the road's GO is in it, if it is a SHORT road's start, whose road reaches back to the road's entry. */
  readonly go?: number;
}

/** A span laid: P, its plan, its pose in the world, its Sections' cuts and their road stations. */
export interface Laid {
  readonly road: RoadSpan;
  /** P from the span's start, its plan's elements. */
  readonly line: CoursePath;
  /** The plan from its heading table, and its fidelity to the table (`planFidelity`). */
  readonly plan: {
    readonly elements: readonly PlanElement[];
    readonly fidelity: ReturnType<typeof planFidelity>;
  };
  /** Its frame in the world: a point of its frame `p` is at `rotate(p) + origin`. */
  readonly world: { readonly x: number; readonly y: number; readonly heading: number };
  readonly cuts: readonly number[];
  /** Each Section's start's road station: the lengths of the Sections before it as written. */
  readonly origins: readonly number[];
  /** The road not taken laid on the road taken's cross-section, if the span has one (`leavingRoad`). */
  readonly leaving: LaidLeaving | null;
}

/**
 * The road not taken as the road taken's cross-section holds it: from whole position `from` to `to`, on side `side`, each of its
 * picture's edges (`OUTRUN_ROAD`) at each whole position between, units right of P, straight between them.
 */
interface LaidLeaving {
  readonly from: number;
  readonly to: number;
  /** The side it lies on, −1 left. */
  readonly side: -1 | 1;
  readonly edges: readonly (readonly number[])[];
}
/** Each edge of the road not taken at `p` within it, units right of P. */
const leavingAt = (leaving: LaidLeaving, p: number) => {
  const k = Math.min(Math.floor(p - leaving.from), leaving.edges.length - 2);
  const t = p - leaving.from - k;
  return leaving.edges[k]!.map((x, i) => x + (leaving.edges[k + 1]![i]! - x) * t);
};

/** The road station of position `p` of span `l`: its Section's start's, and the metres along P from there. */
export function stationOf(l: Pick<Laid, 'cuts' | 'origins' | 'road'>, p: number) {
  const along = alongAt(l.road.span.clock);
  const i = l.cuts.filter((c) => c <= p).length;
  return l.origins[i]! + along(p - (i ? l.cuts[i - 1]! : 0));
}

/** The length of a Section of P `line` over positions `[from, to]` at OUTRUN's `clock`, as written. */
const writtenLength = (line: CoursePath, from: number, to: number, clock: ProgramClock) =>
  writtenPlan(line, { from: alongAt(clock)(from), to: alongAt(clock)(to) }).reduce((sum, e) => sum + e.length, 0);

/** Lane lines at a position: each lane's or median's left and right edge, units right of the centreline. */
const laneLines = (span: Span, p: number) => laneLinesOf(span, span.lanes(p));
/** Lane lines of lane widths `widths` (units), the centre lane's centre at 0. */
function laneLinesOf(span: Span, widths: ReadonlyMap<string, number>) {
  const order = span.order;
  const k = order.indexOf(span.centreLane);
  const lines = new Map<string, { left: number; right: number }>();
  let x = -widths.get(span.centreLane)! / 2;
  for (let i = k; i >= 0; i--) {
    const w = widths.get(order[i]!)!;
    if (i < k) x -= w;
    lines.set(order[i]!, { left: x, right: x + w });
  }
  x = widths.get(span.centreLane)! / 2;
  for (let i = k + 1; i < order.length; i++) {
    const w = widths.get(order[i]!)!;
    lines.set(order[i]!, { left: x, right: x + w });
    x += w;
  }
  return lines;
}
/** Where `ref` lies at `p`, units right of the centreline. */
const lineOf = (span: Span, ref: LaneRef, p: number) => laneLines(span, p).get(ref.lane)![ref.side] + ref.units;

/**
 * The roads drawn at `p`, left to right: each one's index (a span's roads in order, the road not taken after them) and
 * where its picture's edges lie, units right of the centreline.
 */
function drawnAt(
  l: Pick<Laid, 'road' | 'leaving'>,
  p: number,
  lines: (p: number) => ReadonlyMap<string, { readonly left: number; readonly right: number }> = (q) =>
    laneLines(l.road.span, q),
) {
  const { span } = l.road;
  const drawn = span.roads.flatMap((road, index) => {
    if (p < road.from || p >= road.to) return [];
    const centre = lines(p).get(road.centre.lane)![road.centre.side] + road.centre.units;
    return [{ index, edges: OUTRUN_ROAD.map((e) => centre + e.at) }];
  });
  const { leaving } = l;
  if (leaving && p >= leaving.from && p < leaving.to) {
    const off = span.offset.at(p) / UNIT_METRES;
    drawn.push({ index: span.roads.length, edges: leavingAt(leaving, p).map((x) => x - off) });
  }
  const middle = (edges: readonly number[]) => (edges[0]! + edges.at(-1)!) / 2;
  return drawn.sort((a, b) => middle(a.edges) - middle(b.edges));
}

/** A span's asphalt across, metres left and right of P: its drawn roads' outermost surfaces. */
function asphaltAt(l: Pick<Laid, 'road' | 'leaving'>, p: number): [number, number] {
  const edges = drawnAt(l, Math.min(p, l.road.span.length - 1e-9)).flatMap((d) => [d.edges[0]!, d.edges.at(-1)!]);
  const offset = l.road.span.offset.at(p);
  return [-Math.min(...edges) * UNIT_METRES - offset, Math.max(...edges) * UNIT_METRES + offset];
}

/** A point `pose` frame `world` puts in the world. */
const toWorld = (world: Laid['world'], pose: Pose): Pose => {
  const [c, s] = [Math.cos(world.heading), Math.sin(world.heading)];
  return {
    x: world.x + c * pose.x - s * pose.y,
    y: world.y + s * pose.x + c * pose.y,
    heading: pose.heading + world.heading,
  };
};
/** The point `lateral` metres right of `pose`. */
const aside = (pose: Pose, lateral: number): Pose => ({
  x: pose.x + lateral * Math.sin(pose.heading),
  y: pose.y - lateral * Math.cos(pose.heading),
  heading: pose.heading,
});

/** What a road's course takes beside its spans. */
export interface RoadOptions {
  readonly id: string;
  /** Where each picture reaches across from its base point on the ground, metres, by image name. */
  readonly extents: ReadonlyMap<string, readonly [number, number]>;
  /** Each picture's colored columns' width (`coloredColumns`), metres, by image name: a body's most. */
  readonly colored: ReadonlyMap<string, number>;
  readonly name: string;
  readonly tables: ReadonlyMap<number, HeightTable>;
  /** The original's line distances (`lineDistances`), which the tables' pieces are solved with. */
  readonly distances: Float64Array;
  readonly kmh: number;
  /** The frames a fork's change of stage takes from where its width passes 360 (`readStageChangeFrames`). */
  readonly changeFrames: number;
  /**
   * The camera's distance behind the car: the road's entry is this far before GO, where the car stands at road position
   * 0, the camera at the entry.
   */
  readonly cameraDistance: number;
  /**
   * The road's objects, by road position from the entry: given GO's, the road width (units) at each and the
   * original's (straight between its points), where each stretch the original runs ends, and the road's end; with where each checkpoint banner passes the car, and what the
   * placing reports.
   */
  readonly objects: (
    points: readonly {
      readonly position: number;
      readonly count: number;
      readonly type: number;
    }[],
    road: {
      readonly go: number;
      readonly width: (position: number) => number;
      readonly originalWidth: (position: number) => number;
      /** The centre of the road the grid stands on at GO, units from the middle. */
      readonly startRoad: number;
      readonly resets: readonly number[];
      readonly end: number;
      /** Where each goal stretch begins, and its goal's number. */
      readonly goals: readonly { readonly position: number; readonly number: number }[];
    },
  ) => {
    readonly placements: readonly ObjectPlacement[];
    readonly checkpoints: readonly number[];
    readonly report: unknown;
  };
  /** Each stage's sky image and its horizon row. */
  readonly sky: (stage: Stage) => { readonly image: string; readonly horizonY: number };
  /** Each stage's name and its Sections' ids' stem. */
  readonly stageName: (stage: Stage) => string;
}

/** How far a span's lanes reach from P at `p` on `side`, metres: to its outermost lane's edge there. */
function laneReach(span: Span, p: number, side: 'left' | 'right') {
  const widths = span.lanes(p);
  const edges = [...laneLines(span, p)].filter(([id]) => widths.get(id)! > 0).map(([, line]) => line);
  const units = side === 'left' ? -Math.min(...edges.map((l) => l.left)) : Math.max(...edges.map((l) => l.right));
  return units * UNIT_METRES + (side === 'left' ? -1 : 1) * span.offset.at(p);
}

/**
 * Where a span's road comes near itself, its passages parted by the Sections' cut rule (`domainCuts`), where the road
 * is one (its width at most 250, no median between its lanes), before the road's finish where the span holds it: positions. Its other gates lie at
 * its stages' ends.
 */
function passageCuts(span: Span, line: CoursePath, need: (u: number, side: 'left' | 'right') => number): number[] {
  const along = alongAt(span.clock);
  const metres = positionMetres(span.clock);
  const single = span.width.atMost(ROAD_HALF).map((t) => ({ a: along(t.from), b: along(t.to) }));
  const one = (a: number, b: number) =>
    single.map((t) => ({ a: Math.max(t.a, a), b: Math.min(t.b, b) })).filter((t) => t.b > t.a);
  const finish = span.stageEnd === undefined ? [] : [along(span.stageEnd)];
  return domainCuts(line, 0, line.length, need, finish, { step: metres, one, finish: finish[0] }).map(
    (u) => u / metres,
  );
}

/** A span laid on P: the plan from its heading table, and its Sections' cuts. */
function laySpan(road: RoadSpan) {
  const { span } = road;
  const along = alongAt(span.clock);
  const metres = positionMetres(span.clock);
  // The plan, its turns no tighter than its lanes keep.
  const least = (from: number, to: number, side: 'left' | 'right') =>
    leastLaneRadius(
      Math.max(
        ...[from, to, ...Array.from({ length: Math.ceil(to - from) }, (_, k) => from + k), ...span.width.breaks]
          .filter((p) => p >= from && p <= to && p < span.length)
          .map((p) => laneReach(span, p, side)),
      ),
    );
  const plan = headingPlan(span.headings, VECTOR_RESOLUTION, metres, least);
  const line = new CoursePath(
    plan.elements.map((e) => ({ start: along(e.from), length: along(e.to - e.from), turn: e.turn })),
  );
  // The least radius a side's lanes keep, `u` metres along P.
  const need = (u: number, side: 'left' | 'right') =>
    leastLaneRadius(laneReach(span, Math.min(u / metres, span.length - 1e-9), side));
  return {
    line,
    plan: {
      elements: plan.elements,
      fidelity: planFidelity(span.headings, plan.elements, plan.start, metres, VECTOR_RESOLUTION, plan.widened),
    },
    // Its road's passages parted, and the piece's own cuts (a fork's 362).
    cuts: [...new Set([...passageCuts(span, line, need), ...(span.sections ?? [])])].sort((a, b) => a - b),
    leaving: leavingRoad(span, line),
  };
}

/**
 * The road not taken where it leaves on its own curvature (K, 2026-10-24): each edge of its picture where it passes in
 * the world, its centre the road width w out from the mirror of P across P's tangent where the roads part, taken on
 * the road taken's cross-section (P's normal) at each whole position from there; drawn to where the original stops
 * (768), or to the last position where every edge still passes once across, the edge's foot along P still moving on.
 */
function leavingRoad(span: Span, line: CoursePath): LaidLeaving | null {
  const { leaving } = span;
  const along = alongAt(span.clock);
  if (!leaving) return null;
  const origin = line.pose(along(leaving.from));
  const [dx, dy] = [Math.cos(origin.heading), Math.sin(origin.heading)];
  // A point mirrored across P's tangent at the parting.
  const mirrored = (q: Pose) => {
    const [rx, ry] = [q.x - origin.x, q.y - origin.y];
    const along = rx * dx + ry * dy;
    return { x: origin.x + 2 * along * dx - rx, y: origin.y + 2 * along * dy - ry };
  };
  // Edge `k` at position `q`: the mirror of the point that far on the other side of P, its own right outward.
  const edgeAt = (q: number, k: number) =>
    mirrored(aside(line.pose(along(q)), -(leaving.side * span.width.at(q) + OUTRUN_ROAD[k]!.at) * UNIT_METRES));
  // The foot along P of a point, from `u` on, and its lateral there.
  const foot = (point: { x: number; y: number }, u: number) => {
    for (let i = 0; i < 40; i++) {
      const pose = line.pose(Math.min(Math.max(u, 0), line.length));
      const step = (point.x - pose.x) * Math.cos(pose.heading) + (point.y - pose.y) * Math.sin(pose.heading);
      u += step;
      if (Math.abs(step) < 1e-10) break;
    }
    const pose = line.pose(Math.min(Math.max(u, 0), line.length));
    return { u, l: (point.x - pose.x) * Math.sin(pose.heading) - (point.y - pose.y) * Math.cos(pose.heading) };
  };
  // Each edge's feet at quarter positions while they move on along P.
  const STEP = 1 / 4;
  const traces = OUTRUN_ROAD.map((_, k) => {
    const trace: { u: number; l: number }[] = [];
    let u = along(leaving.from);
    for (let q = leaving.from; q <= leaving.to + 1e-9; q += STEP) {
      const f = foot(edgeAt(Math.min(q, leaving.to), k), u);
      if (trace.length && f.u <= trace.at(-1)!.u) break;
      trace.push(f);
      u = f.u;
    }
    return trace;
  });
  const last = Math.min(...traces.map((trace) => trace.at(-1)!.u)) / positionMetres(span.clock);
  const to = last >= leaving.to - 1e-9 ? leaving.to : leaving.from + Math.floor(last - leaving.from);
  const positions = [...Array.from({ length: Math.ceil(to - leaving.from) }, (_, i) => leaving.from + i), to].filter(
    (p, i, all) => i === 0 || p > all[i - 1]!,
  );
  if (positions.length < 2) return null;
  const edges = positions.map((p) =>
    traces.map((trace) => {
      const u = along(p);
      const i = Math.max(
        1,
        trace.findIndex((f) => f.u >= u),
      );
      const [a, b] = [trace[i - 1]!, trace[i]!];
      return (a.l + ((b.l - a.l) * (u - a.u)) / (b.u - a.u || 1)) / UNIT_METRES;
    }),
  );
  return { from: leaving.from, to, side: leaving.side, edges };
}

/** Each span laid on P, and in the world after the one before, its Link's lane continuing as its centre lane. */
function layRoad(spans: readonly RoadSpan[]): Laid[] {
  const laid: Laid[] = [];
  let station = 0;
  for (const road of spans) {
    const { line, plan, cuts, leaving } = laySpan(road);
    const before = laid.at(-1);
    let world = { x: 0, y: 0, heading: 0 };
    if (before) {
      const end = before.road.span.length;
      const pose = toWorld(before.world, before.line.pose(alongAt(before.road.span.clock)(end)));
      const ref = { lane: before.road.leaves, side: 'left' as const, units: 0 };
      const leaves =
        before.road.span.offset.at(end) +
        (lineOf(before.road.span, ref, end) + before.road.span.lanes(end).get(before.road.leaves)! / 2) * UNIT_METRES;
      const at = aside(pose, leaves);
      // The span's centre lane's centre at its start, on its frame.
      const first = aside(line.pose(0), road.span.offset.at(0));
      const heading = at.heading - first.heading;
      const [c, s] = [Math.cos(heading), Math.sin(heading)];
      world = { x: at.x - (c * first.x - s * first.y), y: at.y - (s * first.x + c * first.y), heading };
    }
    const ends = [...cuts, road.span.length];
    const origins = ends.map((to, i) => {
      const origin = station;
      station += writtenLength(line, i ? ends[i - 1]! : 0, to, road.span.clock);
      return origin;
    });
    laid.push({ road, line, plan, world, cuts, origins, leaving });
  }
  return laid;
}

/**
 * A laid road's profile, by road station: its height points' tables run along the whole road, each by its screen's
 * piece (`tableGrades`); the road's overpasses kept apart; bends broken at its Sections' cuts. With its end, the pieces'
 * own profile and overlaps, and its overpasses.
 */
function roadProfile(laid: readonly Laid[], options: Pick<RoadOptions, 'tables' | 'distances' | 'kmh'>) {
  const last = laid.at(-1)!;
  const { clock } = last.road.span;
  const along = alongAt(clock);
  const metres = positionMetres(clock);
  const end = last.origins.at(-1)! + writtenLength(last.line, last.cuts.at(-1) ?? 0, last.road.span.length, clock);
  // A road position's station: a piece may run on past its span's end into the next.
  const starts = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  // The road's last position is its end, as its last Section's written length puts it.
  const stationAt = (position: number) => {
    if (position >= starts.at(-1)! + last.road.span.length) return end;
    const k = Math.max(0, starts.filter((p) => p <= position).length - 1);
    const l = laid[k]!;
    return stationOf(l, Math.min(position - starts[k]!, l.road.span.length));
  };
  // The road's height points in its order, by road position: run by one `tableRuns`, as the original runs on.
  const points = laid.flatMap((l, k) =>
    l.road.span.heights.flatMap((piece) =>
      piece.points.map((p) => ({ ...p, position: starts[k]! + piece.from + p.position })),
    ),
  );
  const runs = tableRuns(points, options.tables, () => options.kmh, clock);
  const grades = tableGrades(runs, options.kmh, stationAt, end, { clock, distances: options.distances });
  // The overpasses: the road's cells a position each, its asphalt across, by the metres along P from its start.
  const spanAt = (u: number) => {
    const position = u / metres;
    const k = Math.max(0, starts.filter((p) => p <= position).length - 1);
    return { l: laid[k]!, p: Math.min(position - starts[k]!, laid[k]!.road.span.length) };
  };
  const cells = roadCells(
    {
      aside: (u, lateral) => {
        const { l, p } = spanAt(u);
        return aside(toWorld(l.world, l.line.pose(along(p))), lateral);
      },
    },
    {
      from: 0,
      to: along(starts.at(-1)! + last.road.span.length),
      step: metres,
      sides: (u) => {
        const { l, p } = spanAt(u);
        return asphaltAt(l, p);
      },
    },
  );
  const overpasses = overpassesOf(
    cells.pairs.map(([a, b]) => [stationAt(a / metres), stationAt(b / metres)] as const),
    metres,
  );
  const cutStations = laid.flatMap((l) => l.origins).slice(1);
  const parted = partedOverpasses(grades.changes, overpasses, end);
  const profile = profileOf(parted.changes.filter((c) => c.from >= 0 && c.to <= end).map(bendOf), cutStations);
  return {
    end,
    profile,
    screenProfile: profileOf(grades.changes.map(bendOf)),
    overlaps: overlaps(grades.stretches),
    overpasses,
    partings: parted.partings,
    rampRadius: parted.radius,
  };
}

/**
 * One road as a course document, its Positions still measured from each Section's first joint, and what it reports:
 * spans in order, the first the entry, each joined to the next by its `leaves` lane. The first span's start is the
 * grid's; a stage reached through a fork has its checkpoint where its banner passes the car; the last stage ends in its
 * finish. Its grades are its height tables' pieces; its overpasses are kept apart; where
 * a span's coordinate domain passes over itself, a cut where the road is one parts its passages.
 */
export function outrunRoad(spans: readonly RoadSpan[], options: RoadOptions) {
  const { clock } = spans[0]!.span;
  const along = alongAt(clock);
  // The road's entry: the camera's distance before GO, where the camera stands; a SHORT road's its start's own road, a
  // LONG road's straight at its start's width.
  const go = options.cameraDistance / positionMetres(clock);
  const [first] = spans;
  const entered =
    first!.go === undefined ? withEntry(first!.span, go) : sliceSpan(first!.span, first!.go - go, first!.span.length);
  const laid = layRoad([{ ...first!, span: entered }, ...spans.slice(1)]);
  const { end, profile, screenProfile, overlaps, overpasses, partings, rampRadius } = roadProfile(laid, options);

  // The objects along the whole road, by road position.
  const positions = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  const spanAt = (position: number) => {
    const k = Math.max(0, positions.filter((p) => p <= position).length - 1);
    return { k, p: Math.min(position - positions[k]!, laid[k]!.road.span.length) };
  };
  const roadEnd = positions.at(-1)! + laid.at(-1)!.road.span.length;
  const objects = options.objects(
    laid.flatMap((l, k) => l.road.span.scenery.map((p) => ({ ...p, position: p.position + positions[k]! }))),
    {
      go,
      width: (position) => {
        const { k, p } = spanAt(position);
        return laid[k]!.road.span.width.at(p);
      },
      originalWidth: (position) => {
        const { k, p } = spanAt(position);
        return laid[k]!.road.span.original.at(p);
      },
      // The centre lane is the grid's road's middle lane.
      startRoad: entered.offset.at(go) / UNIT_METRES - entered.middle(go),
      resets: laid.flatMap((l, k) => l.road.span.resets.map((r) => positions[k]! + r)),
      end: roadEnd,
      goals: laid.flatMap((l, k) => {
        const goal = l.road.span.goal;
        return goal ? [{ position: positions[k]! + goal.at, number: goal.number }] : [];
      }),
    },
  );
  const placed = objects.placements.flatMap((o) => {
    const { k, p } = spanAt(o.position);
    const l = laid[k]!;
    // Its point in the world: the original's x from its middle at its position, across from P there.
    const base = l.line.pose(along(p));
    const across = (l.road.span.middle(p) + o.x) * UNIT_METRES;
    const point = toWorld(l.world, aside(base, across));
    const found = project(laid, k, point, p);
    return found ? [{ ...found, object: o }] : [];
  });
  // How far the pictures on the ground reach beyond the outermost lanes, a strip by its nearest picture.
  const reach = sceneryReach(
    placed
      .filter(({ object: o }) => o.y === 0)
      .map(({ k, p, lateral, object: o }) => {
        const span = laid[k]!.road.span;
        const q = Math.min(p, span.length - 1e-9);
        const edges = [laneReach(span, q, 'left'), laneReach(span, q, 'right')] as const;
        return { lateral, extent: options.extents.get(o.image)!, edges };
      }),
  );
  // The Sections, SAND reaching `ground` beyond the outermost lanes.
  // Every stage's sky faces as the first's does at the course's GO, so the two a fork wipes between share one origin.
  const courseStart = laid[0]!.world.heading + laid[0]!.line.pose(along(go)).heading;
  const checkpoints = objects.checkpoints.map((position) => {
    const { k, p } = spanAt(position);
    return { k, p };
  });
  const write = (ground: number) => {
    const sections: unknown[] = [];
    const links: { id: string; from: { section: string; lane: string }; to: string }[] = [];
    laid.forEach((l, k) => {
      const starts = [0, ...l.cuts];
      const ids = starts.map((_, i) => (i === 0 ? l.road.id : `${l.road.id}-${i + 1}`));
      starts.forEach((from, i) => {
        const to = starts[i + 1] ?? l.road.span.length;
        const last = k === laid.length - 1 && i === starts.length - 1;
        const name = options.stageName(l.road.span.stages[0]!.stage).toUpperCase();
        const cp = checkpoints.find((c) => c.k === k && c.p > from && c.p <= to);
        // The last stage's end is the road's finish.
        const end = l.road.span.stageEnd;
        const goal = end !== undefined && end > from && end <= to ? { id: `${name}-GOAL`, p: end } : null;
        sections.push(
          sectionDocument(l, {
            id: ids[i]!,
            from,
            to,
            roadOrigin: l.origins[i]!,
            first: k === 0 && i === 0,
            joinsBefore: k > 0 || i > 0,
            joinsAfter: !last,
            checkpoints: cp ? [{ id: `${name}-CP`, p: cp.p }] : [],
            finish: goal,
            objects: placed.filter((o) => o.k === k && o.p >= from && o.p < to),
            profile,
            courseStart,
            ground,
            options,
          }),
        );
        const next = starts[i + 1] !== undefined ? ids[i + 1] : laid[k + 1]?.road.id;
        if (next)
          links.push({
            id: `${ids[i]}-${next}`,
            from: { section: ids[i]!, lane: starts[i + 1] !== undefined ? l.road.span.centreLane : l.road.leaves },
            to: next,
          });
      });
    });
    return {
      format: 'superoutride.course',
      version: COURSE_DOCUMENT_VERSION,
      name: options.name,
      entry: laid[0]!.road.id,
      maxLaps: 1, // a non-circuit runs once (the course format's rule)
      bearing: BEARING,
      sections,
      links,
    };
  };
  return {
    /** The road's document, SAND reaching `ground` beyond the lanes, the original's lateral limit. */
    write,
    laid,
    end,
    profile,
    screenProfile,
    overlaps,
    overpasses,
    partings,
    rampRadius,
    objects: placed.length,
    /** How far the pictures on the ground reach beyond the outermost lanes (`sceneryReach`), metres. */
    reach,
    placing: objects.report,
    fidelity: laid.map((l) => ({ span: l.road.id, ...l.plan.fidelity })),
  };
}

/** The position and lateral `point` (world) stands at on a span's P, near position `p` of span `k` or its neighbours. */
function project(laid: readonly Laid[], k: number, point: Pose, p: number) {
  const along = alongAt(laid[k]!.road.span.clock);
  const metres = positionMetres(laid[k]!.road.span.clock);
  for (const j of [k, k + 1, k - 1]) {
    const l = laid[j];
    if (!l) continue;
    const [c, s] = [Math.cos(-l.world.heading), Math.sin(-l.world.heading)];
    const [dx, dy] = [point.x - l.world.x, point.y - l.world.y];
    const local = { x: c * dx - s * dy, y: s * dx + c * dy };
    let q = j === k ? p : j > k ? 0 : l.road.span.length;
    for (let i = 0; i < 30; i++) {
      const pose = l.line.pose(along(Math.min(Math.max(q, 0), l.road.span.length)));
      const step = ((local.x - pose.x) * Math.cos(pose.heading) + (local.y - pose.y) * Math.sin(pose.heading)) / metres;
      q += step;
      if (Math.abs(step) < 1e-9) break;
    }
    if (q < 0 || q > l.road.span.length) continue;
    const pose = l.line.pose(along(q));
    const lateral = (local.x - pose.x) * Math.sin(pose.heading) - (local.y - pose.y) * Math.cos(pose.heading);
    return { k: j, p: q, lateral };
  }
  return null;
}

type Lateral = Record<string, unknown> | number;
const laneLateral = (lane: string, side: string, offset: number): Lateral => ({
  lane,
  side,
  offset: micrometre(offset),
});
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });

/** One Section of a laid span, `[from, to]` its positions. */
function sectionDocument(
  l: Laid,
  section: {
    readonly id: string;
    readonly from: number;
    readonly to: number;
    /** Its start's road station. */
    readonly roadOrigin: number;
    readonly first: boolean;
    readonly joinsBefore: boolean;
    readonly joinsAfter: boolean;
    readonly checkpoints: readonly { readonly id: string; readonly p: number }[];
    readonly finish: { readonly id: string; readonly p: number } | null;
    readonly objects: readonly { readonly p: number; readonly lateral: number; readonly object: ObjectPlacement }[];
    readonly profile: Profile;
    /** The road's world heading at the course's GO, every sky's origin. */
    readonly courseStart: number;
    /** How far SAND reaches beyond the outermost lanes, metres. */
    readonly ground: number;
    readonly options: RoadOptions;
  },
) {
  const { span } = l.road;
  const along = alongAt(span.clock);
  const { line } = l;
  const { from, to } = section;
  // Its lanes as the Section has them: where a cut parts two lane arrangements (a fork's 362), each Section its own.
  const own: Span = { ...span, lanes: (p) => span.lanes(Math.min(Math.max(p, from + 1e-9), to - 1e-9)) };
  const origin = along(from);
  const { roadOrigin } = section;
  /** The station of position `p` from the Section's start. */
  const local = (p: number) => along(p) - origin;

  // The plan: P's elements over [from, to], as written; the Section's length theirs.
  const elements = writtenPlan(line, { from: along(from), to: along(to) });
  const { size, joint: first, at: atStation } = sectionStations(elements);
  const at = (p: number) => atStation(local(p));

  // The lanes and the centre lane's centre at each knot, where a width, the centre lane's centre or a lane changes
  // slope, straight between; a lane or median 0 throughout left out.
  const knots = [
    ...new Set([
      from,
      to,
      ...span.width.breaks,
      ...span.offset.breaks,
      ...span.laneBreaks,
      ...span.roads.flatMap((r) => [r.from, r.to]),
    ]),
  ]
    .filter((p) => p >= from && p <= to)
    .sort((a, b) => a - b);
  const widths = knots.map((p) => own.lanes(p));
  const present = span.order.filter((name) => widths.some((w) => w.get(name)! > THERE));
  const lineOfValues = (values: [number, number][], name: 'width' | 'lateral') => {
    const simple = simplified(values);
    return simple.every(([, v]) => v === simple[0]![1])
      ? simple[0]![1]
      : simple.map(([s, v]) => ({ at: atStation(s), [name]: v }));
  };
  const lanes = present.map((name) => {
    const width = lineOfValues(
      knots.map((p, i) => [micrometre(local(p)), metres(widths[i]!.get(name)!)]),
      'width',
    );
    return name.startsWith('m') ? { kind: 'median', width } : { kind: 'lane', id: name, width };
  });
  const centerLateral = lineOfValues(
    knots.map((p) => [micrometre(local(p)), micrometre(span.offset.at(p))]),
    'lateral',
  );
  // The lanes' lines as written: each straight between the Section's knots, as the format lays them.
  const knotLines = widths.map((w) => laneLinesOf(span, w));
  const written = (p: number) => {
    const i = Math.max(0, Math.min(knots.length - 2, knots.findIndex((k) => k > p) - 1));
    const [a, b] = [knotLines[i]!, knotLines[i + 1] ?? knotLines[i]!];
    const t = knots[i + 1] === undefined ? 0 : (p - knots[i]!) / (knots[i + 1]! - knots[i]!);
    const lines = new Map<string, { left: number; right: number }>();
    for (const [lane, l] of a) {
      const m = b.get(lane)!;
      lines.set(lane, { left: l.left + (m.left - l.left) * t, right: l.right + (m.right - l.right) * t });
    }
    return lines;
  };
  const ref = (r: LaneRef, more = 0) => {
    requireInput(present.includes(r.lane), `/sections/${section.id}`, `Section ${section.id} has no lane ${r.lane}`);
    return laneLateral(r.lane, r.side, r.units * UNIT_METRES + more);
  };

  // The verges: the ground from the Section's outermost lanes, zero wide ones counted, its width beyond them.
  const outermost = present.filter((name) => !name.startsWith('m'));
  const verges = {
    left: { lane: outermost[0]!, side: 'left' as const, units: 0 },
    right: { lane: outermost.at(-1)!, side: 'right' as const, units: 0 },
  };
  const verge = (side: 'left' | 'right') => ref(verges[side], (side === 'left' ? -1 : 1) * section.ground);
  // A verge's lateral at a Section station, metres right of P.
  const vergeAt = (side: 'left' | 'right') => (s: number) => {
    const p = (s + origin) / positionMetres(span.clock);
    const edge = written(p).get(verges[side].lane)![verges[side].side];
    return span.offset.at(p) + edge * UNIT_METRES + (side === 'left' ? -1 : 1) * section.ground;
  };

  // The road not taken within the Section: each edge of its picture a Boundary at each whole position.
  const leaving = l.leaving && l.leaving.from < to && l.leaving.to > from ? l.leaving : null;
  const leavingFrom = leaving ? Math.max(leaving.from, from) : 0;
  const leavingTo = leaving ? Math.min(leaving.to, to) : 0;
  const leavingAtSection = leaving
    ? [
        leavingFrom,
        ...Array.from({ length: Math.ceil(leavingTo - leaving.from) }, (_, i) => leaving.from + i).filter(
          (p) => p > leavingFrom && p < leavingTo,
        ),
        leavingTo,
      ]
    : [];
  const leavingBoundaries = leaving
    ? OUTRUN_ROAD.map((_, k) => ({
        id: `leaving-${k}`,
        knots: leavingAtSection.map((p) => ({
          at: at(p),
          lateral: micrometre(leavingAt(leaving, p)[k]! * UNIT_METRES),
        })),
      }))
    : [];
  /** A road's edge as written: a lane's line, or the road not taken's Boundary. */
  const edgeRef = (edge: FeatureEdge): Lateral => {
    if (edge.road === span.roads.length) return boundary(`leaving-${OUTRUN_ROAD.findIndex((e) => e.at === edge.at)}`);
    const road = span.roads[edge.road]!;
    return ref({ lane: road.centre.lane, side: road.centre.side, units: road.centre.units + edge.at });
  };
  /** Where a road's edge lies at `p`, units right of the centreline, as written. */
  const edgeAt = (edge: FeatureEdge, p: number) => {
    if (edge.road === span.roads.length)
      return leavingAt(leaving!, p)[OUTRUN_ROAD.findIndex((e) => e.at === edge.at)]! - span.offset.at(p) / UNIT_METRES;
    const road = span.roads[edge.road]!;
    return written(p).get(road.centre.lane)![road.centre.side] + road.centre.units + edge.at;
  };

  // The strips, each stage's colors over the Section from where its sky comes in, changing over the same stretch.
  const stretches = colorStretches(
    span.stages.map((st) => st.stage),
    span.stages.slice(1).map((st) => ({ at: st.from, length: changePositions(section.options, span.clock) })),
    0,
    span.length,
  )
    .map((t) => ({ ...t, from: Math.max(t.from, from), to: Math.min(t.to, to) }))
    .filter((t) => t.to > t.from);
  const strip = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    color: StripColor | null,
    material: string | null,
  ) => ({
    kind: 'strip',
    start: atStation(a),
    end: atStation(b),
    left,
    right,
    color,
    material,
  });
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO.
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: StripColor) =>
    stripeHalves(h, stripePeriod(span.clock), section.options.cameraDistance - roadOrigin, a, b, (from, to) =>
      strip(from, to, left, right, color, null),
    );
  // Half `h` of every period in a stretch's two colors, but where it is the colors beneath in every stage it shows.
  const colored = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    t: ColorStretch<Stage>,
    two: (stage: Stage) => readonly number[],
    under: (stage: Stage) => readonly number[],
  ) =>
    ([0, 1] as const).flatMap((h) =>
      [t.colors, t.before ?? t.colors].every((stage) => two(stage)[h] === under(stage)[h])
        ? []
        : halves(
            h,
            a,
            b,
            left,
            right,
            stretchColor(t, (stage) => two(stage)[h]!),
          ),
    );
  /** A road's surface in a stretch: its second color over all of it, its first over half of every period. */
  const surfaced = (
    a: number,
    b: number,
    left: Lateral,
    right: Lateral,
    t: ColorStretch<Stage>,
    material: string | null,
  ) => [
    strip(
      a,
      b,
      left,
      right,
      stretchColor(t, (stage) => stage.colors.surface.rgb555[1]!),
      material,
    ),
    ...colored(
      a,
      b,
      left,
      right,
      t,
      (stage) => stage.colors.surface.rgb555,
      (stage) => {
        const whole = stage.colors.surface.rgb555[1]!;
        return [whole, whole];
      },
    ),
  ];
  const stations = (p: number) => micrometre(local(p));
  /** A position's station, the Section's ends its own. */
  const edge = (p: number) => (p <= from ? 0 : p >= to ? size : stations(p));
  const strips: unknown[] = [
    ...stretches.flatMap((t) => [
      strip(
        edge(t.from),
        edge(t.to),
        null,
        null,
        stretchColor(t, (stage) => stage.groundStripes[1]),
        null,
      ),
      ...halves(
        0,
        edge(t.from),
        edge(t.to),
        null,
        null,
        stretchColor(t, (stage) => stage.groundStripes[0]),
      ),
    ]),
    strip(0, size, verge('left'), verge('right'), null, 'SAND'),
  ];
  for (const road of span.roads)
    for (const t of stretches) {
      const [a, b] = [Math.max(road.from, t.from), Math.min(road.to, t.to)];
      if (b <= a) continue;
      const [left, right] = [ref(road.centre, -ROAD_HALF * UNIT_METRES), ref(road.centre, ROAD_HALF * UNIT_METRES)];
      strips.push(...surfaced(stations(a), stations(b), left, right, t, 'ASPHALT'));
    }
  // Between two roads, their asphalt where the ground there is narrow (`narrowGround`): across both roads, from the
  // left one's outer edge to the right one's, which never cross.
  if (span.roads.length === 2) {
    for (const q of narrowGround(span.width, ROAD_HALF, UNIT_METRES)) {
      const [a, b] = [
        Math.max(q.from, from, ...span.roads.map((r) => r.from)),
        Math.min(q.to, to, ...span.roads.map((r) => r.to)),
      ];
      if (b <= a) continue;
      const [left, right] = [...span.roads].sort(
        (r, t) => lineOf(span, r.centre, (a + b) / 2) - lineOf(span, t.centre, (a + b) / 2),
      ) as [DrawnRoad, DrawnRoad];
      strips.push(
        strip(
          stations(a),
          stations(b),
          ref(left.centre, -ROAD_HALF * UNIT_METRES),
          ref(right.centre, ROAD_HALF * UNIT_METRES),
          null,
          'ASPHALT',
        ),
      );
    }
  }
  // The road not taken: its surface's color across it, its ASPHALT only within the ground, cut where its edges cross the
  // ground's edge (a Strip cannot erase material).
  const clipped: { id: string; knots: { at: unknown; lateral: Lateral }[] }[] = [];
  if (leaving && leavingTo > leavingFrom) {
    const [left, right] = [boundary('leaving-0'), boundary(`leaving-${OUTRUN_ROAD.length - 1}`)];
    const a = stations(leavingFrom);
    for (const t of stretches) {
      const [c, d] = [Math.max(leavingFrom, t.from), Math.min(leavingTo, t.to)];
      if (d <= c) continue;
      strips.push(...surfaced(stations(c), stations(d), left, right, t, null));
    }
    const side = leaving.side > 0 ? 'right' : 'left';
    const sign = leaving.side;
    const ground = vergeAt(side);
    const metresAt = (p: number, k: number) => leavingAt(leaving, p)[k]! * UNIT_METRES;
    // Beyond the ground (toward the road not taken's side): how far the road's inner and outer edges reach past it.
    const [inner, outer] = sign > 0 ? [0, OUTRUN_ROAD.length - 1] : [OUTRUN_ROAD.length - 1, 0];
    const past = (p: number, k: number) => sign * (metresAt(p, k) - ground(local(p)));
    // Where an edge comes `by` metres short of the ground's edge, between two positions either side of it.
    const meeting = (lo: number, hi: number, k: number, by = 0) => {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (past(mid, k) + by > 0 === past(lo, k) + by > 0) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    // Where the road is within the ground at all: until its inner edge comes within `THIN` of the ground's edge.
    const samples = [
      ...new Set([...leavingAtSection, ...span.laneBreaks.filter((p) => p > leavingFrom && p < leavingTo)]),
    ].sort((x, y) => x - y);
    let end = leavingTo;
    for (let i = 0; i + 1 < samples.length; i++)
      if (past(samples[i + 1]!, inner) + THIN >= 0) {
        end = past(samples[i]!, inner) + THIN >= 0 ? samples[i]! : meeting(samples[i]!, samples[i + 1]!, inner, THIN);
        break;
      }
    if (end > leavingFrom) {
      // Its outer edge held at the ground's edge where it reaches past it.
      const knots: { at: unknown; lateral: Lateral }[] = [];
      const kept = samples.filter((p) => p < end);
      [...kept, end].forEach((p, i, all) => {
        if (i > 0 && past(all[i - 1]!, outer) > 0 !== past(p, outer) > 0)
          knots.push({ at: at(meeting(all[i - 1]!, p, outer)), lateral: verge(side) });
        knots.push({
          at: at(p),
          lateral: past(p, outer) >= 0 || p === end ? verge(side) : micrometre(metresAt(p, outer)),
        });
      });
      clipped.push({ id: 'leaving-ground', knots });
      const edge = boundary(`leaving-${inner}`);
      strips.push(
        strip(
          a,
          stations(end),
          sign > 0 ? edge : boundary('leaving-ground'),
          sign > 0 ? boundary('leaving-ground') : edge,
          null,
          'ASPHALT',
        ),
      );
    }
  }
  // The lines and edge bands the roads' picture shows, a stretch of one arrangement at a time.
  for (const regime of regimes(l, from, to, written)) {
    for (const interval of regime.intervals) {
      // Its width as the Section's lanes give it, straight between their knots; an end where it narrows to nothing
      // drawn in to where it is `THIN` wide.
      const width = (p: number) => (edgeAt(interval.right, p) - edgeAt(interval.left, p)) * UNIT_METRES;
      const inward = (from: number, toward: number) => {
        if (width(from) >= THIN) return from;
        let [lo, hi] = [from, toward];
        if (width(hi) < THIN) return null;
        for (let i = 0; i < 50; i++) {
          const mid = (lo + hi) / 2;
          if (width(mid) >= THIN) hi = mid;
          else lo = mid;
        }
        return hi;
      };
      const mid = (regime.from + regime.to) / 2;
      const [a, b] = [inward(regime.from, mid), inward(regime.to, mid)];
      if (a === null || b === null || b - a < 1e-3) continue;
      for (const t of stretches) {
        const [e, f] = [Math.max(a, t.from), Math.min(b, t.to)];
        if (f - e < 1e-3) continue;
        strips.push(
          ...colored(
            stations(e),
            stations(f),
            edgeRef(interval.left),
            edgeRef(interval.right),
            t,
            (stage) => (interval.paint === 'line' ? stage.colors.laneLines.rgb555 : stage.colors.edges.rgb555),
            (stage) => stage.colors.surface.rgb555,
          ),
        );
      }
    }
  }

  // The gates.
  const gates: unknown[] = [];
  // The player's slot at GO, the camera's distance on from the road's entry, at the centre lane's centre, where the
  // original's car stands (the width's first change carries its x from 0 to the left road's centre, 0xC286), as on
  // COCONUT BEACH's left road (b), whichever road; the rule's lanes that one and the one left of it, the car's lateral
  // limit its three lanes' half and the ground beyond about it. The original places no rival.
  if (section.first) {
    const lanes = [span.order[span.order.indexOf(span.centreLane) - 1]!, span.centreLane] as const;
    const laneWidth = span.lanes(from).get(span.centreLane)! * UNIT_METRES;
    const reach = (3 * laneWidth) / 2 + section.ground;
    const player = { s: section.options.cameraDistance, lateral: laneCentre(span.centreLane) };
    gates.push(
      startGate((s) => atStation(micrometre(s)), {
        player,
        originals: { car: [], bike: [] },
        lanes,
        laneWidth,
        limits: [reach, reach],
      }),
    );
  }
  for (const c of section.checkpoints) gates.push({ kind: 'checkpoint', id: c.id, at: at(c.p) });
  if (section.finish) gates.push({ kind: 'finish', id: section.finish.id, at: at(section.finish.p) });
  // Where the roads part, the side the road takes: route information the HUD shows.
  const { choice } = span;
  if (choice && choice.parts >= from && choice.parts < to)
    gates.push({ kind: 'parting', at: at(choice.parts), side: choice.side < 0 ? 'left' : 'right' });

  // The skies: each stage's from where its stretch begins, all facing as at the course's GO.
  const heading = l.world.heading + line.pose(origin).heading;
  const yawOrigin = micrometre(
    sectionYawOrigin(
      skyYawOrigin(BACKGROUND_SCROLL.middle, BACK_WIDTH),
      ((heading - section.courseStart) * 180) / Math.PI,
    ),
  );
  const environments = span.stages
    .filter((s, i) => (span.stages[i + 1]?.from ?? Infinity) > from && s.from < to)
    .map((s) => ({
      // A sky changes where the original changes it, as the car comes to it.
      at: at(Math.max(s.from, from)),
      name: section.options.stageName(s.stage),
      background: { ...section.options.sky(s.stage), yawOrigin },
      // A fork's next stage changes over the frames the original takes, at its top speed, from its knot.
      transition:
        s.from >= from && s.from > 0
          ? micrometre(alongAt(span.clock)(changePositions(section.options, span.clock)))
          : 0,
    }));

  return {
    id: section.id,
    plan: elements,
    profile: sectionProfile(
      section.profile,
      roadOrigin,
      roadOrigin + size,
      section.joinsBefore,
      section.joinsAfter,
    ).map(({ s, y, curveLength }) => ({ at: { joint: first, offset: computedValue(s - roadOrigin) }, y, curveLength })),
    lanes,
    centerLane: span.centreLane,
    centerLateral,
    boundaries: [...leavingBoundaries, ...clipped],
    strips,
    walls: [],
    openLimits: [],
    sprites: repeated([
      ...section.objects.map(({ p, lateral, object: o }) => ({
        kind: 'sprite',
        image: o.image,
        palette: o.palette,
        at: at(p),
        lateral: micrometre(lateral),
        groundOffset: micrometre(o.y * UNIT_METRES * PIXEL_ASPECT),
        unselectedLink: null,
        // As wide as its hit extents, at most its picture's colored columns.
        body:
          o.hit === null
            ? null
            : {
                width: micrometre(Math.min(o.hit * UNIT_METRES, section.options.colored.get(o.image)!)),
                movable: null,
              },
      })),
    ]),
    environments,
    gates,
  };
}

/**
 * The stretches of `[from, to]` over which the roads' picture keeps one arrangement: the same roads drawn, and the
 * same lines and edge bands, each between the same features (`arrangements`), between each road's ends.
 */
function regimes(
  l: Pick<Laid, 'road' | 'leaving'>,
  from: number,
  to: number,
  lines: (p: number) => ReadonlyMap<string, { readonly left: number; readonly right: number }>,
) {
  const { span } = l.road;
  const pictureAt = (p: number) => {
    const drawn = drawnAt(l, p, lines);
    const intervals = compositeOf(
      drawn.map((d) => d.edges),
      OUTRUN_ROAD,
    ).map((i) => ({
      paint: i.paint,
      left: { road: drawn[i.left.road]!.index, at: i.left.at },
      right: { road: drawn[i.right.road]!.index, at: i.right.at },
    }));
    return { key: JSON.stringify(intervals), intervals };
  };
  const ends = [...span.roads.flatMap((r) => [r.from, r.to]), ...(l.leaving ? [l.leaving.from, l.leaving.to] : [])];
  const bounds = [...new Set([from, to, ...ends.filter((p) => p > from && p < to)])].sort((a, b) => a - b);
  return bounds.slice(1).flatMap((b, i) => arrangements(bounds[i]!, b, pictureAt));
}

/** One of OUTRUN's roads: its course id, where it starts and the side each fork takes. */
export interface OutrunRoute {
  readonly id: string;
  /**
   * A SHORT road's start (K, 2026-10-24): on the road from beyond the map into the third row's top stage, DESERT (L), or
   * its bottom one, CLOUDY MOUNTAIN (R); none, COCONUT BEACH's GO.
   */
  readonly start?: 'L' | 'R';
  /** Each fork's side, left (L) or right (R), in order. */
  readonly forks: string;
}
/** The six LONG roads and six SHORT ones to the goals, each by its start and its forks' sides (K, 2026-10-24). */
export const OUTRUN_ROUTES: readonly OutrunRoute[] = Object.freeze([
  { id: 'outrun-a', forks: 'LLLL' },
  { id: 'outrun-b', forks: 'LRLL' },
  { id: 'outrun-c-left', forks: 'LRRL' },
  { id: 'outrun-c-right', forks: 'RLLR' },
  { id: 'outrun-d', forks: 'RLRR' },
  { id: 'outrun-e', forks: 'RRRR' },
  { id: 'outrun-short-a', start: 'L', forks: 'LL' },
  { id: 'outrun-short-b', start: 'L', forks: 'LR' },
  { id: 'outrun-short-c-left', start: 'L', forks: 'RR' },
  { id: 'outrun-short-c-right', start: 'R', forks: 'LL' },
  { id: 'outrun-short-d', start: 'R', forks: 'RL' },
  { id: 'outrun-short-e', start: 'R', forks: 'RR' },
]);
/** The map's row a SHORT road starts in, the third: its top stage is column 0, its bottom one column 2. */
const SHORT_ROW = 2;
/** A road's first row and column on the map, counted from the left fork's side. */
const startOf = (route: OutrunRoute) =>
  route.start ? { row: SHORT_ROW, column: route.start === 'L' ? 0 : SHORT_ROW } : { row: 0, column: 0 };
/** The goal a road reaches, A to E down the map from the left fork's side: each right fork one further down. */
const goalLetter = (route: OutrunRoute) =>
  String.fromCharCode(0x41 + startOf(route).column + [...route.forks].filter((f) => f === 'R').length);

/**
 * A road's name among `routes` (K, 2026-10-24): OUTRUN, SHORT if it is, and its goal's letter; where another road of
 * `routes` as long reaches the same goal, the side it begins by, LEFT or RIGHT: a SHORT road's start's, a LONG one's
 * first fork's.
 */
export function routeName(route: OutrunRoute, routes: readonly OutrunRoute[]): string {
  const twin = routes.some((r) => r !== route && !r.start === !route.start && goalLetter(r) === goalLetter(route));
  const side = route.start ?? route.forks[0];
  return [
    'OUTRUN',
    ...(route.start ? ['SHORT'] : []),
    goalLetter(route),
    ...(twin ? [side === 'L' ? 'LEFT' : 'RIGHT'] : []),
  ].join(' ');
}

/** What a route's spans are made from. */
export interface RouteInputs {
  /** The stage table's rows, each as the ROM lists it (its right fork's side first). */
  readonly rows: readonly (readonly number[])[];
  readonly stages: ReadonlyMap<number, Stage>;
  readonly fork: ForkStretch;
  readonly goals: { readonly stretches: readonly Stretch[]; readonly path: Path; readonly parting: Parting };
  /** The goal stretch the stage at `row`, ROM `column` ends in. */
  readonly goalOf: (row: number, column: number) => number;
  /** A stage's Sections' ids' stem. */
  readonly idOf: (stage: Stage) => string;
  readonly clock: ProgramClock;
  /** The road width at the game's start (`readStartWidth`). */
  readonly startWidth: number;
}

/**
 * A stage on a road, its goal if it is of the last row, and the next stage and the fork's side it is reached by, if
 * there is one.
 */
interface Step {
  readonly stage: Stage;
  readonly goal: { readonly stretch: Stretch; readonly number: number } | null;
  readonly next: { readonly stage: Stage; readonly side: -1 | 1 } | null;
}

/**
 * A route's stages: from its start's (`startOf`), each fork's side taken (left to the next row's stage at the same
 * place counted from the left, right to the one after it) to a last stage and its goal.
 */
function routeSteps(route: OutrunRoute, inputs: RouteInputs): Step[] {
  const fromLeft = inputs.rows.map((row) => [...row].reverse());
  const last = inputs.rows.length - 1;
  const at = (r: number, c: number) => inputs.stages.get(fromLeft[r]![c]!)!;
  const goal = (r: number, c: number) => {
    if (r !== last) return null;
    const number = inputs.goalOf(r, fromLeft[r]!.length - 1 - c);
    return { stretch: inputs.goals.stretches[number]!, number };
  };
  const start = startOf(route);
  const side = (r: number) => (route.forks[r - start.row] === 'L' ? -1 : 1);
  const steps: Step[] = [];
  let column = start.column;
  for (let r = start.row; r <= last; r++) {
    const next = r < last ? column + (side(r) < 0 ? 0 : 1) : null;
    steps.push({
      stage: at(r, column),
      goal: goal(r, column),
      next: next === null ? null : { stage: at(r + 1, next), side: side(r) },
    });
    if (next !== null) column = next;
  }
  return steps;
}

/**
 * A route's spans: a SHORT road's start, each stage of rows 1 to 4 and its fork piece's side taken, and the last stage
 * with its goal, their road width joined over the whole road (`joinedWidth`). A stage entered by a left side (L) has the
 * road taken as its right half (its centre lane e); by a right side (R), its left (b). A SHORT road starts on the road
 * into its first stage from beyond the map (K, 2026-10-24): a fork piece from w₀ = 0 as the other side takes it (L,
 * into DESERT at the map's top, as R's), in its first stage's colors and sky, its GO where the fork stretch's first
 * curve ends.
 */
export function routeSpans(route: OutrunRoute, inputs: RouteInputs): RoadSpan[] {
  const steps = routeSteps(route, inputs);
  // Each piece's own width first, the original's straight between its points; then the pieces again on the join.
  const pieces = (widths?: readonly Quadratic[]) => {
    const spans: RoadSpan[] = [];
    const built: Quadratic[] = [];
    const width = () => widths?.[built.length];
    let centreLane: 'b' | 'e' = 'b';
    if (route.start) {
      const { stage } = steps[0]!;
      const side = route.start === 'L' ? 1 : -1;
      const piece = forkSpan(inputs.fork, side, stage, stage, 0, inputs.clock, width());
      built.push(piece.width);
      const { parts } = inputs.fork.rules;
      const go = inputs.fork.curves.find((c) => c.position > parts && c.radius === 0)!.position - parts;
      spans.push({
        span: { ...piece, stages: [{ from: 0, stage }] },
        id: `${inputs.idOf(stage)}-start`,
        leaves: piece.centreLane,
        go,
      });
      centreLane = side < 0 ? 'e' : 'b';
    }
    steps.forEach(({ stage, goal, next }, k) => {
      const id = inputs.idOf(stage);
      const start = k === 0 && !route.start ? inputs.startWidth : null;
      // Each side leaves by its road taken's lane that continues as the next stage's centre lane: L's b as e, R's e as b.
      if (goal) {
        const options = { ...goal, path: inputs.goals.path, parting: inputs.goals.parting };
        const last = lastStageSpans(stage, options, { start, centreLane, id, width: width(), clock: inputs.clock });
        built.push(last.width);
        spans.push(...last.spans);
      } else {
        const span = stageSpan(stage, { start, fork: inputs.fork, centreLane, width: width(), clock: inputs.clock });
        built.push(span.width);
        spans.push({ span, id, leaves: next!.side < 0 ? 'b' : 'e' });
        const fork = forkSpan(
          inputs.fork,
          next!.side,
          stage,
          next!.stage,
          span.width.at(span.length),
          inputs.clock,
          width(),
        );
        built.push(fork.width);
        spans.push({
          span: fork,
          id: `${id}-${next!.side < 0 ? 'left' : 'right'}`,
          leaves: fork.centreLane,
        });
      }
      if (next) centreLane = next.side < 0 ? 'e' : 'b';
    });
    return { spans, built };
  };
  return pieces(joinedWidth(pieces().built)).spans;
}

/**
 * A last stage and its goal: one span on lane b, or, entered from a fork's left side, the stage on lane e to
 * `GOAL_CENTRE` and the rest with its goal on lane b (the goal's lane e ends), joined by lane b; with its road width.
 */
function lastStageSpans(
  stage: Stage,
  goal: GoalOptions,
  on: {
    readonly start: number | null;
    readonly centreLane: 'b' | 'e';
    readonly id: string;
    readonly width: Quadratic | undefined;
    readonly clock: ProgramClock;
  },
): { readonly spans: RoadSpan[]; readonly width: Quadratic } {
  const { start, centreLane, id, width, clock } = on;
  const own = stageSpan(stage, { start, fork: null, goal, centreLane: 'b', width, clock });
  if (centreLane === 'b') return { spans: [{ span: own, id, leaves: 'b' }], width: own.width };
  const entered = stageSpan(stage, { start, fork: null, goal, centreLane: 'e', width, clock });
  return {
    spans: [
      { span: sliceSpan(entered, 0, GOAL_CENTRE), id, leaves: 'b' },
      { span: sliceSpan(own, GOAL_CENTRE, own.length), id: `${id}-goal`, leaves: 'b' },
    ],
    width: own.width,
  };
}
