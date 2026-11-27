/**
 * A course of JALECO's driving board ([Original road data](../../../docs/original-road-data.md#two-roads), [BIG RUN road
 * data](../../../docs/big-run-road-data.md#its-conversion)): a stage from its start, laid on back for its grid, to its
 * end, laid by `road-layout` with road 2 as P and road 1 beside it from its own table, its lanes over both roads, its
 * pictures' strips, its limits and its skies' environments, each original giving its heights, pictures, skies and
 * objects.
 */
import type {
  CoursePosition,
  EnvironmentDocument,
  LaneDocument,
  Lateral,
  StripDocument,
} from '../../../src/course/course-document.js';
import { COURSE_DOCUMENT_LIMITS } from '../../../src/course/course-limits.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance, RENDER_FAR_DEPTH_METERS } from '../../../src/view/camera.js';
import type { ArcPlanLimits } from '../shared/arc-plan.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { CoursePath } from '../shared/course-path.js';
import { groundMaterial } from '../shared/ground-material.js';
import { gridReach, type StartGrids } from '../shared/grid-rule.js';
import { PiecewiseLinear, straightThrough } from '../shared/piecewise-linear.js';
import type { ProgramLimits } from '../shared/program-limits.js';
import { layRoad } from '../shared/road-layout.js';
import type { Bend, Kink } from '../shared/road-profile.js';
import type { Material } from '../shared/road-surface.js';
import { micrometre, simplified, spriteElement, stripElement } from '../shared/section-writing.js';
import { SKY_HORIZON } from '../shared/sky-baking.js';
import { knotsWithin, readingLines } from '../shared/slanted-lines.js';
import type { DrivenLanes, lanesOverTwoRoads } from '../shared/two-roads.js';
import { LINE_PIXELS, type PaintedRun } from './road-lines.js';
import { rightAngled, twoRoadPlan, type RightAngle } from './road-plan.js';
import type { HeldStretch, RoadNumber, RoadPlanRecord, RoadTables, RoadTablesAt } from './road-tables.js';

/** How far the course reaches beyond the outermost road's centre on each side, units: a line's half. */
export const LIMIT_UNITS = LINE_PIXELS / 2;
/** No Section is cut this near the grid's front, positions. */
const GRID_CLEAR = 1000;
/** Road 1's centre is taken every this many positions where it parts from P. */
const SAMPLE = 500;
/** A turn's inside read at this many even steps over it, and the plan laid at most this many times to keep it. */
const INSIDE_SAMPLES = 8;
const PLAN_PASSES = 8;
/** How far the street across a 90° right angle reaches beyond its limits outside it, units (a trial's, K, 2026-11-13). */
const CROSS_UNITS = 3 * LIMIT_UNITS;
/** The radius a crossing's centreline rounds its corner at where its table leaves room, metres (K, 2026-11-27). */
const CROSSING_RADIUS = 100;
/** How far a crossing's lines may lie from straight, and its edges from their true places, metres. */
const LINE_TOLERANCE = 0.02;
/** The most Boundaries a Section's crossing reads its pictures from: the format's, less its limits' and road 1's. */
const READING_LINES = COURSE_DOCUMENT_LIMITS.boundaries - 3;
/** A stripe's part: the stripes' runs are whole multiples of it, positions. */
const STRIPE_PART = 15;
/** The most strips a Section holds: the course format's, less room for its ground's and its limits'. */
const SECTION_STRIPS = COURSE_DOCUMENT_LIMITS.stripElements - 64;

/** Strips over a period laid as runs, `runs` positions from the period's start, repeated from `zero` over `[a, b]`. */
function periodic<T>(
  run: { readonly from: number; readonly to: number },
  period: number,
  zero: number,
  a: number,
  b: number,
  strip: (from: number, to: number) => T,
) {
  const out: (T | { kind: 'repeat'; every: number; count: number; elements: T[] })[] = [];
  // The m-th run's ends, each from its own end of the run, so that one part's end is the next part's start exactly.
  const from = (m: number) => zero + run.from + m * period;
  const to = (m: number) => zero + run.to + m * period;
  const m0 = Math.ceil((a - from(0)) / period - 1e-9);
  // A run begun before `a`.
  if (to(m0 - 1) > a + 1e-6) out.push(strip(a, Math.min(b, to(m0 - 1))));
  const every = micrometre(period);
  let count = 0;
  while (to(m0 + count) <= b + 1e-9) count++;
  if (count > 0 && micrometre(to(m0)) + (count - 1) * every > b) count--;
  if (count > 0) {
    const element = strip(from(m0), to(m0));
    out.push(count === 1 ? element : { kind: 'repeat', every, count, elements: [element] });
  }
  // What is left to `b`, on from the repeats at their period as written, as every part's is.
  const left = from(m0) + count * every;
  if (left < b - 1e-6) out.push(strip(left, Math.min(b, to(m0) + count * every)));
  return out;
}

/** A run of a road's picture across: its painted run, its colors over a stripe's period, and its material. */
export interface ColoredRun {
  readonly run: PaintedRun;
  readonly colors: readonly (number | null)[];
  readonly material: Material | null;
}

/** A car's place on a stage's grid: its lateral (units across from its road's centre), its road and its position. */
export interface BoardGridSlot {
  readonly lateral: number;
  readonly road: RoadNumber;
  readonly position: number;
}

/** A course's heights along it: its bends and kinks at positions, metres up, and how far apart its two roads lie. */
export interface BoardHeights {
  readonly bends: readonly { readonly from: number; readonly to: number; readonly curvature: number }[];
  readonly kinks: readonly { readonly at: number; readonly change: number }[];
  /** How far apart in height the two roads lie at position `p`, metres. */
  apart(p: number): number;
}

/** A sky's knot along a course: its station, its image and how long its change takes, metres. */
export interface BoardSkyKnot {
  readonly s: number;
  readonly image: string;
  readonly transition: number;
}

/** A sprite placed on a course. */
export interface BoardSprite {
  readonly s: number;
  readonly image: string;
  readonly palette: string;
  readonly lateral: number;
  readonly groundOffset: number;
  readonly body: readonly { readonly across: number; readonly width: number }[] | null;
}

/**
 * Which of the original's roads the course takes where: P is road 2 but from `switchAt` on, road 1 there; `course(p)` the
 * original's road the course takes at `p`, its held road or P; `original(road, p)` the original's road a course's road
 * (2 P, 1 the other) is at `p`.
 */
export interface BoardCourseRoads {
  readonly switchAt: number;
  course(p: number): RoadNumber;
  original(road: RoadNumber, p: number): RoadNumber;
}

/**
 * A half of a street the course does not take where two cross at a right angle (a trial, K, 2026-11-27):
 * its corner, whether it is the street the course leaves, on ahead of the corner (`ahead`), or the one it takes, back
 * from it (`back`), the positions it is drawn over, and where a line `x` units right of its centre lies there, units
 * across P.
 */
export interface BoardStreet {
  readonly corner: RightAngle;
  readonly side: 'ahead' | 'back';
  readonly from: number;
  readonly to: number;
  lateral(p: number, x: number): number;
}

