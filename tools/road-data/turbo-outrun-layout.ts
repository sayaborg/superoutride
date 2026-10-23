/**
 * TURBO OUTRUN's course laid out ([TURBO OUTRUN road data](../../docs/turbo-outrun-road-data.md#turbo-outruns-course)): its 16
 * stages one after another from the entry, each to where the original ends it, a leg's last joined to the next leg's
 * start; P, the plan, from the stages' road paths as one heading table; the road width from their width points, and
 * lane b's centre from it; the Sections, cut where their coordinate domains would pass over themselves; the profile
 * with the crossings' bumps.
 */
import { requireInput } from '../course/authoring-io.js';
import { MAXIMUM_VEHICLE_REACH } from '../../src/course/course-coordinate-domain.js';
import { POSITION_METRES, Quadratic, type TurnSegment } from './offset-plan.js';
import { departure, headingPlan, pathHeadings, VECTOR_RESOLUTION } from './heading-plan.js';
import { domainOverlap, writtenPlan } from './section-writing.js';
import { CoursePath } from './course-path.js';
import { tableRuns } from './hills.js';
import { bendOf, closedGrades, LOOK, profileOf, separatedCrossings, stageGrades, type Change } from './road-profile.js';
import { crossingsOf, overlappingCells } from './crossings.js';
import { UNIT_METRES } from './pixel-grid.js';
import { centreLaneAt, LANE_RULE_WIDTHS, ROAD_HALF } from './turbo-outrun-cross-section.js';
import { STAGE_COUNT, type TurboOutrunStage } from './turbo-outrun-road.js';
import { roadWidths, WIDTH_RATE, type HeightTable, type WidthHeightPoint } from './road-tables.js';
import type { StageRun } from './turbo-outrun-scenery.js';

/**
 * A leg's last stage joins the next leg's start, which the original reaches through another screen: from 1460, where its
 * road is one of three lanes, its width widens to the next start's at the width points' fastest rate (speed 80); its
 * Section ends at 1458, where that corner's rounding begins.
 */
export const JOIN = Object.freeze({ from: 1460, speed: 80, seam: 1458 });
/** The course ends 260 positions past the finish, a straight on from LOS ANGELES's road. */
const GOAL_POSITIONS = 260;
/** SAND reaches this far beyond the outermost asphalt, metres. */
export const SAND = 40;
/**
 * The ground between the roads is SAND where it is wider than this, metres; narrower, as it opens, the asphalt's, so the
 * material changes metres away from where the lanes' rule does.
 */
