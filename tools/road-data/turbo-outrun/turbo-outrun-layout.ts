/**
 * A leg of TURBO OUTRUN laid out as a course ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md#turbo-outruns-courses)):
 * its four stages one after another from the entry, each to where the original ends it, the last on past its gate;
 * P, the plan, from the stages' road paths as one heading table; the road width from their width points, and lane b's
 * centre from it; the Sections, cut where their road comes near itself; the profile with the dips and the crossings'
 * ramps.
 */
import { requireInput } from '../../authoring/authoring-error.js';
import { positionMetres, type BoardClock } from '../out-run-board/clock.js';
import { levelBeyond } from '../shared/quadratic.js';
import {
  headingPlan,
  pathHeadings,
  planFidelity,
  VECTOR_RESOLUTION,
  type PlanElement,
} from '../shared/heading-plan.js';
import { leastLaneRadius } from '../../../src/course/plan-clearance.js';
import { domainCuts, writtenPlan } from '../shared/section-writing.js';
import { CoursePath } from '../shared/course-path.js';
import { tableRuns } from '../out-run-board/hills.js';
import { bendOf, profileOf } from '../shared/road-profile.js';
import { overlaps } from '../shared/screen-pieces.js';
import { tableGrades } from '../out-run-board/table-grades.js';
import { crossingsOf, partedCrossings, roadCells } from '../shared/crossings.js';
import { moundGrades, type Mound } from '../shared/jump-mound.js';
import { UNIT_METRES } from '../sega-16/pixel-grid.js';
import { centreLaneAt, drivenLanes, LANE_RULE_WIDTHS } from './turbo-outrun-cross-section.js';
import { ROAD_HALF } from '../out-run-board/two-roads.js';
import { PATH_POSITIONS, type TurboOutrunStage } from './turbo-outrun-road.js';
import { roadWidths, type HeightTable, type WidthHeightPoint } from '../out-run-board/road-tables.js';
import { monotoneCubic, writtenAt } from '../shared/monotone-cubic.js';
import type { StageRun } from './turbo-outrun-scenery.js';

/** A stage on the course: where its position 0 lies on the course's positions, and the positions of its own it spans. */
export interface CourseStage {
  readonly stage: TurboOutrunStage;
  readonly run: StageRun;
  readonly start: number;
  /** To its end; the leg's last to its finish's straight's end. */
  readonly length: number;
}

/**
 * A Section to write: its id, the course positions it spans, the stage it is named after, and its start's station on
 * the course (the lengths of the Sections before it, as written).
 */
export interface Piece {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly stage: number;
  readonly origin: number;
}

/** What a leg's course is laid from. */
export interface LayoutInputs {
  /** The leg's stages in running order, and their runs. */
  readonly stages: readonly TurboOutrunStage[];
  readonly runs: readonly StageRun[];
  /** The width the leg's first stage begins at from its start (450). */
  readonly startWidth: number;
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  readonly clock: BoardClock;
  /** The original's line distances (`lineDistances`), which the tables' pieces are solved with. */
  readonly distances: Float64Array;
  /** The camera's distance behind the car: the entry lies this far before GO. */
  readonly cameraDistance: number;
  /** A stage's Sections' ids' stem. */
  readonly slug: (stage: number) => string;
  /** The leg's dips, each's stage and road position in it, and their shape. */
  readonly dips: readonly { readonly stage: number; readonly position: number }[];
  readonly dip: Mound;
}

/**
 * A leg's course laid out from the entry: the camera's distance of straight before GO, its first stage's position 0;
 * then each stage from its position 0 in running order, its road path's headings carried on straight ahead past 1495,
 * to its end (`run.end`), the leg's last to its road path's end (`PATH_POSITIONS`), the original's road past its
 * finish, as one heading table.
 */
