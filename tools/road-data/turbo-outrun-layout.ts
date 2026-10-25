/**
 * TURBO OUTRUN's course laid out ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-course)): its 16
 * stages one after another from the entry, each to where the original ends it, a leg's last joined to the next leg's
 * start; P, the plan, from the stages' road paths as one heading table; the road width from their width points, and
 * lane b's centre from it; the Sections, cut where their road comes near itself; the profile
 * with the humps and the crossings' bumps.
 */
import { requireInput } from '../course/authoring-io.js';
import { POSITION_METRES, Quadratic, type TurnSegment } from './offset-plan.js';
import { headingPlan, pathHeadings, planFidelity, VECTOR_RESOLUTION } from './heading-plan.js';
import { leastLaneRadius } from '../../src/course/plan-clearance.js';
import { passagePairs, writtenPlan } from './section-writing.js';
import { CoursePath } from './course-path.js';
import { tableRuns } from './hills.js';
import { bendOf, closedGrades, LOOK, profileOf, separatedCrossings, stageGrades, type Change } from './road-profile.js';
import { crossingsOf, overlappingCells } from './crossings.js';
import { moundKinks, type Mound } from './jump-mound.js';
import { UNIT_METRES } from './pixel-grid.js';
import { centreLaneAt, drivenLanes, LANE_RULE_WIDTHS, ROAD_HALF } from './turbo-outrun-cross-section.js';
import { STAGE_COUNT, type TurboOutrunStage } from './turbo-outrun-road.js';
import { roadWidths, WIDTH_RATE, type HeightTable, type WidthHeightPoint } from './road-tables.js';
import { monotoneCubic } from './monotone-cubic.js';
import type { StageRun } from './turbo-outrun-scenery.js';

/**
 * A leg's last stage joins the next leg's start, which the original reaches through another screen: from 1460, where its
 * road is one of three lanes, its width widens to the next start's at the width points' fastest rate (speed 80); its
 * Section ends at 1458, where that corner's rounding begins.
 */
export const JOIN = Object.freeze({ from: 1460, speed: 80, seam: 1458 });
/**
 * The course ends 260 positions past the finish, a straight on from LOS ANGELES's road: chosen when every vehicle had
 * to stop before the course's end, which the run no longer requires.
 */
const GOAL_POSITIONS = 260;
/**
 * The ground between the roads is SAND where it is wider than this, metres; narrower, as it opens, the asphalt's, so the
 * material changes metres away from where the lanes' rule does.
 */
export const OPEN = 0.5;
/** Two passages at least this far apart along the road may cross, metres; a passage runs on over gaps of 3 positions. */
const PASSAGES_APART = 200;
const PASSAGE_GAP = 3;
/** A cut keeps this far from a gate, positions. */
const GATE_ROOM = 2;