export const OPEN = 0.5;
/** On a curve's inside, the sand and the vehicles' reach beyond it end at least this far from its centre, metres. */
const INNER_ROOM = 10;
/** Sand narrowed on a curve's inside returns to its width at one metre across for this many along. */
const SAND_RAMP = 6;
/** Two passages at least this far apart along the road may cross, metres; a passage runs on over gaps of 3 positions. */
const PASSAGES_APART = 200;
const PASSAGE_GAP = 3;
/** Within a Section its coordinate domain is checked at least this far apart along the road and this close, metres. */
const DOMAIN_APART = 10;
const DOMAIN_MARGIN = 0.5;
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
}

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
  // The width as its points give it, straight between its knots, level beyond them.
  const width = new Quadratic(
    [[0, knots[0]![1]] as const, ...knots, [total, knots.at(-1)![1]] as const]
      .filter(([p], i, all) => i === 0 || p > all[i - 1]![0])
      .slice(1)
      .map(([p, v], i, all) => {
        const [p0, v0] = i === 0 ? [0, knots[0]![1]] : all[i - 1]!;
        return { from: p0, to: p, a: v0, b: (v - v0) / (p - p0), c: 0 };
      }),
  );
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
  // The widest the asphalt is over positions [a, b], metres.
  const widest = (a: number, b: number) =>
    Math.max(
      ...Array.from({ length: Math.ceil(b - a) + 1 }, (_, k) => asphalt(Math.min(b, a + k))),
      ...width.breaks.filter((g) => g > a && g < b).map(asphalt),
    );
  const gates = course.map(({ start, run }) => start + run.gate);
  // The Sections' seams: each stage's end, where the next begins; a leg's at its join's seam.
  const seams = course.slice(0, -1).map(({ start, length, joined }) => start + (joined ? JOIN.seam : length));

  /** P laid from plan elements `planned` (the entry's straight, then the plan), and its sand. */
  const lay = (planned: readonly TurnSegment[]) => {
    const path: TurnSegment[] = [];
    for (const s of [{ from: 0, to: go, turn: 0 }, ...planned]) {
      const before = path.at(-1);
      if (before && before.turn === 0 && s.turn === 0) path[path.length - 1] = { ...before, to: s.to };
      else path.push(s);
    }
    const line = new CoursePath(
      path.map((s) => ({ start: metres(s.from), length: metres(s.to - s.from), turn: s.turn })),
      0,
    );
    return { path, line, sand: narrowedSand(path, width) };
  };
  /**
   * The Sections of P `line` with its sand: one a stage, each cut again where its domain passes over itself; and the
   * domain, its edges changing slope where the width does and at the sand's knots.
   */
  const sections = (line: CoursePath, sand: ReturnType<typeof narrowedSand>) => {
    const sides = (g: number) =>
      [0, 1].map((side) => asphalt(g) + sand.at(g, side as 0 | 1) + MAXIMUM_VEHICLE_REACH) as [number, number];
    const spans: { id: string; from: number; to: number; stage: number }[] = [];
    course.forEach((_, n) => {
      const from = n === 0 ? 0 : seams[n - 1]!;
      const to = n === last ? total : seams[n]!;
      const cuts = domainCuts(line, width, from, to, sides, [go, ...gates]);
      [from, ...cuts].forEach((a, i) =>
        spans.push({
          id: i === 0 ? inputs.slug(n) : `${inputs.slug(n)}-${i + 1}`,
          from: a,
          to: cuts[i] ?? to,
          stage: n,
        }),
      );
    });
    const stations = [...width.breaks, ...sand.knots.flatMap((k) => k.map(([g]) => g))].map(metres);
    return { spans, domain: { stations, sides: (u: number) => sides(u / POSITION_METRES) } };
  };
  // The plan: its elements' radii over the least that leaves the sand on a curve's inside room to its centre, its turns
  // widened where a Section's domain, as written, passes over itself.
  const plan = headingPlan(
    table,
    VECTOR_RESOLUTION,
    POSITION_METRES,
    (a, b) => INNER_ROOM + MAXIMUM_VEHICLE_REACH + widest(a, b),
    (planned) => {
      const { line, sand } = lay(planned);
      if (sand.tight.length) return sand.tight.map((t) => [t.from, t.to] as [number, number]);
      const { spans, domain } = sections(line, sand);
      return spans.flatMap((span) => {
        const overlap = domainOverlap(line, { id: span.id, from: metres(span.from), to: metres(span.to) }, domain);
        return overlap ? [overlap.map((u) => u / POSITION_METRES) as [number, number]] : [];
      });
    },
  );
  const { path, line, sand } = lay(plan.elements);
  requireInput(
    !sand.tight.length,
    `/plan/${sand.tight[0]?.from}`,
    `The curve at ${sand.tight[0]?.from} is too tight for its road`,
  );
  const { spans } = sections(line, sand);

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
  const separated = separatedCrossings(changes, crossings, end);
  const profile = profileOf(separated.changes.filter((c) => c.from >= 0 && c.to <= end).map(bendOf), cuts.map(station));

  return {
    go,
    total,
    course,
    path,
    line,
    plan: { ...plan, departure: departure(table, plan.elements, plan.start, POSITION_METRES) },
    width,
    offset,
    laneBreaks,
    openings,
    sand,
    pieces,
    station,
    /** P's pose at course position `g`. */
    pose: (g: number) => line.pose(metres(g)),
    profile,
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
 * The sand beyond each side's asphalt (0 left, 1 right), metres, by course position: `SAND`, but on a curve's inside
 * narrowed to leave `INNER_ROOM` and the vehicles' reach to the curve's centre (its least over the curve), curves
 * narrowed one after another, or whose ramps would meet, as one stretch at the least of theirs, returning to `SAND` at
 * `SAND_RAMP` beyond it. Its knots, by side; between two knots it is straight. A curve too tight to leave that room is
 * `tight`.
 */
function narrowedSand(path: readonly TurnSegment[], width: Quadratic) {
  const knots: [[number, number][], [number, number][]] = [[], []];
  const narrowed: { from: number; to: number; side: 0 | 1; sand: number }[] = [];
  const tight: { from: number; to: number }[] = [];
  for (const s of path) {
    if (s.turn === 0) continue;
    const radius = ((s.to - s.from) * POSITION_METRES) / Math.abs(s.turn);
    const samples = Array.from({ length: Math.ceil(s.to - s.from) + 1 }, (_, k) => Math.min(s.to, s.from + k));
    const widest = Math.max(
      ...samples.map((g) => width.at(g)),
      ...width.breaks.filter((g) => g > s.from && g < s.to).map((g) => width.at(g)),
    );
    const room = radius - INNER_ROOM - MAXIMUM_VEHICLE_REACH - (widest + ROAD_HALF) * UNIT_METRES;
    if (room <= 0) tight.push({ from: s.from, to: s.to });
    else if (room < SAND) narrowed.push({ from: s.from, to: s.to, side: s.turn > 0 ? 0 : 1, sand: room });
  }
  // Curves narrowed one after another, or whose ramps would meet, narrowed as one at the least of their sand.
  const along = POSITION_METRES / SAND_RAMP;
  const ramp = (n: { sand: number }) => (SAND - n.sand) / along;
  let stretches = narrowed;
  for (let merged = true; merged;) {
    merged = false;
    const out: typeof narrowed = [];
    for (const n of stretches) {
      const k = out.map((m) => m.side).lastIndexOf(n.side);
      const before = out[k];
      if (before && n.from - ramp(n) <= before.to + ramp(before)) {
        out[k] = { ...before, to: n.to, sand: Math.min(before.sand, n.sand) };
        merged = true;
      } else out.push({ ...n });
    }
    stretches = out;
  }
  // Each stretch at its sand, rising at the ramp away from it.
  for (const n of stretches)
    knots[n.side].push([n.from - ramp(n), SAND], [n.from, n.sand], [n.to, n.sand], [n.to + ramp(n), SAND]);
  for (const side of [0, 1] as const) knots[side].sort((a, b) => a[0] - b[0]);
  return {
    narrowed: stretches,
    tight,
    knots,
    /** The sand at `g` as written: straight between its knots, below the narrowing's least, `SAND` beyond them. */
    at: (g: number, side: 0 | 1) => (knots[side].length ? Math.min(SAND, linearAt(knots[side], g)) : SAND),
  };
}

/**
 * Cuts of the course's positions `[from, to]` so that no Section's coordinate domain, `reach(g)` metres either side of P,
 * passes over itself: while two of its cells at least `DOMAIN_APART` apart overlap, the earliest later one with the
 * latest earlier one, it is cut between them where the road is one (its width at most 250), at the middle of the
 * longest straight of P there, else of the longest stretch, keeping clear of the gates (positions).
 */
function domainCuts(
  line: CoursePath,
  width: Quadratic,
  from: number,
  to: number,
  reach: (g: number) => [number, number],
  gates: readonly number[],
): number[] {
  const step = POSITION_METRES;
  const pairs = overlappingCells(line, {
    from: from * step,
    to: to * step,
    step,
    sides: (u) => reach(u / step),
    apart: DOMAIN_APART,
    margin: DOMAIN_MARGIN,
  }).map(([a, b]) => [a / step, b / step] as const);
  if (!pairs.length) return [];
  const later = Math.min(...pairs.map(([, b]) => b));
  const earlier = Math.max(...pairs.filter(([, b]) => b === later).map(([a]) => a)) + 1;
  const clear = (g: number) => gates.every((gate) => Math.abs(gate - g) > GATE_ROOM);
  // The stretches between them where the road is one, and of them the straights of P.
  const one = width
    .map((w) => w, [ROAD_HALF])
    .pieces.filter((q) => q.to > earlier && q.from < later && width.at((q.from + q.to) / 2) <= ROAD_HALF)
    .map((q) => ({ a: Math.max(q.from, earlier), b: Math.min(q.to, later) }));
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
  return [...domainCuts(line, width, from, cut, reach, gates), cut, ...domainCuts(line, width, cut, to, reach, gates)];
}