export function layTurboOutrun(inputs: LayoutInputs) {
  const { stages, runs, clock } = inputs;
  const metresAPosition = positionMetres(clock);
  const go = inputs.cameraDistance / metresAPosition;
  const last = stages.length - 1;
  // The stages on the course.
  const course: CourseStage[] = [];
  let start = go;
  stages.forEach((stage, n) => {
    const run = runs.find((r) => r.stage === stage.number)!;
    requireInput(
      run.stops === (n === last),
      `/stages/${stage.number}`,
      `Stage ${stage.number} stops where its leg does not end`,
    );
    const length = n === last ? PATH_POSITIONS : run.end;
    course.push({ stage, run, start, length });
    start += length;
  });
  const total = start;

  // The road width: every stage's width points it runs, from the leg's start width.
  const points: WidthHeightPoint[] = course.flatMap(({ stage, run, start }) =>
    stage.widthsHeights
      .filter((p) => p.kind !== 0 && p.position < run.end)
      .map((p) => ({ ...p, position: start + p.position })),
  );
  const knots = roadWidths(points, total, inputs.startWidth, clock);
  // The width as its points give it, straight between its knots, level beyond them: what the original's program
  // decides by the width is decided by it (whether the roads are apart as an object comes out).
  const original = levelBeyond(knots, total);
  // The width drawn: joined as one monotone cubic over the course (`monotoneCubic`, Original road data), written at
  // each stage's every position, straight between them.
  const joined = monotoneCubic(knots);
  const at = [
    ...new Set([
      0,
      ...course.flatMap(({ start, length }) => Array.from({ length: Math.ceil(length) }, (_, k) => start + k)),
      total,
    ]),
  ].sort((x, y) => x - y);
  const width = writtenAt(joined, at);
  // Lane b's centre, metres right of P.
  const offset = width.map((w) => centreLaneAt(w) * UNIT_METRES, [LANE_RULE_WIDTHS[0]!]);
  // Where a lane's width changes slope: where the road width passes a width at which the lanes' rule changes.
  const laneBreaks = width.map((w) => w, LANE_RULE_WIDTHS).breaks;

  // The heading table: each stage's road path at its positions on the course, carried on straight ahead past 1495 to
  // its end, then the course's end.
  const positions: number[] = [];
  const [xs, ys]: [number[], number[]] = [[], []];
  course.forEach(({ stage, start, length }) => {
    for (let p = 0; p < length; p++) {
      const q = Math.min(p, stage.path.x.length - 1);
      positions.push(start + p);
      xs.push(stage.path.x[q]!);
      ys.push(stage.path.y[q]!);
    }
  });
  positions.push(total);
  xs.push(xs.at(-1)!);
  ys.push(ys.at(-1)!);
  const table = { positions, headings: pathHeadings({ x: xs, y: ys }) };

  // The road's sides from P: its asphalt, metres.
  const metres = (g: number) => g * metresAPosition;
  const asphalt = (g: number) => (width.at(g) + ROAD_HALF) * UNIT_METRES;
  const gates = course.map(({ start, run }) => start + run.gate);
  // The Sections' seams: each stage's end, where the next begins.
  const seams = course.slice(0, -1).map(({ start, length }) => start + length);

  // The plan, its turns no tighter than its lanes keep, and P laid from it after the entry's straight. A side's lanes
  // reach from lane b's centre to lane a's left edge or lane f's right.
  const laneReach = (g: number, side: 'left' | 'right') => {
    const { a, b, c, m, d, e, f } = drivenLanes(width.at(g));
    const left = (-b / 2 - a) * UNIT_METRES;
    const right = left + (a + b + c + m + d + e + f) * UNIT_METRES;
    return side === 'left' ? -(offset.at(g) + left) : offset.at(g) + right;
  };
  const least = (from: number, to: number, side: 'left' | 'right') =>
    leastLaneRadius(
      Math.max(
        ...[from, to, ...Array.from({ length: Math.ceil(to - from) }, (_, k) => from + k), ...width.breaks]
          .filter((g) => g >= from && g <= to)
          .map((g) => laneReach(g, side)),
      ),
    );
  const plan = headingPlan(table, VECTOR_RESOLUTION, metresAPosition, least);
  const path: PlanElement[] = [];
  for (const s of [{ from: 0, to: go, turn: 0 }, ...plan.elements]) {
    const before = path.at(-1);
    if (before && before.turn === 0 && s.turn === 0) path[path.length - 1] = { ...before, to: s.to };
    else path.push(s);
  }
  const line = new CoursePath(
    path.map((s) => ({ start: metres(s.from), length: metres(s.to - s.from), turn: s.turn })),
  );
  // The Sections: one a stage, each cut again where its road comes near itself.
  const need = (g: number, side: 'left' | 'right') => leastLaneRadius(laneReach(g, side));
  const gateMetres = [go, ...gates].map(metres);
  // Where the road is one (its width at most 250), metres along P: a cut parts no two roads.
  const single = width.atMost(ROAD_HALF).map((t) => ({ a: metres(t.from), b: metres(t.to) }));
  const one = (a: number, b: number) =>
    single.map((t) => ({ a: Math.max(t.a, a), b: Math.min(t.b, b) })).filter((t) => t.b > t.a);
  const spans: { id: string; from: number; to: number; stage: number }[] = [];
  course.forEach(({ stage }, n) => {
    const from = n === 0 ? 0 : seams[n - 1]!;
    const to = n === last ? total : seams[n]!;
    const cuts = domainCuts(line, metres(from), metres(to), (u, side) => need(u / metresAPosition, side), gateMetres, {
      step: metresAPosition,
      one,
      finish: metres(gates.at(-1)!),
    }).map((u) => u / metresAPosition);
    [from, ...cuts].forEach((a, i) =>
      spans.push({
        id: i === 0 ? inputs.slug(stage.number) : `${inputs.slug(stage.number)}-${i + 1}`,
        from: a,
        to: cuts[i] ?? to,
        stage: stage.number,
      }),
    );
  });

  // Each Section's start, the lengths of the Sections before it as written, so seams agree exactly.
  const pieces: Piece[] = [];
  for (const span of spans) {
    const before = pieces.at(-1);
    const length = (p: Piece) =>
      writtenPlan(line, { from: metres(p.from), to: metres(p.to) }).reduce((sum, e) => sum + e.length, 0);
    pieces.push({ ...span, origin: before ? before.origin + length(before) : 0 });
  }
  const pieceAt = (g: number) => pieces.find((p) => g <= p.to) ?? pieces.at(-1)!;
  /** The station of course position `g` along P. */
  const station = (g: number) => {
    const piece = pieceAt(g);
    return piece.origin + metres(g - piece.from);
  };
  const cuts = pieces.slice(1).map((p) => p.from);

  // The profile: the leg's tables run at the speed by their screen's pieces, as the original runs a leg on from its
  // GO to its stop, from 0 at the course's start, a piece reaching past the road's end ending there; the crossings kept
  // apart.
  const end = station(total);
  const grades = tableGrades(
    tableRuns(
      course.flatMap(({ stage, run, start }) =>
        stage.widthsHeights
          .filter((p) => p.kind === 0 && p.position < run.end)
          .map((p) => ({ ...p, position: start + p.position })),
      ),
      inputs.tables,
      () => inputs.kmh,
      clock,
    ),
    inputs.kmh,
    station,
    end,
    { clock, distances: inputs.distances },
  );
  const { changes } = grades;
  const pairs = roadCells(line, {
    from: 0,
    to: metres(total),
    step: metresAPosition,
    sides: (u) => [asphalt(u / metresAPosition), asphalt(u / metresAPosition)],
  }).pairs.map(([a, b]) => [station(a / metresAPosition), station(b / metresAPosition)] as [number, number]);
  const crossings = crossingsOf(pairs, metresAPosition);
  // Each row of boards a dip across the whole road.
  const startOf = (stage: number) => course.find((c) => c.stage.number === stage)!.start;
  const mounds = moundGrades(inputs.dips.map((j) => ({ top: station(startOf(j.stage) + j.position), ...inputs.dip })));
  const parted = partedCrossings([...changes, ...mounds.changes], crossings, end, mounds.kinks);
  const profile = profileOf(
    parted.changes.filter((c) => c.from >= 0 && c.to <= end).map(bendOf),
    cuts.map(station),
    mounds.kinks,
  );

  return {
    /** How far a side's lanes reach from P at course position `g`, metres. */
    laneReach,
    clock,
    go,
    total,
    course,
    path,
    line,
    plan: {
      ...plan,
      fidelity: planFidelity(table, plan.elements, plan.start, metresAPosition, VECTOR_RESOLUTION, plan.widened),
    },
    width,
    original,
    offset,
    laneBreaks,
    pieces,
    station,
    /** P's pose at course position `g`. */
    pose: (g: number) => line.pose(metres(g)),
    profile,
    screenProfile: profileOf(changes.map(bendOf)),
    overlaps: overlaps(grades.stretches),
    mounds: { runs: mounds.runs, joined: mounds.joined, longest: mounds.longest },
    slopes: mounds.slopes,
    crossings: crossings.map((crossing, k) => ({ passages: crossing.passages, ...parted.partings[k]! })),
    rampRadius: parted.radius,
  };
}
