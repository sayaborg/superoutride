/**
 * OUTRUN's roads ([Original road data](../../docs/original-road-data.md#outruns-roads)): pieces laid one after another
 * as one LINEAR course each. Each span is laid on its plan (`OffsetPlan`) and in the world after the one before; the
 * road's crossings are kept apart and its passages over itself parted into Sections; its objects stand along the whole
 * road; each Section is written with its lanes, verges, strips (the roads' surfaces, lines and edges as the original
 * draws two roads), objects, gates and skies.
 */
import { requireInput } from '../course/authoring-io.js';
import { computedValue } from '../authoring/course-joints.js';
import { MAXIMUM_VEHICLE_REACH } from '../../src/course/course-coordinate-domain.js';
import { OUTRUN_ROAD, ROAD_HALF, TOUCHING, UNIT_METRES } from './outrun-cross-section.js';
import { composite, type FeatureEdge } from './two-roads.js';
import { OffsetPlan, POSITION_METRES, type Pose } from './offset-plan.js';
import {
  forkSpan,
  joinSpan,
  rampLength,
  stageSpan,
  VERGE,
  type DrawnRoad,
  type LaneRef,
  type Span,
  type VergeKnot,
  type GoalOptions,
  sliceSpan,
  GOAL_CENTRE,
  withEntry,
} from './outrun-pieces.js';
import {
  bendOf,
  closedGrades,
  crossingOf,
  LOOK,
  profileOf,
  separatedCrossings,
  stageGrades,
  type Change,
  type Profile,
} from './road-profile.js';
import { tableRuns } from './hills.js';
import { PIXEL_ASPECT } from './pixel-grid.js';
import { SPRITE_SOURCE_TEXELS_PER_METER as TEXELS } from '../../src/image/sprite.js';
import { raisedSplit, repeated, sectionProfile, simplified } from './outrun-course.js';
import type { Stage, Stretch } from './outrun-road.js';
import type { HeightTable, Path } from './road-tables.js';
import type { ObjectPlacement } from './outrun-scenery.js';
import type { LyingBoard } from './outrun-boards.js';
import { lyingMaterials, type LyingPiece } from './ground-materials.js';
import { TEXT_MARKS } from '../../src/image/text-tiles.js';

/** The stripes' period, metres: each tick adds km/h / 64 three times to the road's fine position, 32 of it a period. */
export const STRIPE_PERIOD = ((32 * 303) / 3072) * POSITION_METRES;
/** The start grid: as many slots as a run's competitors, this far apart. */
const GRID_SLOTS = 16;
const GRID_SPACING = 12;
/** Two passages of a road at least this far apart along it may cross. */
const PASSAGES_APART = 200;
/** One crossing's later passage moves by less than this from one of its earlier passage's positions to the next, metres. */
const CROSSING_REACH = 60;
/** A painted interval narrowing to nothing at a stretch's end is drawn to where it is this wide, metres. */
const THIN = 1e-5;
/** A plan element is a straight where its radius would exceed this, metres: its turn carried on to the next arc. */
const STRAIGHTEST = 40000;
/** A plan element shorter than this, metres, is carried on into the next: its length and its turn. */
const SHORTEST = 1e-3;
/** A lane's width as written lies within this of its rule, metres. */
const WIDTH_TOLERANCE = 0.01;
/** Knots are added halfway no closer than this, positions. */
const SHORTEST_KNOTS = 1 / 64;
/** A knot this near a joint of its Section's plan, metres, is written at the joint. */
const JOINT_SNAP = 2e-6;
/** A width is there where it is wider than this, units. */
const THERE = 1e-9;
/** Where the composite of the roads is sampled for changes, positions. */
const SAMPLE = 0.25;
/** The guidance where a road is chosen, a default K decides on Pages (`roadGuidance`), metres. */
const GUIDANCE = Object.freeze({
  /** The signs stand this far before the roads part, beyond the edge band of the side not taken by `aside`. */
  signs: [500, 300, 150],
  aside: 2,
  /** The chevrons stand in the gap between the roads from where it is `apart` wide, `every` apart, `count` of them. */
  apart: 2,
  every: 15,
  count: 3,
  /** Across the road not taken this many positions before its end. */
  deadEnd: 1,
  /** Road arrows in each lane not taken at least `lane` wide, from `before` the parting to `short` of the dead end. */
  arrows: { before: 150, short: 10, every: 25, lane: 2.5, width: 2.4, length: 12 },
  /** The arrows' color, the lines' white on most stages (on DESERT and WILDERNESS the lines are the surface's). */
  white: 31710,
});

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));
const metres = (units: number) => round(units * UNIT_METRES);

/** A span of a road: what it is, and the lanes its Link leaves by. */
export interface RoadSpan {
  readonly span: Span;
  /** Its Sections' ids' stem. */
  readonly id: string;
  /** The lane its last Section's Link leaves by, toward the next span. */
  readonly leaves: string;
  /** Whether it begins its stage (at GO), not a fork's. */
  readonly starts: boolean;
}

/** A span laid: its plan, its stations along the road, its pose in the world and its Sections' cuts. */
export interface Laid {
  readonly road: RoadSpan;
  readonly plan: OffsetPlan;
  /** The road station of its start. */
  readonly start: number;
  /** Its frame in the world: a point of its frame `p` is at `rotate(p) + origin`. */
  readonly world: { readonly x: number; readonly y: number; readonly heading: number };
  cuts: number[];
}

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

/** The roads drawn at `p`, left to right. */
const drawnAt = (span: Span, p: number) =>
  span.roads
    .map((road, index) => ({ road, index }))
    .filter(({ road }) => p >= road.from && p < road.to)
    .sort((a, b) => lineOf(span, a.road.centre, p) - lineOf(span, b.road.centre, p));