/** What a course's hooks are given once it is laid out: its stations and its roads' places and drawing. */
export interface BoardCourseContext {
  /** A position's station, metres, and a station's position. */
  station(p: number): number;
  positionOf(s: number): number;
  /** Where the course's road begins: its stations before it are laid back for its grid. */
  readonly back: number;
  readonly path: CoursePath;
  /** Road 1's centre as drawn, units across from P; where road 1 leaves P, and where its picture ends. */
  readonly shown1: PiecewiseLinear;
  readonly leavesAt: number;
  readonly notTakenEnd: number;
  /** Whether the course's road `road` (2 P, 1 the other) is drawn at position `p`. */
  drawn(road: RoadNumber, p: number): boolean;
  readonly roads: BoardCourseRoads;
  /**
   * Its streets, and its limit on side `side` (-1 left, 1 right) at position `p`, units across P; where a line `x`
   * units right of its road's centre lies at `p`, units across P (`bend`: the same but where the course crosses
   * streets at a corner, its road there the street it is on).
   */
  readonly streets: readonly BoardStreet[];
  limit(p: number, side: -1 | 1): number;
  bend(p: number, x: number): number;
}

/** A stage of an original on the board, as its course is laid from it. */
export interface BoardStage {
  readonly id: string;
  readonly name: string;
  readonly tables: RoadTablesAt;
  readonly planLimits: ArcPlanLimits;
  /** Its two roads' tables to `end`, road 1's and road 2's. */
  readonly roads: readonly [RoadTables, RoadTables];
  /** The turns its original shows at right angles, each turned by its degrees about its record's start (K, 2026-11-15). */
  readonly rightAngles: readonly RightAngle[];
  /** The kinds of its pictures its tables draw at a right angle (a street across), not drawn where two streets cross. */
  readonly acrossKinds: ReadonlySet<number>;
  readonly goal: number;
  readonly end: number;
  readonly checkpoint: number | null;
  /** A road position and a unit across, metres. */
  readonly metres: number;
  readonly across: number;
  /** The stretches the original holds the car on a road over; elsewhere road 2. */
  readonly held: readonly HeldStretch[];
  readonly grid: readonly BoardGridSlot[];
  readonly lanes: ReturnType<typeof lanesOverTwoRoads>;
  /** Its heights, given the road the course takes at each position, the original's road number (`BoardCourseRoads`). */
  heights(roads: BoardCourseRoads): BoardHeights;
  /** Positions where a Section is cut besides where the roads part and meet and a hold changes. */
  readonly cuts: readonly number[];
  /**
   * Whether a Section is cut where either road's picture changes too (BIG RUN's), its outermost bands its own; else at
   * as few of its pictures' changes as keep each Section's strips within the course format's, its pictures changing
   * within it, its outermost bands those at its middle.
   */
  readonly cutAtPictures: boolean;
  /** The positions a stripe's colors span. */
  readonly stripePeriod: number;
  /** The ground where nothing else gives one: beneath a clear run, between the roads and beyond the limits. */
  readonly clearGround: Material;
  /** The lanes' material where the held road's picture gives none. */
  readonly laneGround: Material;
  /** The original's road `road`'s picture across at position `p`, its record there `record`. */
  runsOf(road: RoadNumber, record: RoadPlanRecord, p: number): readonly ColoredRun[];
  /** Its skies' knots and each one's yaw origin in a Section from `s`. */
  skies(context: BoardCourseContext): {
    readonly knots: readonly BoardSkyKnot[];
    yawOf(knot: BoardSkyKnot, s: number): number;
  };
  /** Its sprites. */
  sprites(context: BoardCourseContext): readonly BoardSprite[];
}

/**
 * Stage `stage`'s course: its plan (road 2 as P, road 1 beside it), road 1's centre where it parts from P and meets it
 * again (where it jumps back onto P, its own to a position before), and as the road not taken where it leaves; its lanes over both roads; its grid; its Sections cut where a
 * picture changes, the roads part and meet and a hold changes; each road drawn at the course's height (K, 2026-11-13);
 * its pictures' strips, road 2's clear runs first, road 1's picture over them, then
 * road 2's own; its limits `LIMIT_UNITS` beyond the outermost road's centre; its skies and sprites by its hooks.
 */
