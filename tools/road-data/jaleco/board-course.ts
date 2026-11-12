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
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { cameraDistance } from '../../../src/view/camera.js';
import type { ArcPlanLimits } from '../shared/arc-plan.js';
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
import type { DrivenLanes, lanesOverTwoRoads } from '../shared/two-roads.js';
import { LINE_PIXELS, type PaintedRun } from './road-lines.js';
import { twoRoadPlan } from './road-plan.js';
import type { HeldStretch, RoadNumber, RoadPlanRecord, RoadTables, RoadTablesAt } from './road-tables.js';

/** How far the course reaches beyond the outermost road's centre on each side, units: a line's half. */
export const LIMIT_UNITS = LINE_PIXELS / 2;
/** How far apart in height the two roads may be where they share their plan for both to be drawn, metres (K, 2026-11-11). */
const DRAWN_APART = 1;
/** No Section is cut this near the grid's front, positions. */
const GRID_CLEAR = 1000;
/** Road 1's centre is taken every this many positions where it parts from P. */
const SAMPLE = 500;
/** A stripe's part: the stripes' runs are whole multiples of it, positions. */
const STRIPE_PART = 15;

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
  const length = run.to - run.from;
  const phase = zero + run.from;
  let first = phase + Math.ceil((a - phase) / period - 1e-9) * period;
  // A run begun before `a`.
  if (first - period + length > a + 1e-6) out.push(strip(a, Math.min(b, first - period + length)));
  const every = micrometre(period);
  let count = 0;
  while (first + count * period + length <= b + 1e-9) count++;
  if (count > 0 && micrometre(first + length) + (count - 1) * every > b) count--;
  if (count > 0) {
    const element = strip(first, first + length);
    out.push(count === 1 ? element : { kind: 'repeat', every, count, elements: [element] });
  }
  first += count * period;
  if (first < b - 1e-6) out.push(strip(first, Math.min(b, first + length)));
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
  /** Whether road `road` is drawn at position `p`. */
  drawn(road: RoadNumber, p: number): boolean;
}