/** The verge's knots with their ramps placed: each NaN knot a ramp's length from the knot whose road it ramps to. */
/** The road position at a span's plan station. */
function positionAt(span: Span, plan: OffsetPlan, station: number): number {
  let [lo, hi] = [0, span.length];
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (plan.station(mid) < station) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function placedVerges(span: Span, plan: OffsetPlan, knots: readonly VergeKnot[]): VergeKnot[] {
  const lateral = (k: VergeKnot, p: number) => lineOf(span, k.ref, p) * UNIT_METRES + k.metres;
  return knots.map((k, i) => {
    if (!Number.isNaN(k.at)) return k;
    const [before, after] = [knots[i - 1]!, knots[i + 1]!];
    if (JSON.stringify(before.ref) !== JSON.stringify(k.ref)) {
      const along = rampLength(lateral(k, before.at) - lateral(before, before.at));
      return { ...k, at: positionAt(span, plan, plan.station(before.at) + along) };
    }
    const along = rampLength(lateral(after, after.at) - lateral(k, after.at));
    return { ...k, at: positionAt(span, plan, plan.station(after.at) - along) };
  });
}

/** A span's asphalt across, metres either side of its centreline: its drawn roads' outermost surfaces. */
function asphaltAt(span: Span, p: number, more = 0): [number, number] {
  const centres = drawnAt(span, Math.min(p, span.length - 1e-9)).map(({ road }) => lineOf(span, road.centre, p));
  return [
    (-Math.min(...centres) + ROAD_HALF) * UNIT_METRES + more,
    (Math.max(...centres) + ROAD_HALF) * UNIT_METRES + more,
  ];
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

/** Whether two convex polygons overlap: no edge of either separates them. */
function overlap(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i]!,
        [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const [nx, ny] = [y0 - y1, x1 - x0];
      const span = (q: readonly (readonly [number, number])[]) => q.map(([x, y]) => nx * x + ny * y);
      const [pa, pb] = [span(a), span(b)];
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

/**
 * Where a road passes over itself: pairs of road stations at least 200 m apart whose cross-sections (each span's
 * `sides(span, p)`, metres left and right of its centreline) overlap between a position and the next; each crossing's
 * pairs grouped where their earlier stations run on. `same` limits the pairs to one span's.
 */
function roadCrossings(laid: readonly Laid[], sides: (span: Span, p: number) => [number, number], same = false) {
  const cells: { points: [number, number][]; at: number; span: number }[] = [];
  laid.forEach((l, k) => {
    const corners = Array.from({ length: Math.floor(l.road.span.length) + 1 }, (_, i) => {
      const p = Math.min(i, l.road.span.length);
      const pose = toWorld(l.world, l.plan.pose(p));
      const [left, right] = sides(l.road.span, p);
      const [a, b] = [aside(pose, -left), aside(pose, right)];
      return {
        at: l.start + l.plan.station(p),
        points: [
          [a.x, a.y],
          [b.x, b.y],
        ] as [number, number][],
      };
    });
    for (let i = 0; i + 1 < corners.length; i++)
      cells.push({
        points: [
          corners[i]!.points[0]!,
          corners[i]!.points[1]!,
          corners[i + 1]!.points[1]!,
          corners[i + 1]!.points[0]!,
        ],
        at: corners[i]!.at,
        span: k,
      });
  });
  const SQUARE = 50;
  const squares = (cell: { points: [number, number][] }) => {
    const xs = cell.points.map(([x]) => Math.floor(x / SQUARE)),
      ys = cell.points.map(([, y]) => Math.floor(y / SQUARE));
    const keys: string[] = [];
    for (let i = Math.min(...xs); i <= Math.max(...xs); i++)
      for (let j = Math.min(...ys); j <= Math.max(...ys); j++) keys.push(`${i},${j}`);
    return keys;
  };
  const grid = new Map<string, number[]>();
  cells.forEach((cell, i) => {
    for (const key of squares(cell)) grid.set(key, [...(grid.get(key) ?? []), i]);
  });
  const groups: [number, number][][] = [];
  cells.forEach((cell) => {
    const near = new Set(
      squares(cell).flatMap((key) =>
        grid
          .get(key)!
          .filter((j) => cells[j]!.at >= cell.at + PASSAGES_APART && (!same || cells[j]!.span === cell.span)),
      ),
    );
    for (const j of [...near].sort((a, b) => a - b)) {
      if (!overlap(cell.points, cells[j]!.points)) continue;
      // The crossing this pair runs on: its earlier passage a position or two on, its later one near.
      const pair: [number, number] = [cell.at, cells[j]!.at];
      const group = groups.find(
        (g) => cell.at - g.at(-1)![0] <= 2 * POSITION_METRES && Math.abs(pair[1] - g.at(-1)![1]) < CROSSING_REACH,
      );
      if (group) group.push(pair);
      else groups.push([pair]);
    }
  });
  return groups;
}

/** What a road's course takes beside its spans. */
export interface RoadOptions {
  readonly id: string;
  /** The pictures of what lies on the ground, by image name: their materials lie beneath the objects showing them. */
  readonly lying: ReadonlyMap<string, LyingBoard>;
  /** Each extending board's edge, by its image name: standing once where the board does. */
  readonly edges: ReadonlyMap<string, string>;
  /** The pictures standing at their foot shown raised too, by their `-raised` image. */
  readonly split: ReadonlySet<string>;
  readonly name: string;
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  /**
   * The camera's distance behind the car: the road's entry is this far before GO, where the car stands at road position
   * 0, the camera at the entry.
   */
  readonly cameraDistance: number;
  /**
   * The road's objects, by road position from the entry: given GO's, the road width (units) at each, where each
   * stretch the original runs ends, and the road's end; with where each checkpoint banner passes the car, and what the
   * placing reports.
   */
  readonly objects: (
    points: readonly {
      readonly position: number;
      readonly count: number;
      readonly type: number;
      readonly passable: boolean;
    }[],
    road: {
      readonly go: number;
      readonly width: (position: number) => number;
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

/** Each span laid on its plan, and in the world after the one before, its Link's lane continuing as its centre lane. */
export function layRoad(spans: readonly RoadSpan[]): Laid[] {
  const laid: Laid[] = [];
  for (const road of spans) {
    const plan = new OffsetPlan(road.span.path, road.span.offset, 0, road.span.length);
    const before = laid.at(-1);
    let world = { x: 0, y: 0, heading: 0 };
    if (before) {
      const end = before.road.span.length;
      const pose = toWorld(before.world, before.plan.pose(end));
      const ref = { lane: before.road.leaves, side: 'left' as const, units: 0 };
      const leaves =
        (lineOf(before.road.span, ref, end) + before.road.span.lanes(end).get(before.road.leaves)! / 2) * UNIT_METRES;
      const at = aside(pose, leaves);
      const first = plan.pose(0);
      const heading = at.heading - first.heading;
      const [c, s] = [Math.cos(heading), Math.sin(heading)];
      world = { x: at.x - (c * first.x - s * first.y), y: at.y - (s * first.x + c * first.y), heading };
    }
    laid.push({
      road,
      plan,
      start: before ? before.start + before.plan.station(before.road.span.length) : 0,
      world,
      cuts: [],
    });
  }
  // Each span's passages over itself parted: a cut at the last joint before the later passage, after the earlier,
  // where the road is one (its width at most 212).
  const domain = (span: Span, p: number) => asphaltAt(span, p, VERGE + MAXIMUM_VEHICLE_REACH);
  for (const pairs of roadCrossings(laid, domain, true)) {
    const [a, b] = [Math.max(...pairs.map(([x]) => x)), Math.min(...pairs.map(([, y]) => y))];
    const l = laid.find((l) => a >= l.start && b <= l.start + l.plan.station(l.road.span.length))!;
    if (l.cuts.some((c) => a < l.start + l.plan.station(c) && l.start + l.plan.station(c) <= b)) continue;
    const joints = l.plan.elements
      .map((e) => e.from)
      .filter((p) => {
        const s = l.start + l.plan.station(p);
        return p > 0 && a < s && s <= b && l.road.span.width.at(p) <= TOUCHING;
      });
    requireInput(
      joints.length > 0,
      `/${l.road.id}`,
      `No joint where the road is one parts ${l.road.id}'s passages at ${a} m`,
    );
    l.cuts.push(joints.at(-1)!);
    l.cuts.sort((x, y) => x - y);
  }
  return laid;
}

/**
 * A laid road's profile, by road station: each piece's tables run and their grades returned, the piece closed level at
 * 0 at its ends; the road's crossings kept apart; bends broken at its Sections' cuts. With its end and its crossings.
 */
export function roadProfile(
  laid: readonly Laid[],
  options: { readonly tables: ReadonlyMap<number, HeightTable>; readonly kmh: number },
) {
  const end = laid.at(-1)!.start + laid.at(-1)!.plan.station(laid.at(-1)!.road.span.length);
  // A road position's station: a piece may run on past its span's end into the next.
  const starts = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  const stationAt = (position: number) => {
    const k = Math.max(0, starts.filter((p) => p <= position).length - 1);
    const l = laid[k]!;
    return l.start + l.plan.station(Math.min(position - starts[k]!, l.road.span.length));
  };
  const changes: Change[] = laid.flatMap((l, k) =>
    l.road.span.heights.flatMap((piece) => {
      const from = starts[k]! + piece.from;
      const origin = stationAt(from);
      const stationOf = (p: number) => stationAt(from + p) - origin;
      const runs = tableRuns(piece.points, options.tables, () => options.kmh);
      const length = stationAt(starts[k]! + piece.to) - origin;
      const own = closedGrades(stageGrades(runs, LOOK, stationOf, stationOf(piece.cut - piece.from), length), length);
      return own.map((c) => ({ ...c, from: c.from + origin, to: c.to + origin }));
    }),
  );
  const crossings = roadCrossings(laid, (span, p) => asphaltAt(span, p));
  const cutStations = laid.flatMap((l) => [l.start, ...l.cuts.map((c) => l.start + l.plan.station(c))]).slice(1);
  const profile = profileOf(
    separatedCrossings(changes, crossings.map(crossingOf), end)
      .changes.filter((c) => c.from >= 0 && c.to <= end)
      .map(bendOf),
    cutStations,
  );
  return { end, profile, crossings };
}

/**
 * One road as a course document, its Positions still measured from each Section's first joint, and what it reports:
 * spans in order, the first the entry, each joined to the next by its `leaves` lane. The first span's start is the
 * grid's; a stage reached through a fork or a join has its checkpoint where its banner passes the car; a stage
 * ending in a goal has a checkpoint at its end where the road runs on, the last stage its finish. Its height tables run per piece, each closed level at 0; its crossings are kept 6 m apart; where
 * a span's coordinate domain passes over itself, a cut where the road is one parts its passages.
 */
export function outrunRoad(spans: readonly RoadSpan[], options: RoadOptions) {
  // The road's entry: the camera's distance before GO, where the camera stands.
  const go = options.cameraDistance / POSITION_METRES;
  const laid = layRoad([{ ...spans[0]!, span: withEntry(spans[0]!.span, go) }, ...spans.slice(1)]);
  const { end, profile, crossings } = roadProfile(laid, options);

  // The objects along the whole road, by road position.
  const positions = laid.map((_, k) => laid.slice(0, k).reduce((sum, m) => sum + m.road.span.length, 0));
  const spanAt = (position: number) => {
    const k = Math.max(0, positions.filter((p) => p <= position).length - 1);
    return { k, p: Math.min(position - positions[k]!, laid[k]!.road.span.length) };
  };
  const roadEnd = positions.at(-1)! + laid.at(-1)!.road.span.length;
  const objects = options.objects(
    // A goal's own objects, where the road runs on through them, are passed through (K, 2026-10-20, for now).
    laid.flatMap((l, k) => {
      const goal = l.road.span.stageEnd;
      return l.road.span.scenery.map((p) => ({
        ...p,
        position: p.position + positions[k]!,
        passable: goal !== undefined && p.position >= goal && k < laid.length - 1,
      }));
    }),
    {
      go,
      width: (position) => {
        const { k, p } = spanAt(position);
        return laid[k]!.road.span.width.at(p);
      },
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
    const base = l.plan.pathPose(p);
    const across = (l.road.span.middle(p) + o.x) * UNIT_METRES;
    const point = toWorld(l.world, aside(base, across));
    const found = project(laid, k, point, p);
    return found ? [{ ...found, object: o }] : [];
  });

  const guidance = roadGuidance(laid);

  // The Sections.
  const sections: unknown[] = [];
  const links: { id: string; from: { section: string; lane: string }; to: string }[] = [];
  // Each stage's sky faces as at its start, its GO: its stage span's.
  const stageStarts = new Map<Stage, number>();
  for (const l of laid)
    if (l.road.span.stageEnd !== undefined || l.road.starts)
      stageStarts.set(l.road.span.stages[0]!.stage, l.world.heading + l.plan.pose(0).heading);
  const checkpoints = objects.checkpoints.map((position) => {
    const { k, p } = spanAt(position);
    return { k, p };
  });
  laid.forEach((l, k) => {
    const starts = [0, ...l.cuts];
    const ids = starts.map((_, i) => (i === 0 ? l.road.id : `${l.road.id}-${i + 1}`));
    starts.forEach((from, i) => {
      const to = starts[i + 1] ?? l.road.span.length;
      const last = k === laid.length - 1 && i === starts.length - 1;
      const name = options.stageName(l.road.span.stages[0]!.stage).toUpperCase();
      const cp = checkpoints.find((c) => c.k === k && c.p > from && c.p <= to);
      // A stage's end is the road's finish on its last span, else a checkpoint: a goal the road runs on from.
      const end = l.road.span.stageEnd;
      const goal = end !== undefined && end > from && end <= to ? { id: `${name}-GOAL`, p: end } : null;
      sections.push(
        sectionDocument(l, {
          id: ids[i]!,
          from,
          to,
          first: k === 0 && i === 0,
          joinsBefore: k > 0 || i > 0,
          joinsAfter: !last,
          checkpoints: [...(cp ? [{ id: `${name}-CP`, p: cp.p }] : []), ...(goal && k < laid.length - 1 ? [goal] : [])],
          finish: k === laid.length - 1 ? goal : null,
          objects: placed.filter((o) => o.k === k && o.p >= from && o.p < to),
          guidance: guidance.filter((g) => g.k === k && g.p >= from && g.p < to),
          profile,
          stageStarts,
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
  const document = {
    format: 'superoutride.course',
    version: 52,
    name: options.name,
    entry: laid[0]!.road.id,
    maxLaps: 1,
    bearing: 0,
    sections,
    links,
  };
  return {
    document,
    laid,
    end,
    profile,
    crossings,
    objects: placed.length,
    placing: objects.report,
    drift: Math.max(...laid.map((l) => l.plan.drift)),
  };
}

/** The station and lateral `point` (world) stands at on a span's plan, near position `p` of span `k` or its neighbours. */
function project(laid: readonly Laid[], k: number, point: Pose, p: number) {
  for (const j of [k, k + 1, k - 1]) {
    const l = laid[j];
    if (!l) continue;
    const [c, s] = [Math.cos(-l.world.heading), Math.sin(-l.world.heading)];
    const [dx, dy] = [point.x - l.world.x, point.y - l.world.y];
    const local = { x: c * dx - s * dy, y: s * dx + c * dy };
    let q = j === k ? p : j > k ? 0 : l.road.span.length;
    for (let i = 0; i < 30; i++) {
      const pose = l.plan.pose(Math.min(Math.max(q, 0), l.road.span.length));
      const along = (local.x - pose.x) * Math.cos(pose.heading) + (local.y - pose.y) * Math.sin(pose.heading);
      const step =
        along / (l.plan.station(Math.min(q + 0.5, l.road.span.length)) - l.plan.station(Math.max(q - 0.5, 0)));
      q += step;
      if (Math.abs(step) < 1e-9) break;
    }
    if (q < 0 || q > l.road.span.length) continue;
    const pose = l.plan.pose(q);
    const lateral = (local.x - pose.x) * Math.sin(pose.heading) - (local.y - pose.y) * Math.cos(pose.heading);
    return { k: j, p: q, lateral };
  }
  return null;
}

/** A piece of guidance at position `p` of span `k`: a road arrow in a lane, or a board beside a lane's side. */
type Guide = { readonly k: number; readonly p: number } & (
  | { readonly kind: 'arrow'; readonly lane: string; readonly direction: 'left' | 'right' }
  | {
      readonly kind: 'sign';
      readonly image: string;
      readonly lane: string;
      readonly side: 'left' | 'center' | 'right';
      readonly offset: number;
    }
);

/**
 * The guidance where a road is chosen (each fork, and each goal the road runs on from), all passed through: `route-arrow`
 * boards before the roads part, beyond the edge band of the side not taken; `route-chevron` boards in the gap between
 * the roads from where it is 2 m wide, and across the road not taken just before its end; and road arrows in the lanes
 * not taken, toward the road taken, from before the parting to just short of the dead end. Each points to the road
 * taken.
 */
function roadGuidance(laid: readonly Laid[]): Guide[] {
  // A road station's span and position.
  const positionAt = (station: number) => {
    const k = laid.reduce((found, l, i) => (l.start <= station ? i : found), 0);
    const l = laid[k]!;
    let [lo, hi] = [0, l.road.span.length];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (l.start + l.plan.station(mid) < station) lo = mid;
      else hi = mid;
    }
    return { k, p: (lo + hi) / 2 };
  };
  return laid.flatMap((l, k) => {
    const choice = l.road.span.choice;
    if (!choice || k === laid.length - 1) return [];
    const { span } = l.road;
    const station = (p: number) => l.start + l.plan.station(p);
    const toward: 'left' | 'right' = choice.side < 0 ? 'left' : 'right';
    const away = choice.side < 0 ? 'right' : 'left';
    const board = (
      at: { k: number; p: number },
      name: string,
      lane: string,
      side: 'left' | 'center' | 'right',
      offset: number,
    ) => ({ kind: 'sign' as const, ...at, image: `${name}-${toward}`, lane, side, offset });
    // The signs, beyond the edge band of the side not taken: its outer lane's edge, the asphalt beyond it, and more.
    const outer = choice.side < 0 ? choice.dead.at(-1)! : choice.dead[0]!;
    const beyond = ((ROAD_HALF - TOUCHING) * UNIT_METRES + GUIDANCE.aside) * (choice.side < 0 ? 1 : -1);
    const signs = GUIDANCE.signs.map((before) =>
      board(positionAt(station(choice.parts) - before), 'route-arrow', outer, away, beyond),
    );
    // The gap between the roads: the asphalt between the road taken and the road not taken.
    const gap = (p: number) => 2 * (span.width.at(p) - ROAD_HALF) * UNIT_METRES;
    let [lo, hi] = [choice.parts, choice.ends];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (gap(mid) < GUIDANCE.apart) lo = mid;
      else hi = mid;
    }
    const inner = choice.side < 0 ? choice.taken.at(-1)! : choice.taken[0]!;
    const chevrons = Array.from({ length: GUIDANCE.count }, (_, i) => {
      const at = positionAt(station(hi) + i * GUIDANCE.every);
      // The gap's middle: half the median beside the road taken's inner lane, toward the road not taken.
      const there = laid[at.k]!.road.span;
      const median = there.lanes(at.p).get(there.order[there.order.indexOf(inner) - choice.side]!)!;
      return board(at, 'route-chevron', inner, away, (-choice.side * median * UNIT_METRES) / 2);
    });
    const deadEnd = choice.dead.map((lane) =>
      board({ k, p: choice.ends - GUIDANCE.deadEnd }, 'route-chevron', lane, 'center', 0),
    );
    const { before, short, every, lane: wide } = GUIDANCE.arrows;
    const [from, to] = [station(choice.parts) - before, station(choice.ends) - short];
    const arrows = Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) =>
      positionAt(from + i * every),
    ).flatMap((at) => {
      const widths = laid[at.k]!.road.span.lanes(at.p);
      return choice.dead
        .filter((lane) => (widths.get(lane) ?? 0) * UNIT_METRES >= wide)
        .map((lane) => ({ kind: 'arrow' as const, ...at, lane, direction: toward }));
    });
    return [...signs, ...chevrons, ...deadEnd, ...arrows];
  });
}

type Lateral = Record<string, unknown> | number;
const laneLateral = (lane: string, side: string, offset: number): Lateral => ({ lane, side, offset: round(offset) });
const boundary = (id: string): Lateral => ({ boundary: id, offset: 0 });
const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** One Section of a laid span, `[from, to]` its positions. */
function sectionDocument(
  l: Laid,
  section: {
    readonly id: string;
    readonly from: number;
    readonly to: number;
    readonly first: boolean;
    readonly joinsBefore: boolean;
    readonly joinsAfter: boolean;
    readonly checkpoints: readonly { readonly id: string; readonly p: number }[];
    readonly finish: { readonly id: string; readonly p: number } | null;
    readonly objects: readonly { readonly p: number; readonly lateral: number; readonly object: ObjectPlacement }[];
    readonly guidance: readonly Guide[];
    readonly profile: Profile;
    readonly stageStarts: ReadonlyMap<Stage, number>;
    readonly options: RoadOptions;
  },
) {
  const { span } = l.road;
  const { plan } = l;
  const { from, to } = section;
  const origin = plan.station(from);
  const size = round(plan.station(to) - origin);
  const roadOrigin = l.start + origin;

  // The plan: its elements over [from, to], straights where an arc would be straighter than STRAIGHTEST, one shorter
  // than SHORTEST carried on into the next.
  const own = plan.elements.filter((e) => e.from >= from - 1e-9 && e.to <= to + 1e-9);
  requireInput(
    Math.abs(own[0]!.from - from) < 1e-9 && Math.abs(own.at(-1)!.to - to) < 1e-9,
    `/sections/${section.id}`,
    `Section ${section.id} is not cut at joints`,
  );
  const elements: { kind: string; id: string; length: number; radius?: number; turn?: string; from: number }[] = [];
  let carried = 0,
    carriedLength = 0;
  for (const [i, e] of own.entries()) {
    const length = round(plan.station(e.to) - plan.station(e.from) + carriedLength);
    const turn = e.turn + carried;
    const last = elements.at(-1);
    if (length === 0 || (length < SHORTEST && i < own.length - 1)) {
      [carried, carriedLength] = [turn, length];
      continue;
    }
    carriedLength = 0;
    if (Math.abs(turn) * STRAIGHTEST < length) {
      carried = turn;
      if (last?.kind === 'straight') last.length = round(last.length + length);
      else elements.push({ kind: 'straight', id: `s${elements.length}`, length, from: e.from });
      continue;
    }
    carried = 0;
    const radius = round(length / Math.abs(turn));
    const side = turn > 0 ? 'left' : 'right';
    if (last?.kind === 'arc' && last.turn === side && last.radius === radius) last.length = round(last.length + length);
    else elements.push({ kind: 'arc', id: `c${elements.length}`, length, radius, turn: side, from: e.from });
  }
  const first = elements[0]!.id;
  // A station within a few micrometres of a joint is the joint's: a position reckoned apart from the plan's elements
  // can round to the micrometre beside it.
  const joints = elements.map((_, i) => round(elements.slice(0, i).reduce((sum, e) => sum + e.length, 0)));
  const onJoint = (s: number) => joints.find((j) => Math.abs(j - s) <= JOINT_SNAP) ?? s;
  const atStation = (s: number) => ({ joint: first, offset: onJoint(round(s)) });
  const at = (p: number) => atStation(plan.station(p) - origin);

  // The lanes: their widths at each knot, a lane or median 0 throughout left out. Each width is written straight by
  // station between knots; where the station does not run evenly with the position (the offset changing on a curve),
  // a knot is added halfway until every width lies within WIDTH_TOLERANCE of its rule there.
  const breaks = [
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
  const straight = (a: number, b: number) => {
    const m = (a + b) / 2;
    const [wa, wb, wm] = [span.lanes(a), span.lanes(b), span.lanes(m)];
    const t = (plan.station(m) - plan.station(a)) / (plan.station(b) - plan.station(a));
    return span.order.every(
      (n) => Math.abs(wa.get(n)! + (wb.get(n)! - wa.get(n)!) * t - wm.get(n)!) * UNIT_METRES <= WIDTH_TOLERANCE,
    );
  };
  const knots: number[] = [];
  const halve = (a: number, b: number) => {
    if (b - a <= SHORTEST_KNOTS || straight(a, b)) return;
    const m = (a + b) / 2;
    halve(a, m);
    knots.push(m);
    halve(m, b);
  };
  breaks.forEach((p, i) => {
    if (i > 0) halve(breaks[i - 1]!, p);
    knots.push(p);
  });
  const widths = knots.map((p) => span.lanes(p));
  const present = span.order.filter((name) => widths.some((w) => w.get(name)! > THERE));
  const lanes = present.map((name) => {
    const values = simplified(
      knots.map((p, i) => [round(plan.station(p) - origin), metres(widths[i]!.get(name)!)] as [number, number]),
    );
    const width = values.every(([, v]) => v === values[0]![1])
      ? values[0]![1]
      : values.map(([s, v]) => ({ at: atStation(s), width: v }));
    return name.startsWith('m') ? { kind: 'median', width } : { kind: 'lane', id: name, width };
  });
  // The lanes' lines as written: each width straight between its knots by station.
  const knotStations = knots.map((p) => plan.station(p));
  const written = (p: number) => {
    const s = plan.station(p);
    const i = Math.min(
      Math.max(
        1,
        knotStations.findIndex((k) => k >= s),
      ),
      knots.length - 1,
    );
    const t = (s - knotStations[i - 1]!) / (knotStations[i]! - knotStations[i - 1]! || 1);
    const at = new Map(
      span.order.map((n) => [n, widths[i - 1]!.get(n)! + (widths[i]!.get(n)! - widths[i - 1]!.get(n)!) * t]),
    );
    return laneLinesOf(span, at);
  };
  const ref = (r: LaneRef, more = 0) => {
    requireInput(present.includes(r.lane), `/sections/${section.id}`, `Section ${section.id} has no lane ${r.lane}`);
    return laneLateral(r.lane, r.side, r.units * UNIT_METRES + more);
  };

  // The verges: knots within the Section, and its ends where a stretch of one reference holds.
  const verge = (knots: readonly VergeKnot[]) => {
    const placed = placedVerges(span, plan, knots);
    const inside = placed.filter((k) => k.at > from && k.at < to);
    const around = (p: number) => {
      const i = placed.findIndex((k) => k.at >= p);
      const [a, b] = [placed[Math.max(0, i - 1)]!, placed[Math.max(0, i)]!];
      const k = Math.abs(b.at - p) < 1e-9 ? b : Math.abs(a.at - p) < 1e-9 ? a : null;
      if (k) return k;
      requireInput(
        JSON.stringify(a.ref) === JSON.stringify(b.ref) && a.metres === b.metres,
        `/sections/${section.id}`,
        `Section ${section.id} is cut in a verge's ramp`,
      );
      return { ...a, at: p };
    };
    return [around(from), ...inside, around(to)].map((k) => ({ at: at(k.at), lateral: ref(k.ref, k.metres) }));
  };

  // A verge's lateral at a Section station, metres: its knots' lines straight between them by station.
  const vergeAt = (side: 'left' | 'right') => {
    const placed = placedVerges(span, plan, span.verges[side]);
    const stationOf = placed.map((k) => plan.station(k.at) - origin);
    const lateral = (k: VergeKnot, p: number) => lineOf(span, k.ref, p) * UNIT_METRES + k.metres;
    return (s: number) => {
      const p = positionAt(span, plan, s + origin);
      const i = Math.max(
        1,
        Math.min(
          placed.length - 1,
          stationOf.findIndex((k) => k >= s),
        ),
      );
      const [a, b] = [placed[i - 1]!, placed[i]!];
      const t = Math.max(0, Math.min(1, (s - stationOf[i - 1]!) / (stationOf[i]! - stationOf[i - 1]! || 1)));
      return lateral(a, p) + (lateral(b, p) - lateral(a, p)) * t;
    };
  };

  // The strips.
  const { colors } = span.stages[0]!.stage;
  const ground = span.stages[0]!.stage.groundStripes;
  const surface = colors.surface.rgb555;
  const half = STRIPE_PERIOD / 2;
  const strip = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    color: number | null,
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
  // A color over half `h` of every period within `[a, b]`, Section metres, the periods counted from GO:
  // a part half where `a` falls in one, the whole halves as a repeat, a part half where `b` does.
  const halves = (h: 0 | 1, a: number, b: number, left: Lateral | null, right: Lateral | null, color: number) => {
    const phase = h * half - (roadOrigin - section.options.cameraDistance);
    const first = phase + Math.ceil((a - phase) / STRIPE_PERIOD - 1e-9) * STRIPE_PERIOD;
    const pieces: unknown[] = [];
    if (first - STRIPE_PERIOD + half > a + 1e-6)
      pieces.push(strip(a, Math.min(b, first - STRIPE_PERIOD + half), left, right, color, null));
    const count = first + half <= b + 1e-9 ? Math.floor((b - first - half) / STRIPE_PERIOD + 1e-9) + 1 : 0;
    if (count > 0) {
      const element = strip(first, first + half, left, right, color, null);
      pieces.push(count === 1 ? element : { kind: 'repeat', every: round(STRIPE_PERIOD), count, elements: [element] });
    }
    const last = first + count * STRIPE_PERIOD;
    if (last < b - 1e-6) pieces.push(strip(last, b, left, right, color, null));
    return pieces;
  };
  const colored = (
    a: number,
    b: number,
    left: Lateral | null,
    right: Lateral | null,
    two: readonly number[],
    under: readonly number[],
  ) => ([0, 1] as const).flatMap((h) => (two[h] === under[h] ? [] : halves(h, a, b, left, right, two[h]!)));
  const stations = (p: number) => round(plan.station(p) - origin);
  const strips: unknown[] = [
    strip(0, size, null, null, ground[1], null),
    ...halves(0, 0, size, null, null, ground[0]),
    strip(0, size, boundary('outer-left'), boundary('outer-right'), null, 'SAND'),
  ];
  for (const road of span.roads) {
    const [a, b] = [Math.max(road.from, from), Math.min(road.to, to)];
    if (b <= a) continue;
    const [left, right] = [ref(road.centre, -ROAD_HALF * UNIT_METRES), ref(road.centre, ROAD_HALF * UNIT_METRES)];
    strips.push(strip(stations(a), stations(b), left, right, surface[1]!, 'ASPHALT'));
    if (surface[0] !== surface[1]) strips.push(...halves(0, stations(a), stations(b), left, right, surface[0]!));
  }
  // The lines and edge bands the roads' picture shows, a stretch of one arrangement at a time.
  for (const regime of regimes(span, from, to)) {
    for (const interval of regime.intervals) {
      const sideRef = (edge: FeatureEdge) => {
        const road = span.roads[edge.road]!;
        return { lane: road.centre.lane, side: road.centre.side, units: road.centre.units + edge.at };
      };
      const [lr, rr] = [sideRef(interval.left), sideRef(interval.right)];
      // Its width as the Section's lanes give it, straight between their knots; an end where it narrows to nothing
      // drawn in to where it is `THIN` wide.
      const width = (p: number) => {
        const lines = written(p);
        return (lines.get(rr.lane)![rr.side] + rr.units - lines.get(lr.lane)![lr.side] - lr.units) * UNIT_METRES;
      };
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
      const two = interval.paint === 'line' ? colors.laneLines.rgb555 : colors.edges.rgb555;
      strips.push(...colored(stations(a), stations(b), ref(lr), ref(rr), two, surface));
    }
  }

  // The road arrows.
  const { width: arrowWidth, length: arrowLength } = GUIDANCE.arrows;
  for (const g of section.guidance)
    if (g.kind === 'arrow')
      strips.push({
        kind: 'arrow',
        at: at(g.p),
        lateral: laneLateral(g.lane, 'center', 0),
        width: arrowWidth,
        length: arrowLength,
        direction: g.direction,
        color: GUIDANCE.white,
      });

  // What lies on the ground's materials, colorless beneath its boards: the sea's and lakes' `WATER` from the waterline
  // out to the verges; the sand drifts and the patches of sand on the road none.
  const lyingPieces: LyingPiece[] = [];
  for (const placed of section.objects) {
    const lying = section.options.lying.get(placed.object.image);
    if (!lying) continue;
    const { master } = lying;
    // A strip's pieces stand by their edge, a patch by its middle.
    const strip = master.extend !== undefined;
    lyingPieces.push({
      s: plan.station(placed.p) - origin,
      l: placed.lateral,
      picture: lying,
      strip: strip ? { key: placed.object.image, outward: master.extend === 'right' ? 1 : -1 } : null,
      material: lying.material,
    });
  }
  const materials = lyingMaterials(lyingPieces, {
    length: size,
    outer: { left: { id: 'outer-left', at: vergeAt('left') }, right: { id: 'outer-right', at: vergeAt('right') } },
  });
  const edgeOf = (edge: string | number) => (typeof edge === 'string' ? boundary(edge) : round(edge));
  for (const g of materials.strips) {
    const [a, b] = [round(g.start), round(g.end)];
    if (b > a) strips.push(strip(a, b, edgeOf(g.left), edgeOf(g.right), null, g.material));
  }

  // The gates.
  const gates: unknown[] = [];
  if (section.first)
    gates.push({
      kind: 'start',
      grid: Array.from({ length: GRID_SLOTS }, (_, i) => ({
        // The last slot at GO, the camera's distance on from the road's entry.
        at: atStation(round(section.options.cameraDistance + (GRID_SLOTS - 1 - i) * GRID_SPACING)),
        lane: i % 2 ? 'c' : 'b',
      })),
      bikeGrid: null,
    });
  for (const c of section.checkpoints) gates.push({ kind: 'checkpoint', id: c.id, at: at(c.p) });
  if (section.finish) gates.push({ kind: 'finish', id: section.finish.id, at: at(section.finish.p) });

  // The skies: each stage's from where its stretch begins, facing as at its start.
  const heading = l.world.heading + plan.pose(from).heading;
  const environments = span.stages
    .filter((s, i) => (span.stages[i + 1]?.from ?? Infinity) > from && s.from < to)
    .map((s) => {
      const start = section.stageStarts.get(s.stage) ?? heading;
      return {
        // A sky the original changes changes where the car comes to it, the camera this game draws from behind it.
        at:
          s.from >= from && s.arrival === 'wipe'
            ? atStation(round(plan.station(s.from) - origin - section.options.cameraDistance))
            : at(Math.max(s.from, from)),
        name: section.options.stageName(s.stage),
        background: {
          ...section.options.sky(s.stage),
          yawOrigin: round(wrapDegrees(((heading - start) * 180) / Math.PI)),
        },
        arrival: s.from >= from ? s.arrival : 'cut',
      };
    });

  return {
    id: section.id,
    plan: elements.map(({ from: _, ...e }) => e),
    profile: sectionProfile(
      section.profile,
      roadOrigin,
      roadOrigin + size,
      section.joinsBefore,
      section.joinsAfter,
    ).map(({ s, y, curveLength }) => ({ at: { joint: first, offset: computedValue(s - roadOrigin) }, y, curveLength })),
    lanes,
    centerLane: span.centreLane,
    boundaries: [
      { id: 'outer-left', knots: verge(span.verges.left) },
      { id: 'outer-right', knots: verge(span.verges.right) },
      ...materials.boundaries.map(({ id, knots }) => ({
        id,
        knots: knots.map((k) => ({ at: atStation(k.s), lateral: round(k.l) })),
      })),
    ],
    strips,
    walls: [],
    openLimits: [],
    sprites: raisedSplit(
      repeated([
        ...section.objects.map(({ p, lateral, object: o }) => {
          const board = {
            kind: 'sprite',
            image: o.image,
            palette: o.palette,
            at: at(p),
            lateral: round(lateral),
            groundOffset: round(o.y * UNIT_METRES * PIXEL_ASPECT),
            unselectedLink: null,
            // As wide as its hit extents, at most its board's width in whole texels.
            body:
              o.hit === null
                ? null
                : {
                    width: round(Math.min(o.hit * UNIT_METRES, Math.round(o.width * UNIT_METRES * TEXELS) / TEXELS)),
                    movable: null,
                  },
          };
          // An extending board's edge stands once where it does, repeated with it.
          const edge = section.options.edges.get(o.image);
          return edge ? [board, { ...board, image: edge }] : board;
        }),
        // The guidance's signs, passed through.
        ...section.guidance.flatMap((g) =>
          g.kind === 'sign'
            ? [
                {
                  kind: 'sprite',
                  image: g.image,
                  palette: 'original',
                  at: at(g.p),
                  lateral: laneLateral(g.lane, g.side, g.offset),
                  groundOffset: 0,
                  unselectedLink: null,
                  body: null,
                },
              ]
            : [],
        ),
      ]),
      section.options.split,
    ),
    environments,
    gates,
  };
}

/**
 * The stretches of `[from, to]` over which the roads' picture keeps one arrangement: the same roads drawn, and the
 * same lines and edge bands, each between the same features. Found on a grid of `SAMPLE` positions, each change then
 * narrowed down by halving.
 */
function regimes(span: Span, from: number, to: number) {
  const pictureAt = (p: number) => {
    const drawn = drawnAt(span, p);
    const intervals = composite(
      drawn.map(({ road }) => lineOf(span, road.centre, p)),
      OUTRUN_ROAD,
    ).map((i) => ({
      paint: i.paint,
      left: { road: drawn[i.left.road]!.index, at: i.left.at },
      right: { road: drawn[i.right.road]!.index, at: i.right.at },
    }));
    return { key: JSON.stringify(intervals), intervals };
  };
  const bounds = [
    ...new Set([from, to, ...span.roads.flatMap((r: DrawnRoad) => [r.from, r.to]).filter((p) => p > from && p < to)]),
  ].sort((a, b) => a - b);
  const out: { from: number; to: number; intervals: ReturnType<typeof pictureAt>['intervals'] }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a, b] = [bounds[i]!, bounds[i + 1]!];
    const n = Math.max(1, Math.ceil((b - a) / SAMPLE));
    const mids = Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 0.5)) / n);
    let start = a,
      current = pictureAt(mids[0]!);
    for (let k = 1; k < n; k++) {
      const next = pictureAt(mids[k]!);
      if (next.key === current.key) continue;
      let [lo, hi] = [mids[k - 1]!, mids[k]!];
      for (let j = 0; j < 40; j++) {
        const mid = (lo + hi) / 2;
        if (pictureAt(mid).key === current.key) lo = mid;
        else hi = mid;
      }
      out.push({ from: start, to: hi, intervals: current.intervals });
      [start, current] = [hi, next];
    }
    out.push({ from: start, to: b, intervals: current.intervals });
  }
  return out;
}

/** One of OUTRUN's roads: its course id and the side each fork takes. */
export interface OutrunRoute {
  readonly id: string;
  /** Each fork's side, left (L) or right (R), in order; on the road through all 15, then each join's. */
  readonly forks: string;
  /** Whether it runs through all 15 stages in the map's order, each goal but the last joining the next stage. */
  readonly all: boolean;
}
/** The six roads to the goals, each by its forks' sides, and the road through all 15, its sides alternating from L. */
export const OUTRUN_ROUTES: readonly OutrunRoute[] = Object.freeze([
  { id: 'outrun-a', forks: 'LLLL', all: false },
  { id: 'outrun-b', forks: 'LRLL', all: false },
  { id: 'outrun-c-left', forks: 'LLRR', all: false },
  { id: 'outrun-c-right', forks: 'RRLL', all: false },
  { id: 'outrun-d', forks: 'RLRR', all: false },
  { id: 'outrun-e', forks: 'RRRR', all: false },
  { id: 'outrun-all', forks: 'LRLRLRLRLRLRLR', all: true },
]);
/** A left fork leads up the original's map, a right one down. */
const FORK_MARKS: Readonly<Record<string, string>> = Object.freeze({ L: TEXT_MARKS.up, R: TEXT_MARKS.down });

/**
 * A road's name (K, 2026-10-20): its stages' short names in the order it runs them, each fork's side between them as
 * the map reads it (▲ left, up; ▼ right, down); the road through all 15, whose sides alternate only for the look,
 * ALL 15 STAGES.
 */
export function routeName(route: OutrunRoute, inputs: RouteInputs): string {
  if (route.all) return 'ALL 15 STAGES';
  return routeSteps(route, inputs)
    .map(({ stage }, k) => (k > 0 ? FORK_MARKS[route.forks[k - 1]!]! : '') + inputs.shortOf(stage))
    .join('');
}

/** What a route's spans are made from. */
export interface RouteInputs {
  /** The stage table's rows, each as the ROM lists it (its right fork's side first). */
  readonly rows: readonly (readonly number[])[];
  readonly stages: ReadonlyMap<number, Stage>;
  readonly fork: Stretch & { readonly path: Path };
  readonly goals: { readonly stretches: readonly Stretch[]; readonly path: Path };
  /** The goal stretch the stage at `row`, ROM `column` ends in. */
  readonly goalOf: (row: number, column: number) => number;
  /** A stage's Sections' ids' stem. */
  readonly idOf: (stage: Stage) => string;
  /** A stage's short name. */
  readonly shortOf: (stage: Stage) => string;
}

/**
 * A stage on a road, its goal if it is of the last row, and the next stage and the side it is reached by (a fork's, or
 * a join's after a goal), if there is one.
 */
interface Step {
  readonly stage: Stage;
  readonly goal: { readonly stretch: Stretch; readonly number: number } | null;
  readonly next: { readonly stage: Stage; readonly side: -1 | 1 } | null;
}

/**
 * A route's stages: from the first row's, each fork's side taken (left to the next row's stage at the same place counted
 * from the left, right to the one after it) to a last stage and its goal; or all 15 in the map's order, row by row and
 * within a row from the left, the forks' and joins' sides in turn.
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
  const side = (k: number) => (route.forks[k] === 'L' ? -1 : 1);
  if (route.all) {
    const places = fromLeft.flatMap((row, r) => row.map((_, c) => [r, c] as const));
    return places.map(([r, c], k) => ({
      stage: at(r, c),
      goal: goal(r, c),
      next: places[k + 1] ? { stage: at(...places[k + 1]!), side: side(k) } : null,
    }));
  }
  const steps: Step[] = [];
  let column = 0;
  for (let r = 0; r <= last; r++) {
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
 * A route's spans: each stage of rows 1 to 4 and its fork piece's side taken, each last stage with its goal, and on the
 * road through all 15 each goal but the last followed by a join piece. A stage entered by a left side (L) has the road
 * taken as its right half (its centre lane e); by a right side (R), its left (b).
 */
export function routeSpans(route: OutrunRoute, inputs: RouteInputs): RoadSpan[] {
  const spans: RoadSpan[] = [];
  let centreLane: 'b' | 'e' = 'b';
  routeSteps(route, inputs).forEach(({ stage, goal, next }, k) => {
    const id = inputs.idOf(stage);
    const first = k === 0;
    // Each side leaves by its road taken's lane that continues as the next stage's centre lane: L's b as e, R's e as b
    // at a fork; L's e and R's b at a join.
    if (goal) {
      spans.push(...lastStageSpans(stage, { ...goal, path: inputs.goals.path }, first, centreLane, id));
      if (next) {
        const join = joinSpan(next.stage, next.side);
        spans.push({ span: join, id: `${id}-join`, leaves: join.centreLane, starts: false });
      }
    } else {
      const span = stageSpan(stage, { first, fork: inputs.fork, centreLane });
      spans.push({ span, id, leaves: next!.side < 0 ? 'b' : 'e', starts: true });
      const fork = forkSpan(inputs.fork, next!.side, stage, next!.stage);
      spans.push({
        span: fork,
        id: `${id}-${next!.side < 0 ? 'left' : 'right'}`,
        leaves: fork.centreLane,
        starts: false,
      });
    }
    if (next) centreLane = next.side < 0 ? 'e' : 'b';
  });
  return spans;
}

/**
 * A last stage and its goal: one span on lane b, or, entered from a fork's left side, the stage on lane e to
 * `GOAL_CENTRE` and the rest with its goal on lane b (the goal's lane e ends), joined by lane b.
 */
function lastStageSpans(
  stage: Stage,
  goal: GoalOptions,
  first: boolean,
  centreLane: 'b' | 'e',
  id: string,
): RoadSpan[] {
  const own = stageSpan(stage, { first, fork: null, goal, centreLane: 'b' });
  if (centreLane === 'b') return [{ span: own, id, leaves: 'b', starts: true }];
  const entered = stageSpan(stage, { first, fork: null, goal, centreLane: 'e' });
  return [
    { span: sliceSpan(entered, 0, GOAL_CENTRE), id, leaves: 'b', starts: true },
    { span: sliceSpan(own, GOAL_CENTRE, own.length), id: `${id}-goal`, leaves: 'b', starts: false },
  ];
}