/** A stage on the course: where its position 0 lies on the course's positions, and the positions of its own it spans. */
export interface CourseStage {
  readonly stage: TurboOutrunStage;
  readonly run: StageRun;
  readonly start: number;
  /** To its end; a leg's last to its join's end; the last to its finish's straight's end. */
  readonly length: number;
  /** Whether it is a leg's last, joined to the next leg's start. */
  readonly joined: boolean;
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

/** What the course is laid from. */
export interface LayoutInputs {
  readonly stages: readonly TurboOutrunStage[];
  readonly runs: readonly StageRun[];
  /** The width each stage begins at from its leg's start (450). */
  readonly startWidths: readonly number[];
  readonly tables: ReadonlyMap<number, HeightTable>;
  readonly kmh: number;
  /** The camera's distance behind the car: the entry lies this far before GO. */
  readonly cameraDistance: number;
  /** A stage's Sections' ids' stem. */
  readonly slug: (stage: number) => string;
  /** The humps, each's stage and road position in it, and their shape. */
  readonly humps: readonly { readonly stage: number; readonly position: number }[];
  readonly hump: Mound;
}

/** The function straight between `points` `[position, value]`, from the first's position to the last's. */
const through = (points: readonly (readonly [number, number])[]) =>
  new Quadratic(
    points.slice(1).map(([p, v], i) => {
      const [p0, v0] = points[i]!;
      return { from: p0, to: p, a: v0, b: (v - v0) / (p - p0), c: 0 };
    }),
  );

/** The piecewise linear function through `knots` at `p`. */
function linearAt(knots: readonly (readonly [number, number])[], p: number) {
  const i = knots.findIndex(([q]) => q >= p);
  if (i <= 0) return knots[i < 0 ? knots.length - 1 : 0]![1];
  const [[p0, v0], [p1, v1]] = [knots[i - 1]!, knots[i]!];
  return p1 === p0 ? v1 : v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
}

/**
 * The course laid out from the entry: the camera's distance of straight before GO, NEW YORK's position 0; then each
 * stage from its position 0 in running order, its road path's headings carried on straight ahead past 1495, to its end
 * (`run.end`), a leg's last to its join's end, LOS ANGELES 260 positions past its finish, as one heading table.
 */
export function layTurboOutrun(inputs: LayoutInputs) {
  const { stages, runs } = inputs;
  const go = inputs.cameraDistance / POSITION_METRES;
  const last = STAGE_COUNT - 1;
  const joinRate = JOIN.speed * WIDTH_RATE;
  // The stages on the course.
  const course: CourseStage[] = [];
  let start = go;
  stages.forEach((stage, n) => {
    const run = runs.find((r) => r.stage === n)!;
    const joined = run.stops && n < last;
    requireInput(run.stops === (joined || n === last), `/stages/${n}`, `Stage ${n} stops where its leg does not end`);
    const length =
      n === last ? run.gate + GOAL_POSITIONS : joined ? JOIN.from + inputs.startWidths[n + 1]! / joinRate : run.end;
    course.push({ stage, run, start, length, joined });
    start += length;
  });
  const total = start;

  // The road width: every stage's width points it runs, each leg's join, from the first start's width.
  const points: WidthHeightPoint[] = course.flatMap(({ stage, run, start, joined }, n) => [
    ...stage.widthsHeights
      .filter((p) => p.kind !== 0 && p.position < run.end)
      .map((p) => ({ ...p, position: start + p.position })),
    ...(joined ? [{ position: start + JOIN.from, kind: 1, value: inputs.startWidths[n + 1]!, speed: JOIN.speed }] : []),
  ]);
  const knots = roadWidths(points, total, inputs.startWidths[0]!);
  for (const { start, joined, stage } of course)
    if (joined)
      requireInput(
        linearAt(knots, start + JOIN.from) === 0,
        `/stages/${stage.number}`,
        `Stage ${stage.number}'s road is not one of three lanes at ${JOIN.from}`,
      );
  // The width as its points give it, straight between its knots, level beyond them: what the original's program
  // decides by the width is decided by it (whether the roads are apart as an object comes out).
  const original = through(
    [[0, knots[0]![1]] as const, ...knots, [total, knots.at(-1)![1]] as const].filter(
      ([p], i, all) => i === 0 || p > all[i - 1]![0],
    ),
  );
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
  const width = through(at.map((p) => [p, joined(p)] as const));
  // Lane b's centre, metres right of P.
  const offset = width.map((w) => centreLaneAt(w) * UNIT_METRES, [LANE_RULE_WIDTHS[0]!]);
  // Where a lane's width changes slope: where the road width passes a width at which the lanes' rule changes.
  const laneBreaks = width.map((w) => w, LANE_RULE_WIDTHS).breaks;
  // Where the ground between the roads opens wider than `OPEN`, and closes.
  const openings = width.map((w) => w, [ROAD_HALF + OPEN / (2 * UNIT_METRES)]).breaks;

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
  const table = { positions, headings: pathHeadings({ address: 0, x: xs, y: ys }) };

  // The road's sides from P: its asphalt, metres.
  const metres = (g: number) => g * POSITION_METRES;
  const asphalt = (g: number) => (width.at(g) + ROAD_HALF) * UNIT_METRES;
  const gates = course.map(({ start, run }) => start + run.gate);
  // The Sections' seams: each stage's end, where the next begins; a leg's at its join's seam.
  const seams = course.slice(0, -1).map(({ start, length, joined }) => start + (joined ? JOIN.seam : length));

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
  const plan = headingPlan(table, VECTOR_RESOLUTION, POSITION_METRES, least);
  const path: TurnSegment[] = [];
  for (const s of [{ from: 0, to: go, turn: 0 }, ...plan.elements]) {
    const before = path.at(-1);
    if (before && before.turn === 0 && s.turn === 0) path[path.length - 1] = { ...before, to: s.to };
    else path.push(s);
  }
  const line = new CoursePath(
    path.map((s) => ({ start: metres(s.from), length: metres(s.to - s.from), turn: s.turn })),
    0,
  );
  // The Sections: one a stage, each cut again where its road comes near itself.
  const need = (g: number, side: 'left' | 'right') => leastLaneRadius(laneReach(g, side));
  const spans: { id: string; from: number; to: number; stage: number }[] = [];
  course.forEach((_, n) => {
    const from = n === 0 ? 0 : seams[n - 1]!;
    const to = n === last ? total : seams[n]!;
    const cuts = domainCuts(line, width, from, to, need, [go, ...gates]);
    [from, ...cuts].forEach((a, i) =>
      spans.push({ id: i === 0 ? inputs.slug(n) : `${inputs.slug(n)}-${i + 1}`, from: a, to: cuts[i] ?? to, stage: n }),
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

  // The profile: each stage's tables run at the speed and closed level over its stretch; the crossings kept apart.
  const changes: Change[] = course.flatMap(({ stage, run, start, length }) => {
    const origin = station(start);
    const stationOf = (p: number) => station(start + p) - origin;
    const tableRunsOf = tableRuns(
      stage.widthsHeights.filter((p) => p.kind === 0 && p.position < run.end),
      inputs.tables,
      () => inputs.kmh,
    );
    const size = stationOf(length);
    const own = closedGrades(stageGrades(tableRunsOf, LOOK, stationOf, stationOf(run.end), size), size);
    return own.map((c) => ({ ...c, from: c.from + origin, to: c.to + origin }));
  });
  const end = station(total);
  const pairs = overlappingCells(line, {
    from: 0,
    to: metres(total),
    step: POSITION_METRES,
    sides: (u) => [asphalt(u / POSITION_METRES), asphalt(u / POSITION_METRES)],
    apart: PASSAGES_APART,
  }).map(([a, b]) => [station(a / POSITION_METRES), station(b / POSITION_METRES)] as [number, number]);
  const crossings = crossingsOf(pairs, PASSAGE_GAP * POSITION_METRES);
  // Each row of humps one across the whole road.
  const mounds = moundKinks(
    inputs.humps.map((j) => station(course[j.stage]!.start + j.position)),
    inputs.hump,
  );
  const separated = separatedCrossings(changes, crossings, end, mounds.kinks);
  const profile = profileOf(
    separated.changes.filter((c) => c.from >= 0 && c.to <= end).map(bendOf),
    cuts.map(station),
    mounds.kinks,
  );

  return {
    go,
    total,
    course,
    path,
    line,
    plan: {
      ...plan,
      fidelity: planFidelity(table, plan.elements, plan.start, POSITION_METRES, VECTOR_RESOLUTION, plan.widened),
    },
    width,
    original,
    offset,
    laneBreaks,
    openings,
    pieces,
    station,
    /** P's pose at course position `g`. */
    pose: (g: number) => line.pose(metres(g)),
    profile,
    mounds: { runs: mounds.runs, joined: mounds.joined, longest: mounds.longest },
    crossings: crossings.map((crossing, k) => {
      const moves = separated.separations.filter((m) => m.crossing === k);
      return {
        passages: crossing.passages,
        levels: moves[0]?.levels ?? null,
        moves: moves.length,
        heights: crossing.passages.map((p) => profile.height((p.from + p.to) / 2)),
      };
    }),
  };
}

/**
 * Cuts of the course's positions `[from, to]` where its road comes near itself (`passagePairs`, its lanes' `need` at
 * position g either side). While a pair remains, the earliest later passage with the latest earlier one, it is cut
 * between them where the road is one (its width at most 250), at the middle of the longest straight of P there, else of
 * the longest stretch, keeping clear of the gates (positions).
 */
function domainCuts(
  line: CoursePath,
  width: Quadratic,
  from: number,
  to: number,
  need: (g: number, side: 'left' | 'right') => number,
  gates: readonly number[],
): number[] {
  const step = POSITION_METRES;
  const pairs = passagePairs(line, from * step, to * step, (u, side) => need(u / step, side), step).map(
    ([a, b]) => [a / step, b / step] as const,
  );
  if (!pairs.length) return [];
  const later = Math.min(...pairs.map(([, b]) => b));
  const earlier = Math.max(...pairs.filter(([, b]) => b === later).map(([a]) => a)) + 1;
  const clear = (g: number) => gates.every((gate) => Math.abs(gate - g) > GATE_ROOM);
  // The stretches between them where the road is one, and of them the straights of P.
  const one = width
    .map((w) => w, [ROAD_HALF])
    .pieces.filter((q) => q.to > earlier && q.from < later && width.at((q.from + q.to) / 2) <= ROAD_HALF)
    .map((q) => ({ a: Math.max(q.from, earlier), b: Math.min(q.to, later) }))
    // Pieces that touch, one stretch.
    .reduce<{ a: number; b: number }[]>((all, s) => {
      const last = all.at(-1);
      if (last && last.b === s.a) last.b = s.b;
      else all.push({ ...s });
      return all;
    }, []);
  const straights = line.elements
    .filter((e) => e.turn === 0)
    .flatMap((e) =>
      one.map((o) => ({
        a: Math.max(o.a, e.start / step),
        b: Math.min(o.b, (e.start + e.length) / step),
      })),
    );
  const middle = (stretches: readonly { a: number; b: number }[]) =>
    stretches
      .filter((s) => s.b - s.a > 2 * GATE_ROOM && clear((s.a + s.b) / 2))
      .sort((x, y) => y.b - y.a - (x.b - x.a))
      .map((s) => (s.a + s.b) / 2)[0];
  const cut = middle(straights) ?? middle(one);
  requireInput(cut !== undefined, '/plan', `No cut where the road is one parts its passages at position ${earlier}`);
  return [...domainCuts(line, width, from, cut, need, gates), cut, ...domainCuts(line, width, cut, to, need, gates)];
}