/** A stage of an original on the board, as its course is laid from it. */
export interface BoardStage {
  readonly id: string;
  readonly name: string;
  readonly tables: RoadTablesAt;
  readonly planLimits: ArcPlanLimits;
  /** Its two roads' tables to `end`, road 1's and road 2's. */
  readonly roads: readonly [RoadTables, RoadTables];
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
  readonly heights: BoardHeights;
  /** Positions where a Section is cut besides where a picture changes, the roads part and meet and a hold changes. */
  readonly cuts: readonly number[];
  /** The positions a stripe's colors span. */
  readonly stripePeriod: number;
  /** The ground where nothing else gives one: beneath a clear run, between the roads and beyond the limits. */
  readonly clearGround: Material;
  /** The lanes' material where the held road's picture gives none. */
  readonly laneGround: Material;
  /** Road `road`'s picture across at position `p`, its record there `record`. */
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
 * again, and as the road not taken where it leaves; its lanes over both roads; its grid; its Sections cut where a
 * picture changes, the roads part and meet and a hold changes; each road drawn but where they share their plan and lie
 * more than a metre apart in height; its pictures' strips, road 2's clear runs first, road 1's picture over them, then
 * road 2's own; its limits `LIMIT_UNITS` beyond the outermost road's centre; its skies and sprites by its hooks.
 */
export function layBoardCourse(stage: BoardStage) {
  const { id, name, goal, end, metres, across: ACROSS, held, grid, lanes } = stage;
  const [road1, road2] = stage.roads;
  // Its plan: road 2 as P, road 1 beside it.
  const plan = twoRoadPlan(stage.tables, road1.plan, road2.plan, end, metres, () => 0, stage.planLimits);
  const leaving = plan.beside.partings.filter((g) => !g.meets);
  const leavesAt = leaving.length ? leaving[0]!.from : Infinity;
  // Road 1's centre, units across from P: where it parts and meets P again, its own; where it leaves, P's.
  const knots = [
    ...new Set([
      0,
      end,
      ...road1.plan.map((r) => r.start),
      ...road2.plan.map((r) => r.start),
      ...plan.beside.partings.flatMap((g) =>
        g.meets
          ? Array.from({ length: Math.ceil((g.to - g.from) / SAMPLE) + 1 }, (_, k) =>
              Math.min(g.to, g.from + k * SAMPLE),
            )
          : [g.from],
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
  // The road the original holds the car on, where it does.
  const heldOn = (p: number): RoadNumber => held.find((h) => h.from <= p && p < h.to)?.road ?? 2;
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
  const bends: Bend[] = stage.heights.bends.map((b) => ({
    from: station(b.from),
    to: station(b.to),
    curvature: b.curvature,
  }));
  const kinks: Kink[] = stage.heights.kinks.map((k) => ({
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
  const cutsAt = [
    ...changes(road1.plan),
    ...changes(road2.plan),
    ...plan.beside.partings.flatMap((g) => [g.from, g.to]),
    ...held.flatMap((h) => [h.from, h.to]),
    ...stage.cuts,
    ...(leavesAt < end ? [notTakenEnd] : []),
  ].filter((p) => p > 0 && p < end);
  // Whether road `road` is drawn at `p`: the held road always; the other unless they share their plan and lie more than
  // a metre apart in height, or it has left P.
  const drawn = (road: RoadNumber, p: number) => {
    if (road === heldOn(p)) return true;
    if (road === 1 && p >= leavesAt) return p < notTakenEnd;
    const apart = stage.heights.apart(p);
    return !(Math.abs(lateral1.at(p)) < 1e-6 && apart > DRAWN_APART);
  };
  const context: BoardCourseContext = { station, positionOf, back, path, shown1, leavesAt, notTakenEnd, drawn };
  const placed = stage.sprites(context);
  const runsOf = (road: RoadNumber, p: number) => stage.runsOf(road, pictureAt(road, p), p);
  // Its limits: LIMIT_UNITS beyond the outermost road's centre on each side.
  const limitKnots = (side: number) =>
    knots.map((p) => {
      const c = [0, ...(p < leavesAt ? [lateral1.at(p)] : [])];
      return [station(p), (side < 0 ? Math.min(...c) - LIMIT_UNITS : Math.max(...c) + LIMIT_UNITS) * ACROSS] as [
        number,
        number,
      ];
    });
  const limits: ProgramLimits = {
    left: [[0, limitKnots(-1)[0]![1]], ...limitKnots(-1)],
    right: [[0, limitKnots(1)[0]![1]], ...limitKnots(1)],
    ground: stage.clearGround,
  };
  const skies = stage.skies(context);
  const skyKnots = skies.knots;
  // A Section's strips: each road's picture drawn, road 1's beneath road 2's, each run striped by its colors.
  const zero = back;
  const period = stage.stripePeriod * metres;
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
    // The stripe's runs of one color, in parts of STRIPE_PART positions, the most common color laid over the whole.
    const parts: { from: number; to: number; color: number }[] = [];
    for (let k = 0; k < colors.length; k += STRIPE_PART) {
      const color = colors[k]!;
      const last = parts.at(-1);
      if (last && last.color === color) last.to = k + STRIPE_PART;
      else parts.push({ from: k, to: k + STRIPE_PART, color });
    }
    const count = new Map<number, number>();
    for (const q of parts) count.set(q.color, (count.get(q.color) ?? 0) + q.to - q.from);
    const base = [...count].sort((x, y) => y[1] - x[1])[0]![0];
    return [
      stripElement(positionAt(a), positionAt(b), left, right, base, material),
      ...parts
        .filter((q) => q.color !== base)
        .flatMap((q) =>
          periodic({ from: q.from * metres, to: q.to * metres }, period, zero, a, b, (x, y) =>
            stripElement(positionAt(x), positionAt(y), left, right, q.color, null),
          ),
        ),
    ] as StripDocument[];
  };
  const laid = layRoad({
    id,
    name,
    pieces,
    // Cut where a picture changes, but within its grid, whose stretch its first Section holds, and from its goal on.
    cuts: cutsAt.filter((p) => p > Math.max(...grid.map((g) => g.position)) + GRID_CLEAR && p < goal).map(station),
    reach: LIMIT_UNITS * ACROSS * 2,
    road: { bends, kinks },
    grids: stand(station(grid[0]!.position)),
    checkpoints: stage.checkpoint === null ? [] : [{ id: `${id}-CP1`, s: station(stage.checkpoint) }],
    finish: { id: `${id}-GOAL`, s: station(goal) },
    section: (span, positionAt) => {
      const steps = [
        span.from,
        ...knots.map(station).filter((s) => s > span.from + 1e-6 && s < span.to - 1e-6),
        span.to,
      ];
      // Its lanes, those wide somewhere in it.
      const widthKnots = laneNames.map((l) =>
        simplified(steps.map((s) => [s, micrometre(laneAt(l, Math.max(0, positionOf(s))))] as [number, number])),
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
        steps.map((s) => [s, micrometre(along.centreLane.at(Math.max(0, positionOf(s))) * ACROSS)] as [number, number]),
      );
      // Road 1's centre as a Boundary, its pictures' runs lying from it.
      const road1Knots = simplified(
        [...new Set([...steps, ...notTaken.filter((_, k) => k % 2 === 0).map(station)])]
          .filter((s) => s >= span.from && s <= span.to)
          .sort((a, b) => a - b)
          .map((s) => [s, micrometre(shown1.at(Math.max(0, positionOf(s))) * ACROSS)] as [number, number]),
      );
      const fromCentre = (road: RoadNumber, x: number): Lateral =>
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
          return runsOf(road, at).flatMap(({ run, colors, material }, k, all) => {
            if ((run.pen === null) !== clear) return [];
            const outerRun = k === 0 || k === all.length - 1;
            // The road not taken's picture has no material: the car never reaches it.
            const away = road === 1 && at >= leavesAt;
            const ground = away ? null : (material ?? stage.clearGround);
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
        return [...layer(2, true), ...layer(1, false), ...layer(2, false)];
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
        const runs = runsOf(road, mid);
        const { run, colors } = side < 0 ? runs[0]! : runs.at(-1)!;
        const centre = road === 1 ? lateral1.at(mid) : 0;
        const [from, to] = side < 0 ? [1 - LIMIT_UNITS, run.to] : [run.from, LIMIT_UNITS - 1];
        const color = colors[0];
        return {
          band: {
            left: (centre + from) * ACROSS,
            right: (centre + to) * ACROSS,
            colors: [color ?? 0],
            material: color === null || color === undefined ? stage.clearGround : groundMaterial(color),
          },
          left: fromCentre(road, from),
          right: fromCentre(road, to),
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
        limits,
        boundaries: [
          {
            id: 'road-1-centre',
            knots: road1Knots.map(([s, lateral]) => ({ at: positionAt(s), lateral })),
          },
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
  return { laid, plan, path, station, placed, skyKnots };
}