export function layBoardCourse(stage: BoardStage) {
  const { id, name, goal, end, metres, across: ACROSS, grid, lanes } = stage;
  // How far within the limits a crossing's road's material and outermost bands end, units: a unit, as a road's
  // elsewhere, and as far again as its lines may lie from their true places, so that only the limits bound its union.
  const CROSSING_MARGIN = 1 + Math.ceil((2 * LINE_TOLERANCE) / ACROSS);
  // How far the course reaches across, both sides' limits: no arc nor turn of its plan bends tighter, so that its road
  // never comes near itself where it turns (the plan's least radius, `leastLaneRadius` in its rule).
  const reach = LIMIT_UNITS * ACROSS * 2;
  // A right angle at 90° as tight as its limits allow, its inside's limit alone; one where two streets cross at
  // `CROSSING_RADIUS`, or as near it as its table leaves room (`radii`, once its plan's partings are known).
  const radii = new Map<number, number>();
  const leastAt = (from: number, to: number) => {
    const corner = stage.rightAngles.find((a) => from <= a.at && a.at <= to);
    return corner ? (radii.get(corner.at) ?? LIMIT_UNITS * ACROSS) : reach;
  };
  const planOf = (one: readonly RoadPlanRecord[], p: readonly RoadPlanRecord[]) =>
    twoRoadPlan(stage.tables, one, p, end, metres, leastAt, stage.planLimits);
  // Its roads' records, each right angle turned by its degrees.
  const tabled = stage.roads.map((r) => rightAngled(r.plan, stage.rightAngles, stage.tables)) as [
    readonly RoadPlanRecord[],
    readonly RoadPlanRecord[],
  ];
  // Its plan: road 2 as P, road 1 beside it; but where the original holds the car on road 1 after road 1 has left P for
  // good, the course follows road 1 from where it left, road 2 the other road from there (K, 2026-11-12).
  const leftAt = (planned: ReturnType<typeof planOf>) =>
    planned.beside.partings.find((g) => !g.meets)?.from ?? Infinity;
  const first = planOf(tabled[0], tabled[1]);
  const switchAt = stage.held.some((h) => h.road === 1 && h.from >= leftAt(first) && h.from < end)
    ? leftAt(first)
    : Infinity;
  const original = (road: RoadNumber, p: number): RoadNumber => (p >= switchAt ? (road === 1 ? 2 : 1) : road);
  const [road1, road2] = ([1, 2] as const).map((road) => ({
    plan: [
      ...tabled[road - 1]!.filter((r) => r.start < switchAt),
      ...tabled[2 - road]!.filter((r) => r.start >= switchAt),
    ],
  })) as [{ plan: RoadPlanRecord[] }, { plan: RoadPlanRecord[] }];
  const records = switchAt < Infinity ? ([road1.plan, road2.plan] as const) : ([tabled[0], tabled[1]] as const);
  // A crossing's radius: its centreline's turn reaches no nearer than its table's straight either side of its corner
  // runs, with one heading, and than the Sections' cuts its plan and holds make there.
  const cutsNear = [
    0,
    end,
    ...stage.rightAngles.map((a) => a.at),
    ...first.beside.partings.flatMap((g) => [g.from, g.to]),
    ...stage.held.flatMap((h) => [h.from, h.to]),
    ...stage.cuts,
  ];
  for (const corner of stage.rightAngles.filter((a) => a.crossing)) {
    const p = records[1];
    const i = p.findIndex((r) => r.start === corner.at);
    const straightOn = (a: RoadPlanRecord, b: RoadPlanRecord) =>
      a.radius === 0 && b.radius === 0 && a.heading === b.heading;
    let j = i - 1;
    while (j > 0 && straightOn(p[j - 1]!, p[j]!)) j--;
    let k = i;
    while (k + 1 < p.length && straightOn(p[k]!, p[k + 1]!)) k++;
    const room = Math.min(
      p[i - 1]!.radius === 0 ? corner.at - p[j]!.start : 0,
      p[i]!.radius === 0 ? (p[k + 1]?.start ?? end) - corner.at : 0,
      ...cutsNear.filter((c) => c !== corner.at).map((c) => Math.abs(c - corner.at)),
    );
    // A turn of `degrees` over `room` whole positions either side, one spare, bends at this radius.
    const angle = (corner.degrees * Math.PI) / 180;
    radii.set(corner.at, Math.max(LIMIT_UNITS * ACROSS, Math.min(CROSSING_RADIUS, (2 * (room - 1) * metres) / angle)));
  }
  const once = planOf(...records);
  // The road the original holds the car on, where it does, as the course's road: P or the other.
  const held = stage.held.map((h) => ({ ...h, road: h.from >= switchAt ? (h.road === 1 ? 2 : 1) : h.road }) as const);
  const heldOn = (p: number): RoadNumber => held.find((h) => h.from <= p && p < h.to)?.road ?? 2;
  // The other road, where it leaves P and never meets it again, is the road not taken from where the original holds the
  // car on P after it, or from where it leaves.
  const leaving = once.beside.partings.find((g) => !g.meets);
  const leavesAt = leaving
    ? Math.max(leaving.from, held.find((h) => h.road === 2 && h.from >= leaving.from)?.from ?? leaving.from)
    : Infinity;
  // No turn bends tighter than the course reaches on its inside there: its reach, or its limit beyond road 1's centre
  // where road 1 lies on that side of P before it is the road not taken, so that no limit folds past a turn's centre.
  // Road 1 lies as P turns, so the plan is laid again until its elements keep (its partings are its tables').
  const insideOf = (laid: typeof once) => (from: number, to: number, side: 'left' | 'right') => {
    let most = 0;
    for (const g of laid.beside.partings) {
      const [a, b] = [Math.max(g.from, from), Math.min(g.to, to, leavesAt)];
      for (let k = 0; k <= INSIDE_SAMPLES && a <= b; k++) {
        const lateral = laid.beside.lateralAt(a + ((b - a) * k) / INSIDE_SAMPLES) * metres;
        most = Math.max(most, side === 'left' ? -lateral : lateral);
      }
    }
    return Math.max(leastAt(from, to), LIMIT_UNITS * ACROSS + most);
  };
  let plan = once;
  for (let pass = 0; ; pass++) {
    if (pass === PLAN_PASSES) throw contractUnmet(`${name}'s plan does not keep its turns' least radii`);
    const next = twoRoadPlan(stage.tables, ...records, end, metres, insideOf(plan), stage.planLimits);
    const keeps =
      JSON.stringify([next.p.elements, next.road1.elements]) === JSON.stringify([plan.p.elements, plan.road1.elements]);
    plan = next;
    if (keeps) break;
  }
  // Road 1's centre, units across from P: where it parts and meets P again, its own; where it leaves, P's.
  const knots = [
    ...new Set([
      0,
      end,
      ...road1.plan.map((r) => r.start),
      ...road2.plan.map((r) => r.start),
      ...plan.beside.partings.flatMap((g) =>
        g.meets
          ? [
              ...Array.from({ length: Math.ceil((g.to - g.from) / SAMPLE) + 1 }, (_, k) =>
                Math.min(g.to, g.from + k * SAMPLE),
              ),
              // A road that jumps back onto P where it meets it: its own centre to a position before.
              ...(g.jumps ? [g.to - 1] : []),
            ]
          : // A road that leaves: its own centre to where it is the road not taken.
            Array.from({ length: Math.ceil((Math.min(leavesAt, end) - g.from) / SAMPLE) + 1 }, (_, k) =>
              Math.min(leavesAt, end, g.from + k * SAMPLE),
            ),
      ),
    ]),
  ]
    .filter((p) => p >= 0 && p <= end)
    .sort((a, b) => a - b);
  const lateral1 = straightThrough(
    knots.map((p) => [p, p >= leavesAt ? 0 : (plan.beside.lateralAt(p) * metres) / ACROSS] as const),
  );
  // A road that leaves P and never meets it again, the road not taken (K, 2026-11-09), drawn as far as it heads within
  // 60° of P, where its lateral is taken across P; its lanes none of the course's.
  const notTaken: number[] = [];
  if (leavesAt < end)
    for (let p = leavesAt; p <= end; p += SAMPLE) {
      try {
        notTaken.push(p, plan.beside.lateralAt(p));
      } catch {
        break;
      }
    }
  const notTakenEnd = notTaken.length ? notTaken[notTaken.length - 2]! : leavesAt;
  const shown1 = straightThrough([
    ...knots.filter((p) => p < leavesAt).map((p) => [p, lateral1.at(p)] as const),
    ...Array.from(
      { length: notTaken.length / 2 },
      (_, k) => [notTaken[2 * k]!, (notTaken[2 * k + 1]! * metres) / ACROSS] as const,
    ),
    ...(notTakenEnd < end ? [[end, 0] as const] : []),
  ]);
  // Where road 1 jumps back onto P, its picture is drawn at its own centre to the cut there, never sweeping to P.
  const jumpsBack = plan.beside.partings.filter((g) => g.jumps).map((g) => g.to);
  /** Road 1's drawn centre at `p` in a Section ending at `to`: its own to a jump back at its end. */
  const shownIn = (p: number, to: number) =>
    jumpsBack.includes(p) && p >= to - 1e-6 ? lateral1.at(p - 1) : shown1.at(p);
  const roads: BoardCourseRoads = { switchAt, course: (p) => original(heldOn(p), p), original };
  const heights = stage.heights(roads);
  // The grid: the own car's slot (the first) and the others', each on its road (laterals units across).
  const slotLateral = (k: number) => {
    const slot = grid[k]!;
    return (slot.road === 1 ? lateral1.at(slot.position) : 0) + slot.lateral;
  };
  const ownLateral = slotLateral(0) * ACROSS;
  // The lanes along P, road 1's and road 2's, metres.
  const along = lanes.lanesAlong(lateral1, new PiecewiseLinear([{ from: 0, to: end, a: 0, b: 0 }]));
  const laneNames = ['a', 'b', 'c', 'm', 'd', 'e', 'f'] as const;
  const laneAt = (lane: keyof DrivenLanes, p: number) => along.widths[lane].at(p) * ACROSS;
  const leftEdge = (p: number) => (along.centreLane.at(p) - along.widths.a.at(p) - along.widths.b.at(p) / 2) * ACROSS;
  const rightEdge = (p: number) => leftEdge(p) + laneNames.reduce((sum, l) => sum + laneAt(l, p), 0);
  const stand = (s: number): StartGrids => {
    const lefts = laneNames.filter((l) => laneAt(l, grid[0]!.position) > 0);
    let x = leftEdge(grid[0]!.position);
    let own = lefts[0]!;
    for (const l of lefts) {
      if (ownLateral >= x) own = l;
      x += laneAt(l, grid[0]!.position);
    }
    const k = lefts.indexOf(own);
    const pair = k + 1 < lefts.length ? [own, lefts[k + 1]!] : [lefts[k - 1]!, own];
    const boundary =
      leftEdge(grid[0]!.position) +
      lefts.slice(0, lefts.indexOf(pair[1]!)).reduce((sum, l) => sum + laneAt(l, grid[0]!.position), 0);
    return {
      origin: { s, lateral: micrometre(ownLateral) },
      originals: {
        car: {
          places: grid.map((slot, j) => ({
            ahead: (slot.position - grid[0]!.position) * metres,
            right: slotLateral(j) * ACROSS - ownLateral,
          })),
        },
      },
      limits: [
        ownLateral - leftEdge(grid[0]!.position) + LIMIT_UNITS * ACROSS,
        rightEdge(grid[0]!.position) - ownLateral + LIMIT_UNITS * ACROSS,
      ],
      lanes: [pair[0]!, pair[1]!],
      meet: boundary - ownLateral,
      laneWidth: Math.min(...pair.map((l) => laneAt(l as keyof DrivenLanes, grid[0]!.position))),
    };
  };
  // Laid on back for its grid and the camera behind its rearmost slot.
  const back = Math.ceil(gridReach(stand(0)) + cameraDistance(CAMERA_DEFINITION));
  const station = (p: number) => back + p * metres;
  const positionOf = (s: number) => (s - back) / metres;
  // Its plan's pieces, metres: an arc after an arc of its own radius and side one arc, as the format holds them.
  const pieces: { length: number; turn: number }[] = [{ length: back, turn: 0 }];
  for (const e of plan.p.elements) {
    const piece = { length: (e.to - e.from) * metres, turn: e.turn };
    const last = pieces.at(-1)!;
    const same =
      last.turn !== 0 && piece.turn !== 0 && Math.abs(last.turn / last.length - piece.turn / piece.length) < 1e-12;
    if (same) pieces[pieces.length - 1] = { length: last.length + piece.length, turn: last.turn + piece.turn };
    else pieces.push(piece);
  }
  const path = new CoursePath(pieces);
  const laidLength = path.length;
  // Its heights, metres, as its original gives them.
  const bends: Bend[] = heights.bends.map((b) => ({
    from: station(b.from),
    to: station(b.to),
    curvature: b.curvature,
  }));
  const kinks: Kink[] = heights.kinks.map((k) => ({
    at: k.at === 0 ? 0 : station(k.at),
    change: k.change,
  }));
  // Where each road's picture changes, and where they part and meet: the Sections' cuts.
  const pictureAt = (road: RoadNumber, p: number) => {
    const records = (road === 1 ? road1 : road2).plan;
    return [...records].reverse().find((r) => r.start <= p) ?? records[0]!;
  };
  const changes = (records: readonly RoadPlanRecord[]) =>
    records
      .filter((r, i) => i > 0 && (r.kind !== records[i - 1]!.kind || r.variant !== records[i - 1]!.variant))
      .map((r) => r.start);
  // Each right angle with its turn on P; one at 90° has the street across painted as ground, its turn a Section on each
  // side of its middle.
  const corners = stage.rightAngles.flatMap((r) => {
    const turn = plan.p.turns.find((t) => t.from <= r.at && r.at <= t.to);
    return turn ? [{ ...r, turn }] : [];
  });
  const cornerTurns = corners.map((c) => c.turn);
  const paintedTurns = corners.filter((c) => !c.crossing).map((c) => c.turn);
  // A crossing corner is where two straight streets cross (a trial, K, 2026-11-27): P rounds it on their inside
  // over its turn, the course's road on the street it leaves to the corner and on the one it takes from it, each in its
  // own picture there, its tables' pictures across a right angle (`acrossKinds`) not drawn.
  const ownPicture = (from: number, way: 1 | -1) => {
    const p = road2.plan;
    let i = p.length - 1;
    while (i > 0 && p[i]!.start > from) i--;
    while (i >= 0 && i < p.length && stage.acrossKinds.has(p[i]!.kind)) i += way;
    return p[Math.max(0, Math.min(p.length - 1, i))]!;
  };
  const crossings = corners
    .filter((c) => c.crossing)
    .map((c, k) => ({
      k,
      corner: c,
      from: c.turn.from,
      to: c.turn.to,
      lines: plan.streets(c.turn),
      leaving: ownPicture(c.turn.from, -1),
      taking: ownPicture(c.turn.to, 1),
    }));
  const crossingAt = (p: number) => crossings.find((x) => x.from <= p && p <= x.to);
  /** The line the course's road lies on at `p` within a crossing: the street it leaves to its corner, then the other. */
  const lineAt = (x: (typeof crossings)[number], p: number) => (p < x.corner.at ? x.lines.leaves : x.lines.takes);
  // Where a line `x` units right of the course's road's centre lies at `p`, units across P, and how many units across P
  // a unit across the road spans there.
  const bend = (p: number, x: number) => {
    const c = crossingAt(p);
    return c ? (lineAt(c, p).lateral(p, (x * ACROSS) / metres) * metres) / ACROSS : x;
  };
  const slant = (p: number) => {
    const c = crossingAt(p);
    return c ? lineAt(c, p).slant(p) : 1;
  };
  // The halves of its streets the course does not take, a road not taken's picture each with no material: the street
  // it leaves on ahead of the corner in its picture before it, none at a T, and the one it takes back from the corner
  // in its picture after it, from the corner's middle out as far as the screen draws or to the next corner, as far as
  // it heads within 60° of P.
  const marks = stage.rightAngles.map((a) => a.at);
  const farthest = RENDER_FAR_DEPTH_METERS / metres;
  const streets = crossings.flatMap(
    (x): (BoardStreet & { id: string; line: typeof x.lines.leaves; picture: RoadPlanRecord })[] => {
      const c = x.corner;
      const street = (side: 'ahead' | 'back') => {
        const way = side === 'ahead' ? 1 : -1;
        const line = side === 'ahead' ? x.lines.leaves : x.lines.takes;
        const bound =
          way > 0
            ? Math.min(end, c.at + farthest, ...marks.filter((m) => m > c.at))
            : Math.max(0, c.at - farthest, ...marks.filter((m) => m < c.at));
        // As far as it is taken across P: to its bound, or to within a position of where it is refused.
        const taken = (p: number) => {
          try {
            line.lateral(p);
            return true;
          } catch {
            return false;
          }
        };
        let reached = c.at;
        let refused: number | null = null;
        for (let p = c.at; ; p = way > 0 ? Math.min(bound, p + SAMPLE) : Math.max(bound, p - SAMPLE)) {
          if (!taken(p)) {
            refused = p;
            break;
          }
          reached = p;
          if (p === bound) break;
        }
        while (refused !== null && Math.abs(refused - reached) > 1) {
          const m = (reached + refused) / 2;
          if (taken(m)) reached = m;
          else refused = m;
        }
        if (reached === c.at) return [];
        return [
          {
            id: `street-${x.k}-${side}`,
            corner: c,
            side,
            from: Math.min(c.at, reached),
            to: Math.max(c.at, reached),
            line,
            picture: side === 'ahead' ? x.leaving : x.taking,
            lateral: (p: number, u: number) => (line.lateral(p, (u * ACROSS) / metres) * metres) / ACROSS,
          },
        ];
      };
      // A T draws no street ahead of it.
      return [...(c.ahead ? street('ahead') : []), ...street('back')];
    },
  );
  // What a crossing draws along lines across P: its streets' halves, and the course's road within its turn.
  const lined = [
    ...streets.map((t) => ({ id: t.id, line: t.line, from: t.from, to: t.to, picture: t.picture, course: false })),
    ...crossings.flatMap((x) => [
      {
        id: `crossing-${x.k}-in`,
        line: x.lines.leaves,
        from: x.from,
        to: x.corner.at,
        picture: x.leaving,
        course: true,
      },
      { id: `crossing-${x.k}-out`, line: x.lines.takes, from: x.corner.at, to: x.to, picture: x.taking, course: true },
    ]),
  ];
  // The lines a picture drawn along a crossing's line over positions `[a, b]` is read from, and where its turn is cut so
  // that each of its Sections reads from no more than the format holds.
  const edgesOf = (d: (typeof lined)[number]) =>
    stage.runsOf(original(2, d.from), d.picture, d.from).flatMap(({ run }) => [run.from * ACROSS, run.to * ACROSS]);
  const readingOver = (d: (typeof lined)[number], a: number, b: number) => {
    const within = (p: number) => Math.min(Math.max(p, a), b - 1e-9);
    const spans = Array.from({ length: INSIDE_SAMPLES + 1 }, (_, k) =>
      d.line.slant(within(a + ((b - a) * k) / INSIDE_SAMPLES)),
    );
    return readingLines(edgesOf(d), Math.min(...spans), Math.max(...spans), LINE_TOLERANCE);
  };
  const linesOver = (a: number, b: number) =>
    lined
      .filter((d) => d.from < b - 1e-6 && d.to > a + 1e-6)
      .reduce((n, d) => n + readingOver(d, Math.max(d.from, a), Math.min(d.to, b)).lines.length, 0);
  const crossingCuts = crossings.flatMap((x) =>
    (
      [
        [x.from, x.corner.at],
        [x.corner.at, x.to],
      ] as const
    ).flatMap(([a, b]) => {
      // The fewest even parts each reading from no more lines than the format holds.
      for (let n = 1; n <= 64; n++) {
        const at = (i: number) => a + ((b - a) * i) / n;
        if (Array.from({ length: n }, (_, i) => linesOver(at(i), at(i + 1))).every((m) => m <= READING_LINES))
          return Array.from({ length: n - 1 }, (_, i) => at(i + 1));
      }
      throw contractUnmet(`${name}'s crossing at ${x.corner.at} reads from more lines than its Sections hold`);
    }),
  );
  const pictureChanges = [...changes(road1.plan), ...changes(road2.plan), ...streets.flatMap((t) => [t.from, t.to])];
  const sectionCuts = [
    ...(stage.cutAtPictures ? pictureChanges : []),
    ...plan.beside.partings.flatMap((g) => [g.from, g.to]),
    ...held.flatMap((h) => [h.from, h.to]),
    ...stage.cuts,
    // A right angle: the road on either side of it comes near itself; its turn a Section either side of its middle.
    ...stage.rightAngles.map((a) => a.at),
    ...cornerTurns.flatMap((t) => [t.from, t.to]),
    ...crossingCuts,
    ...(leavesAt < end ? [notTakenEnd] : []),
  ].filter((p) => p > 0 && p < end);
  // Where a Section's pictures' stretches are cut: its own cuts and every picture change, each once and in order, so
  // that the stretches follow one another.
  const cutsAt = [
    ...new Set(stage.cutAtPictures ? sectionCuts : [...sectionCuts, ...pictureChanges.filter((p) => p > 0 && p < end)]),
  ].sort((a, b) => a - b);
  // Whether road `road` is drawn at `p`, at the course's height however far apart the original holds the two (K,
  // 2026-11-13): the road not taken as far as its picture goes, every other road everywhere; but where two streets
  // cross, road 1 not within the crossing's turn, nor where a street is drawn and it lies with P, beneath road 2's
  // picture, so that the streets keep within the format's active strips.
  const drawn = (road: RoadNumber, p: number) =>
    (road === 2 || p < leavesAt || road === heldOn(p) || p < notTakenEnd) &&
    !(
      road === 1 &&
      (crossingAt(p) || (streets.some((t) => t.from <= p && p <= t.to) && Math.abs(lateral1.at(p)) < 1e-9))
    );
  // The course's limit on a side, LIMIT_UNITS beyond the outermost road's centre there, along its street where two
  // cross.
  const limit = (p: number, side: -1 | 1) => {
    const c = [0, ...(p < leavesAt ? [lateral1.at(p)] : [])];
    return bend(p, side < 0 ? Math.min(...c) - LIMIT_UNITS : Math.max(...c) + LIMIT_UNITS);
  };
  const context: BoardCourseContext = {
    station,
    positionOf,
    back,
    path,
    shown1,
    leavesAt,
    notTakenEnd,
    drawn,
    roads,
    streets,
    limit,
    bend,
  };
  const placed = stage.sprites(context);
  const runsOf = (road: RoadNumber, p: number) => stage.runsOf(original(road, p), pictureAt(road, p), p);
  // Where its pictures change within a Section, the Sections cut at as few of them as keep each one's strips within
  // the format's: a picture's stretch counts at most a strip a run and three more a color its stripe changes to.
  if (!stage.cutAtPictures) {
    const changesAt = [...new Set(pictureChanges.filter((p) => p > 0 && p < end))].sort((a, b) => a - b);
    const bounds = [...new Set([0, ...sectionCuts, ...changesAt, end])].sort((a, b) => a - b);
    const stripsOver = (a: number, b: number) => {
      const at = (a + b) / 2;
      return [
        ...([1, 2] as const).filter((road) => drawn(road, at)).map((road) => runsOf(road, at)),
        ...lined.filter((d) => d.from <= at && at <= d.to).map((d) => stage.runsOf(original(2, at), d.picture, at)),
      ].reduce(
        (sum, runs) =>
          sum +
          runs.reduce((n, { colors }) => {
            let parts = 0;
            for (let k = STRIPE_PART; k < colors.length; k += STRIPE_PART)
              if (colors[k] !== colors[k - STRIPE_PART]) parts++;
            return n + 1 + 3 * parts;
          }, 2),
        4,
      );
    };
    let filled = 0;
    for (let i = 0; i + 1 < bounds.length; i++) {
      const [a, b] = [bounds[i]!, bounds[i + 1]!];
      if (sectionCuts.includes(a)) filled = 0;
      const strips = stripsOver(a, b);
      if (filled + strips > SECTION_STRIPS && filled > 0 && changesAt.includes(a)) {
        sectionCuts.push(a);
        filled = 0;
      }
      filled += strips;
    }
  }
  // Where two streets cross, the limits lie along the street the course is on, at knots within `LINE_TOLERANCE` of it.
  const crossingStops = crossings.flatMap((x) =>
    (
      [
        [x.from, x.corner.at],
        [x.corner.at, x.to],
      ] as const
    ).flatMap(([a, b]) =>
      [-1, 1].flatMap((side) =>
        knotsWithin((p) => bend(Math.min(p, b - 1e-9), side * LIMIT_UNITS) * ACROSS, a, b, LINE_TOLERANCE).map(
          ([p]) => p,
        ),
      ),
    ),
  );
  const limitStops = [...new Set([...knots, ...crossingStops])].sort((a, b) => a - b);
  // A Section's limits, it ending at `to`: LIMIT_UNITS beyond the outermost road's centre on each side, road 1's held
  // up to a jump back or to where it is the road not taken at the Section's end, as its picture is, so that they jump
  // only at its ends.
  const limitsTo = (to: number): ProgramLimits => {
    const limitKnots = (side: number) =>
      limitStops.map((p) => {
        const atEnd = p >= to - 1e-6;
        const road1 =
          p < leavesAt
            ? [jumpsBack.includes(p) && atEnd ? lateral1.at(p - 1) : lateral1.at(p)]
            : p === leavesAt && atEnd
              ? [(plan.beside.lateralAt(p) * metres) / ACROSS]
              : [];
        const c = [0, ...road1];
        return [
          station(p),
          bend(p, side < 0 ? Math.min(...c) - LIMIT_UNITS : Math.max(...c) + LIMIT_UNITS) * ACROSS,
        ] as [number, number];
      });
    return {
      left: [[0, limitKnots(-1)[0]![1]], ...limitKnots(-1)],
      right: [[0, limitKnots(1)[0]![1]], ...limitKnots(1)],
      ground: stage.clearGround,
    };
  };
  // A Section's limits at `mid` outside a 90° right angle, the street across reaching out `CROSS_UNITS` beyond them.
  const crossing = (limits: ProgramLimits, mid: number): ProgramLimits => {
    const corner = paintedTurns.find((t) => t.from <= mid && mid < t.to);
    if (!corner) return limits;
    const out = (knots: ProgramLimits['left'], by: number) =>
      knots.map(([s, v]) => [s, v + by * CROSS_UNITS * ACROSS] as const);
    return corner.turn < 0 ? { ...limits, left: out(limits.left, -1) } : { ...limits, right: out(limits.right, 1) };
  };
  const skies = stage.skies(context);
  const skyKnots = skies.knots;
  // A Section's strips: each road's picture drawn, road 1's beneath road 2's, each run striped by its colors.
  const zero = back;
  const period = stage.stripePeriod * metres;
  /** A stripe's runs of one color, in parts of STRIPE_PART positions, those where `beneath` (a stripe) differs alone. */
  const stripeParts = (colors: readonly (number | null)[], beneath?: readonly (number | null)[]) => {
    const parts: { from: number; to: number; color: number }[] = [];
    for (let k = 0; k < colors.length; k += STRIPE_PART) {
      const color = colors[k]!;
      if (beneath && beneath[k] === color) continue;
      const last = parts.at(-1);
      if (last && last.to === k && last.color === color) last.to = k + STRIPE_PART;
      else parts.push({ from: k, to: k + STRIPE_PART, color });
    }
    return parts;
  };
  /** The parts' strips over [a, b] between `left` and `right`, each its color alone, repeated along the stripe. */
  const partStrips = (
    parts: readonly { from: number; to: number; color: number }[],
    left: Lateral | null,
    right: Lateral | null,
    a: number,
    b: number,
    positionAt: (s: number) => CoursePosition,
  ) =>
    parts.flatMap((q) =>
      periodic({ from: q.from * metres, to: q.to * metres }, period, zero, a, b, (x, y) =>
        stripElement(positionAt(x), positionAt(y), left, right, q.color, null),
      ),
    ) as StripDocument[];
  const bandStrips = (
    colors: readonly (number | null)[],
    material: Material | null,
    left: Lateral | null,
    right: Lateral | null,
    a: number,
    b: number,
    positionAt: (s: number) => CoursePosition,
  ): StripDocument[] => {
    if (colors[0] === null)
      return [stripElement(positionAt(a), positionAt(b), left, right, 'transparent', null) as StripDocument];
    // The stripe's runs of one color, the most common color laid over the whole.
    const parts = stripeParts(colors);
    const count = new Map<number, number>();
    for (const q of parts) count.set(q.color, (count.get(q.color) ?? 0) + q.to - q.from);
    const base = [...count].sort((x, y) => y[1] - x[1])[0]![0];
    return [
      stripElement(positionAt(a), positionAt(b), left, right, base, material),
      ...partStrips(
        parts.filter((q) => q.color !== base),
        left,
        right,
        a,
        b,
        positionAt,
      ),
    ] as StripDocument[];
  };
  /** How many parts a stripe's own strips lay beyond their first: its parts not of its most common color. */
  const ownParts = (colors: readonly (number | null)[]) => {
    const parts = stripeParts(colors);
    const count = new Map<number, number>();
    for (const q of parts) count.set(q.color, (count.get(q.color) ?? 0) + q.to - q.from);
    const base = [...count].sort((x, y) => y[1] - x[1])[0]![0];
    return parts.filter((q) => q.color !== base).length;
  };
  // Each right angle's turn, stations along P.
  const cornerStations = cornerTurns.map((t) => [station(t.from), station(t.to)] as const);
  const laid = layRoad({
    id,
    name,
    pieces,
    // Cut where a picture changes, but within its grid, whose stretch its first Section holds, and from its goal on.
    cuts: sectionCuts.filter((p) => p > Math.max(...grid.map((g) => g.position)) + GRID_CLEAR && p < goal).map(station),
    // Near a right angle the course reaches its inside's limit alone, as the corner bends.
    reach: (u: number) =>
      cornerStations.some(([a, b]) => u >= a - reach && u <= b + reach) ? LIMIT_UNITS * ACROSS : reach,
    road: { bends, kinks },
    grids: stand(station(grid[0]!.position)),
    checkpoints: stage.checkpoint === null ? [] : [{ id: `${id}-CP1`, s: station(stage.checkpoint) }],
    finish: { id: `${id}-GOAL`, s: station(goal) },
    section: (span, positionAt) => {
      const steps = [
        span.from,
        ...[...new Set([...knots, ...crossingStops])]
          .map(station)
          .filter((s) => s > span.from + 1e-6 && s < span.to - 1e-6)
          .sort((a, b) => a - b),
        span.to,
      ];
      // Within a Section's span, a position: its end's inside it, so that a crossing's line is the one it holds.
      const inside = (s: number) => Math.min(Math.max(0, positionOf(s)), positionOf(span.to) - 1e-9);
      // Its lanes, those wide somewhere in it, along the street the course is on where two cross.
      const widthKnots = laneNames.map((l) =>
        simplified(
          steps.map(
            (s) => [s, micrometre(laneAt(l, Math.max(0, positionOf(s))) * slant(inside(s)))] as [number, number],
          ),
        ),
      );
      const present = laneNames.filter((_, k) => widthKnots[k]!.some(([, w]) => w > 0));
      const laneDocs: LaneDocument[] = present.map((l) => {
        const w = widthKnots[laneNames.indexOf(l)]!;
        return {
          kind: 'lane',
          id: l,
          width: w.every(([, x]) => x === w[0]![1]) ? w[0]![1] : w.map(([s, x]) => ({ at: positionAt(s), width: x })),
        };
      });
      const centre = simplified(
        steps.map(
          (s) =>
            [s, micrometre(bend(inside(s), along.centreLane.at(Math.max(0, positionOf(s)))) * ACROSS)] as [
              number,
              number,
            ],
        ),
      );
      // The lines a crossing's pictures are read from within this Section, each a Boundary within `LINE_TOLERANCE` of
      // its true line, and each edge's line and offset from it.
      const [pa, pb] = [Math.max(0, positionOf(span.from)), positionOf(span.to)];
      const readings = lined
        .filter((d) => d.from < pb - 1e-6 && d.to > pa + 1e-6)
        .map((d) => {
          const [a, b] = [Math.max(d.from, pa), Math.min(d.to, pb)];
          const within = (p: number) => Math.min(Math.max(p, a), b - 1e-9);
          const reading = readingOver(d, a, b);
          const boundaries = reading.lines.map((r, k) => ({
            id: `${d.id}-${k}`,
            knots: knotsWithin(
              (s) => d.line.lateral(within(positionOf(s)), r / metres) * metres,
              station(a),
              station(b),
              LINE_TOLERANCE,
            ).map(([s, v]) => ({ at: positionAt(s), lateral: micrometre(v) })),
          }));
          const place = (x: number): Lateral => {
            const { line, offset } = reading.read(x * ACROSS);
            return { boundary: boundaries[line]!.id, offset: micrometre(offset) };
          };
          return { ...d, boundaries, place };
        });
      // Road 1's centre as a Boundary, its pictures' runs lying from it.
      const road1Knots = simplified(
        [...new Set([...steps, ...notTaken.filter((_, k) => k % 2 === 0).map(station)])]
          .filter((s) => s >= span.from && s <= span.to)
          .sort((a, b) => a - b)
          .map(
            (s) =>
              [s, micrometre(shownIn(Math.max(0, positionOf(s)), positionOf(span.to)) * ACROSS)] as [number, number],
          ),
      );
      const roadLateral = (road: RoadNumber, x: number): Lateral =>
        road === 2 ? micrometre(x * ACROSS) : { boundary: 'road-1-centre', offset: micrometre(x * ACROSS) };
      // Its pictures' stretches: cut where either road's picture changes or one is drawn or not.
      const within = [
        span.from,
        ...cutsAt.map(station).filter((s) => s > span.from + 1e-6 && s < span.to - 1e-6),
        span.to,
      ];
      const strips = within.slice(0, -1).flatMap((a, j) => {
        const b = within[j + 1]!;
        if (!(b - a > 1e-3)) return [];
        const at = (Math.max(positionOf(a), 0) + positionOf(b)) / 2;
        // Road 2's clear runs first, road 1's picture over them, then road 2's own: where road 2 is clear the
        // picture beneath it shows, or none.
        const layer = (road: RoadNumber, clear: boolean) => {
          if (!drawn(road, at)) return [];
          // The road not taken's picture has no material: the car never reaches it.
          const away = road === 1 && at >= leavesAt;
          const groundOf = (material: Material | null) => (away ? null : (material ?? stage.clearGround));
          const runs = runsOf(road, at);
          const fromCentre = roadLateral;
          // Its inner runs of this layer that are painted: the most common of them across, its stripe and ground, is
          // laid beneath each stretch of them, and each over it only where it differs, so that a picture keeps within
          // the format's active strips.
          const beneath = (k: number) =>
            k > 0 && k < runs.length - 1 && (runs[k]!.run.pen === null) === clear && runs[k]!.colors[0] !== null;
          const widths = new Map<string, number>();
          runs.forEach(({ run, colors, material }, k) => {
            if (!beneath(k)) return;
            const key = JSON.stringify([colors, groundOf(material)]);
            widths.set(key, (widths.get(key) ?? 0) + run.to - run.from);
          });
          const common = [...widths].sort((x, y) => y[1] - x[1])[0]?.[0];
          const base = common ? (JSON.parse(common) as [readonly (number | null)[], Material | null]) : null;
          return runs.flatMap(({ run, colors, material }, k, all) => {
            if ((run.pen === null) !== clear) return [];
            const outerRun = k === 0 || k === all.length - 1;
            const ground = groundOf(material);
            if (base && beneath(k)) {
              let last = k;
              while (beneath(last + 1)) last++;
              // The most common run beneath the stretch of runs from here, where it starts.
              const under = beneath(k - 1)
                ? []
                : bandStrips(
                    base[0],
                    base[1],
                    fromCentre(road, run.from),
                    fromCentre(road, all[last]!.run.to),
                    a,
                    b,
                    positionAt,
                  );
              const [left, right] = [fromCentre(road, run.from), fromCentre(road, run.to)];
              const grounding =
                ground === base[1]
                  ? []
                  : [stripElement(positionAt(a), positionAt(b), left, right, null, ground) as StripDocument];
              const differing = stripeParts(colors, base[0]);
              // Its own strips where they are as few as the parts it differs by.
              const over =
                differing.length === 0
                  ? []
                  : 1 + ownParts(colors) <= differing.length
                    ? bandStrips(colors, null, left, right, a, b, positionAt)
                    : partStrips(differing, left, right, a, b, positionAt);
              return [...under, ...grounding, ...over];
            }
            const colored = bandStrips(
              colors,
              outerRun ? null : ground,
              k === 0 ? null : fromCentre(road, run.from),
              k === all.length - 1 ? null : fromCentre(road, run.to),
              a,
              b,
              positionAt,
            );
            // An outer run's material out to within a unit of the picture's end, inside the limits, whose ground reaches on.
            const reaching =
              outerRun && !away
                ? [
                    stripElement(
                      positionAt(a),
                      positionAt(b),
                      fromCentre(road, k === 0 ? 1 - LIMIT_UNITS : run.from),
                      fromCentre(road, k === 0 ? run.to : LIMIT_UNITS - 1),
                      null,
                      ground,
                    ),
                  ]
                : [];
            return [...reaching, ...colored];
          });
        };
        // A street's picture along its line, as two roads are drawn where they cross (OUTRUN's forks): each one's sides
        // (`sides`: its runs outside its road and its edges) first, then each one's road, the most common of its runs
        // laid beneath them all and each other over it where it differs; a half the course does not take with no
        // material.
        const streetLayer = (d: (typeof readings)[number], sides: boolean) => {
          const groundOf = (material: Material | null) => (d.course ? (material ?? stage.clearGround) : null);
          const runs = stage
            .runsOf(original(2, at), d.picture, at)
            .filter(({ run, colors }) => run.pen !== null && colors[0] !== null)
            .filter(({ run }) => (run.paint === 'outside' || run.paint === 'edge') === sides);
          // The course's outermost runs reach out on their sides as its road's do elsewhere, their material to their
          // edges.
          if (sides)
            return runs.flatMap(({ run, colors, material }, k) => {
              const [left, right] = [d.place(run.from), d.place(run.to)];
              const open = d.course && (k === 0 || k === runs.length - 1);
              if (!open) return bandStrips(colors, groundOf(material), left, right, a, b, positionAt);
              const [inner, outer] =
                k === 0
                  ? [right, d.place(CROSSING_MARGIN - LIMIT_UNITS)]
                  : [left, d.place(LIMIT_UNITS - CROSSING_MARGIN)];
              return [
                stripElement(
                  positionAt(a),
                  positionAt(b),
                  k === 0 ? outer : inner,
                  k === 0 ? inner : outer,
                  null,
                  groundOf(material),
                ) as StripDocument,
                ...bandStrips(colors, null, k === 0 ? null : left, k === 0 ? right : null, a, b, positionAt),
              ];
            });
          if (runs.length === 0) return [];
          const widths = new Map<string, number>();
          for (const { run, colors, material } of runs) {
            const key = JSON.stringify([colors, groundOf(material)]);
            widths.set(key, (widths.get(key) ?? 0) + run.to - run.from);
          }
          const [baseColors, baseGround] = JSON.parse([...widths].sort((x, y) => y[1] - x[1])[0]![0]) as [
            readonly (number | null)[],
            Material | null,
          ];
          return [
            ...bandStrips(
              baseColors,
              baseGround,
              d.place(runs[0]!.run.from),
              d.place(runs.at(-1)!.run.to),
              a,
              b,
              positionAt,
            ),
            ...runs.flatMap(({ run, colors, material }) => {
              const [left, right] = [d.place(run.from), d.place(run.to)];
              const ground = groundOf(material);
              const grounding =
                ground === baseGround
                  ? []
                  : [stripElement(positionAt(a), positionAt(b), left, right, null, ground) as StripDocument];
              const differing = stripeParts(colors, baseColors);
              const over =
                differing.length === 0
                  ? []
                  : 1 + ownParts(colors) <= differing.length
                    ? bandStrips(colors, null, left, right, a, b, positionAt)
                    : partStrips(differing, left, right, a, b, positionAt);
              return [...grounding, ...over];
            }),
          ];
        };
        const here = readings.filter((d) => d.from <= at && at <= d.to);
        const halves = here.filter((d) => !d.course);
        const course = here.filter((d) => d.course);
        // The original's second road over its first, whichever is P; where two streets cross, the course's road along
        // its street as the other street is drawn, over it.
        const [under, over] = original(2, at) === 2 ? ([1, 2] as const) : ([2, 1] as const);
        const roads = course.length
          ? [
              ...course.flatMap((d) => streetLayer(d, true)),
              ...halves.flatMap((d) => [...streetLayer(d, true), ...streetLayer(d, false)]),
              ...course.flatMap((d) => streetLayer(d, false)),
            ]
          : [
              ...halves.flatMap((d) => streetLayer(d, false)),
              ...layer(over, true),
              ...layer(under, false),
              ...layer(over, false),
            ];
        return course.length ? roads : [...halves.flatMap((d) => streetLayer(d, true)), ...roads];
      });
      const inForce = [...skyKnots].reverse().find((k) => k.s <= span.from + 1e-6)!;
      const environment = (k: BoardSkyKnot, s: number): EnvironmentDocument => ({
        at: positionAt(s),
        name,
        background: { image: k.image, horizonY: SKY_HORIZON, yawOrigin: skies.yawOf(k, span.from) },
        transition: k.s < span.from - 1e-6 ? 0 : micrometre(k.transition),
      });
      // Its outermost bands, which its ground's material reaches out from: the outer road's outer runs on each side.
      const mid = (Math.max(positionOf(span.from), 0) + positionOf(span.to)) / 2;
      const roadsDrawn = ([1, 2] as const).filter((road) => drawn(road, mid) && !(road === 1 && mid >= leavesAt));
      const outer = (side: number) => {
        const road = roadsDrawn.reduce((r, q) =>
          side * ((q === 1 ? lateral1.at(mid) : 0) - (r === 1 ? lateral1.at(mid) : 0)) > 0 ? q : r,
        );
        // Within a crossing's turn, its street's picture along its line.
        const along = readings.find((d) => d.course && d.from <= mid && mid <= d.to);
        const runs = along ? stage.runsOf(original(2, mid), along.picture, mid) : runsOf(road, mid);
        const { run, colors } = side < 0 ? runs[0]! : runs.at(-1)!;
        const centre = road === 1 ? lateral1.at(mid) : 0;
        const edge = along ? CROSSING_MARGIN : 1;
        const [from, to] = side < 0 ? [edge - LIMIT_UNITS, run.to] : [run.from, LIMIT_UNITS - edge];
        const place = (x: number) => (along ? along.place(x) : roadLateral(road, x));
        // Outside a 90° right angle the street across, its road's surface, reaches out.
        const corner = paintedTurns.find((t) => t.from <= mid && mid < t.to);
        const across = corner && side === (corner.turn < 0 ? -1 : 1);
        const color = across
          ? (runsOf(road, mid).find((r) => r.run.paint === 'surface')?.colors[0] ?? colors[0])
          : colors[0];
        return {
          band: {
            left: bend(mid, centre + from) * ACROSS,
            right: bend(mid, centre + to) * ACROSS,
            colors: [color ?? 0],
            material: across || color === null || color === undefined ? stage.clearGround : groundMaterial(color),
          },
          left: place(from),
          right: place(to),
        };
      };
      return {
        lanes: laneDocs,
        centerLane: 'b',
        centerLateral: centre.every(([, v]) => v === centre[0]![1])
          ? centre[0]![1]
          : centre.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
        linkLane: 'b',
        // Its lanes driven on its held road's surface's material wherever its pictures give them none (a clear run).
        strips: [
          // The ground beneath all, from limit to limit, between the roads' pictures where they lie apart.
          stripElement(
            positionAt(span.from),
            positionAt(span.to),
            { boundary: 'outer-left', offset: 0 },
            { boundary: 'outer-right', offset: 0 },
            null,
            stage.clearGround,
          ),
          stripElement(
            positionAt(span.from),
            positionAt(span.to),
            { lane: present[0]!, side: 'left', offset: 0 },
            { lane: present.at(-1)!, side: 'right', offset: 0 },
            null,
            runsOf(heldOn(mid), mid).find((r) => r.run.paint === 'surface')?.material ?? stage.laneGround,
          ),
          ...strips,
        ],
        outermost: [outer(-1), outer(1)],
        limits: crossing(limitsTo(positionOf(span.to)), mid),
        boundaries: [
          {
            id: 'road-1-centre',
            knots: road1Knots.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
          },
          // The lines a crossing's pictures are read from.
          ...readings.flatMap((d) => d.boundaries),
        ],
        sprites: placed
          .filter((t) => t.s >= span.from && (t.s < span.to || (span.to >= laidLength - 1e-6 && t.s <= span.to)))
          .sort((a, b) => a.s - b.s || a.lateral - b.lateral)
          .map((t) =>
            spriteElement({
              image: t.image,
              palette: t.palette,
              at: positionAt(t.s),
              lateral: t.lateral,
              groundOffset: t.groundOffset,
              body: t.body,
            }),
          ),
        environments: [
          environment(inForce, span.from),
          ...skyKnots.filter((k) => k.s > span.from + 1e-6 && k.s < span.to - 1e-6).map((k) => environment(k, k.s)),
        ],
      };
    },
  });
  return { laid, plan, path, station, placed, skyKnots, roads, leavesAt, heights, streets };
}
