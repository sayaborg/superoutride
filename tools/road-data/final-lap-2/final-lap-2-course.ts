/**
 * FINAL LAP 2's courses from its ROMs ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-courses)):
 * its conversion, each course's lap from its curve table laid out by the shared `circuit-layout`.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { crestTrials } from '../shared/crest-trials.js';
import { curvePlan, type CurveInterval } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';
import { layCourse } from '../shared/circuit-layout.js';
import type { Band } from '../shared/road-surface.js';
import { skyYawOrigin } from '../shared/sky-baking.js';
import { monotoneCubic } from '../shared/monotone-cubic.js';
import { profileOf, withinRise, type Bend, type Profile } from '../shared/road-profile.js';
import { screenPieces, steepestGrade, type Piece } from '../shared/screen-pieces.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { finalLap2Inputs, readProjection } from './final-lap-2-screen-frames.js';
import { assembleFinalLap2, type FinalLap2 } from './final-lap-2-rom.js';
import {
  INTERVAL_UNITS,
  INTERVALS,
  ROW_UNITS,
  STEP_UNITS,
  LAP_UNITS,
  intervalMetres,
  readCurveTables,
  readGrid,
  readLaps,
  readLine,
  readNames,
  readRoadPalette,
  readRoadStep,
  readRoadTiles,
  readSlopeTables,
} from './final-lap-2-road.js';
import { crossSection, leftEdges, pictureRows, roadPixelMetres } from './final-lap-2-cross-section.js';
import { finalLap2Surface } from './final-lap-2-surface.js';
import {
  hitHalfWidth,
  lateralMetres,
  readScenery,
  underpassOpening,
  underpassReach,
  UNDERPASS_CLASS,
} from './final-lap-2-scenery.js';
import { finalLap2Boards, underpassBoards } from './final-lap-2-boards.js';
import { limitsReader, type StepLimits } from './final-lap-2-limits.js';
import { straightThrough } from '../shared/piecewise-linear.js';
import { passageSteps } from '../shared/passage-steps.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { PIXEL_ASPECT } from '../namco-system-2/display.js';
import { paletteName } from '../shared/pixel-grid.js';
import { CAR_COLUMNS, CAR_WIDTH, COURSE_IDS, MODELS, USA } from './final-lap-2-constants.js';
import { BACK_WIDTH, finalLap2Sky, groundColor } from './final-lap-2-backgrounds.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const FINAL_LAP_2_CONVERSION_VERSION = 16;

/**
 * A lap's intervals from the line, `line` units into its table ([Places and
 * patterns](../../../docs/original-road-data.md#places-and-patterns)): the line's interval from the line on, the rest in
 * turn, then the line's interval up to the line.
 */
function fromLine(intervals: readonly CurveInterval[], line: number): CurveInterval[] {
  const [i, share] = [Math.floor(line / INTERVAL_UNITS), (line % INTERVAL_UNITS) / INTERVAL_UNITS];
  const n = intervals.length;
  const at = intervals[i]!;
  return [
    { value: at.value, length: at.length * (1 - share) },
    ...Array.from({ length: n - 1 }, (_, k) => intervals[(i + 1 + k) % n]!),
    ...(share > 0 ? [{ value: at.value, length: at.length * share }] : []),
  ];
}

/** What course `c`'s lap on its model is solved from: its curve table, its model, its road's width and least radius. */
function lapInputs(tables: readonly (readonly number[])[], c: number, width: number): LapInputs {
  return {
    values: tables[c]!,
    model: courseModel(MODELS.get(c)!),
    roadWidth: width,
    leastLaneRadius: laneRadius(width / 2),
  };
}

/** The road across of course `c`: its picture's first row. */
function courseAcross(p: FinalLap2, c: number, tiles: Uint8Array, palette: readonly number[], metres: number) {
  return crossSection(p, readRoadStep(p, c, 0)[0]!, tiles, palette, metres);
}

/** The courses with a model, each its id and what its lap on its model is solved from, for the solving command. */
export function finalLap2ModelLaps(set: RomSet): { course: string; inputs: LapInputs }[] {
  const p = assembleFinalLap2(set);
  const [tables, tiles, palette, metres] = [
    readCurveTables(p),
    readRoadTiles(p),
    readRoadPalette(p),
    roadPixelMetres(p),
  ];
  return [...MODELS.keys()].map((c) => ({
    course: COURSE_IDS[c]!,
    inputs: lapInputs(tables, c, courseAcross(p, c, tiles, palette, metres).width),
  }));
}

/**
 * Course `c`'s lap, its intervals in its table's order: USA's its own table's, its intervals the clock's, turned once
 * round; a course with a model, its lap on its model as solved (`model-laps.json`), which must meet the rule. With its
 * report's figures.
 */
function courseLap(tables: readonly (readonly number[])[], c: number, interval: number, width: number, name: string) {
  if (c === USA) {
    const values = tables[c]!;
    const turning = values.reduce((sum, v) => sum + v, 0) * interval;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const intervals = values.map((value) => ({ value, length: interval }));
    return { intervals, scale, length: INTERVALS * interval, report: {} };
  }
  return courseOnModel(COURSE_IDS[c]!, name, lapInputs(tables, c, width));
}

/**
 * The road across under its surface: its bands of one material joined, each in its widest band's colors.
 */
function byMaterial(bands: readonly Band[]): Band[] {
  const out: { band: Band; widest: Band }[] = [];
  for (const band of bands) {
    const last = out.at(-1);
    if (last && last.band.material === band.material) {
      last.band = { ...last.band, right: band.right };
      if (band.right - band.left > last.widest.right - last.widest.left) last.widest = band;
    } else out.push({ band, widest: band });
  }
  return out.map(({ band, widest }) => ({ ...band, colors: widest.colors }));
}

/**
 * Where a table position lies on a lap as laid, metres from its line `line` units into its table, its intervals
 * `intervals` in the table's order ([Places and patterns](../../../docs/original-road-data.md#places-and-patterns)):
 * its interval's start there and its share of the interval's length.
 */
function lapStations(intervals: readonly CurveInterval[], line: number) {
  const starts = [0];
  for (const { length } of intervals) starts.push(starts.at(-1)! + length);
  const length = starts.at(-1)!;
  const fromStart = (u: number) => {
    const i = Math.floor(u / INTERVAL_UNITS);
    return starts[i]! + ((u % INTERVAL_UNITS) / INTERVAL_UNITS) * intervals[i]!.length;
  };
  const atLine = fromStart(line);
  return (u: number) => (((fromStart(u) - atLine) % length) + length) % length;
}

/**
 * A course's road heights from its lap's piece ([Its heights](../../../docs/final-lap-2-road-data.md#its-heights)): the
 * piece's grades at their curve table positions on the lap as laid, a unit's grade the piece's as far into its lap,
 * laid at that unit's station, times one factor a lap, its length by the clock over its length as laid (K, 2026-11-06),
 * so that the grade does not step where intervals laid at different lengths meet; less its mean over its lap, so that
 * the lap closes in height. `metres` a unit's by the clock, `station` a unit's on the lap as laid, `length` the lap's;
 * from the line, `line` units into its table, round the lap. With the factor.
 */
export function lapHeights(piece: Piece, metres: number, station: (u: number) => number, length: number, line: number) {
  const stretch = LAP_UNITS * metres;
  const factor = stretch / length;
  // The piece's height at its lap's end, its grade's mean over its lap times the lap.
  const rise = piece.changes.reduce((h, c) => h + c.change * (stretch - (c.from + c.to) / 2), piece.grade * stretch);
  const grade = (u: number) => {
    const x = (u % LAP_UNITS) * metres;
    return (
      factor *
      piece.changes.reduce(
        (g, c) => g + c.change * Math.min(1, Math.max(0, (x - c.from) / (c.to - c.from))),
        piece.grade - rise / stretch,
      )
    );
  };
  // Each interval from the line round the lap, cut at the line: its stations and its laid grades at its ends.
  const parts: { s0: number; s1: number; g0: number; g1: number }[] = [];
  for (let a = line; a < line + LAP_UNITS;) {
    const b = Math.min(line + LAP_UNITS, (Math.floor(a / INTERVAL_UNITS) + 1) * INTERVAL_UNITS);
    const s0 = a === line ? 0 : station(a % LAP_UNITS);
    const s1 = b === line + LAP_UNITS ? length : station(b % LAP_UNITS);
    parts.push({ s0, s1, g0: grade(a), g1: grade(b) });
    a = b;
  }
  const bends: Bend[] = parts
    .filter((p) => p.g1 !== p.g0)
    .map((p) => ({ from: p.s0, to: p.s1, curvature: (p.g1 - p.g0) / (p.s1 - p.s0) }));
  // The lap closed in height to the last digit: what the sums leave taken from its grade over its whole length.
  const left = profileOf(bends, [], [{ at: 0, change: parts[0]!.g0 }]).height(length);
  const first = parts[0]!.g0 - left / length;
  return { bends, kinks: first === 0 ? [] : [{ at: 0, change: first }], factor };
}

/** How far a body may lie past a limit and still only touch it, metres: a micrometre, as a course writes a lateral. */
const TOUCH = 1e-6;

/** A board as the course places it: its station, lateral, image and body. */
type Placed = Parameters<typeof layCourse>[0]['objects'][number];

/**
 * A course's limits as the report gives them: each side's values, metres from P, with the metres and steps of the lap
 * at each (each step at its length on the lap as laid) and how often it changes; and of the bodies, by their images,
 * those the player's car reaches within its limits `limits` (a body more than a micrometre inside them) and did not
 * within the picture's edges `edge`, those it reached and no longer does, and how many just touch a limit.
 */
function limitsReport(
  steps: readonly StepLimits[],
  limits: {
    readonly left: readonly (readonly [number, number])[];
    readonly right: readonly (readonly [number, number])[];
  },
  lateral: number,
  station: (u: number) => number,
  length: number,
  objects: readonly Placed[],
  edge: number,
) {
  const side = (value: (l: StepLimits) => number) => {
    const at = new Map<number, { metres: number; steps: number }>();
    let changes = 0;
    steps.forEach((l, k) => {
      const next = (k + 1) % steps.length;
      const metres = (((station(next * STEP_UNITS) - station(k * STEP_UNITS)) % length) + length) % length;
      const v = round3(value(l) * lateral);
      const was = at.get(v) ?? { metres: 0, steps: 0 };
      at.set(v, { metres: was.metres + metres, steps: was.steps + 1 });
      if (value(steps[next]!) !== value(l)) changes++;
    });
    const values = [...at].sort(([a], [b]) => a - b);
    return {
      values: values.map(([v, { metres, steps: n }]) => ({ at: v, metres: round1(metres), steps: n })),
      changes,
    };
  };
  const [left, right] = [straightThrough(limits.left), straightThrough(limits.right)];
  // How far a body reaches past the nearer of two limits inside them, metres: positive within, about 0 touching.
  const inside = (o: Placed, l: number, r: number) =>
    Math.max(
      ...(o.body === null ? [] : typeof o.body === 'number' ? [{ across: 0, width: o.body }] : o.body).map((part) => {
        const [a, b] = [o.lateral + part.across - part.width / 2, o.lateral + part.across + part.width / 2];
        return Math.min(b, r) - Math.max(a, l);
      }),
    );
  const reached = { now: [] as string[], before: [] as string[], both: 0, touch: 0 };
  for (const o of objects) {
    if (o.body === null) continue;
    const [now, before] = [inside(o, left.at(o.s), right.at(o.s)), inside(o, -edge, edge)];
    if (Math.abs(now) <= TOUCH || Math.abs(before) <= TOUCH) reached.touch++;
    else if (now > 0 && before > 0) reached.both++;
    else if (now > 0) reached.now.push(o.image);
    else if (before > 0) reached.before.push(o.image);
  }
  const count = (names: readonly string[]) =>
    Object.fromEntries([...new Set(names)].map((n) => [n, names.filter((m) => m === n).length]));
  return {
    left: side((l) => l.left),
    right: side((l) => l.right),
    bodies: {
      reached: reached.now.length,
      reachedImages: count(reached.now),
      noLonger: reached.before.length,
      noLongerImages: count(reached.before),
      still: reached.both,
      touching: reached.touch,
    },
  };
}

/** A lap's heights as the report gives them: its steepest grade, %, and its highest and lowest, metres from the line's. */
function heightsReport(profile: Profile, length: number) {
  const heights = Array.from({ length: Math.ceil(length) + 1 }, (_, k) => profile.height(Math.min(k, length)));
  return {
    steepest: round1(100 * steepestGrade(profile)),
    highest: round1(Math.max(...heights)),
    lowest: round1(Math.min(...heights)),
    closes: round3(profile.height(length)),
  };
}

/**
 * Where course `c`'s road's left edge line lies along its lap, as `layCourse` takes it: its tile rows' (`leftEdges`),
 * joined as [a lateral changed straight between points](../../../docs/original-road-data.md#a-lateral-changed-straight-between-points)
 * and written at each step of its picture (`STEP_UNITS`), where the rows' points lie, at their stations, straight
 * between, from the line to the line again, the knots that lie straight between others dropped; none where it stays.
 */
function edgesAlong(edges: Float64Array, station: (u: number) => number, length: number, right: number) {
  if (edges.every((x) => x === edges[0])) return undefined;
  const joined = monotoneCubic(Array.from(edges, (x, k) => [k * ROW_UNITS, x] as const));
  return { left: lapLine((k) => joined(k * STEP_UNITS), station, length), right };
}

/**
 * A value at each step of the lap (`value(k)`, step k's start) as a line along it: each at its step's start station,
 * straight between, from the line to the line again (its value there straight between the steps either side of it
 * round the lap), the knots that lie straight between others dropped.
 */
function lapLine(value: (k: number) => number, station: (u: number) => number, length: number) {
  const points = Array.from(
    { length: LAP_UNITS / STEP_UNITS },
    (_, k) => [station(k * STEP_UNITS), value(k)] as [number, number],
  ).sort((a, b) => a[0] - b[0]);
  const [first, last] = [points[0]!, points.at(-1)!];
  const share = (length - last[0]) / (length - last[0] + first[0]);
  const atLine = last[1] + (first[1] - last[1]) * share;
  return straightest([[0, atLine], ...points.filter(([s]) => s > 0), [length, atLine]]);
}

/** How far from a straight line a dropped point may lie, metres: a micrometre, as a course writes a lateral. */
const STRAIGHT = 1e-6;

/** Points `points` without those that lie straight between the points kept either side of them, within `STRAIGHT`. */
function straightest(points: readonly [number, number][]): [number, number][] {
  const kept = [points[0]!];
  let from = 0;
  for (let j = 2; j < points.length; j++) {
    const [a, b] = [points[from]!, points[j]!];
    const straight = points
      .slice(from + 1, j)
      .every(([s, v]) => Math.abs(v - (a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]))) <= STRAIGHT);
    if (!straight) {
      from = j - 1;
      kept.push(points[from]!);
    }
  }
  kept.push(points.at(-1)!);
  return kept;
}

/** FINAL LAP 2's courses, from the ROM set: each one's document, crest trials and report. */
export function finalLap2Courses(set: RomSet) {
  const p = assembleFinalLap2(set);
  const names = readNames(p);
  const tables = readCurveTables(p);
  const laps = readLaps(p);
  const line = readLine(p);
  const slot = readGrid(p);
  const { unit, interval } = intervalMetres(p);
  const tiles = readRoadTiles(p);
  const palette = readRoadPalette(p);
  const metres = roadPixelMetres(p);
  const outputs = new OriginalOutputs();
  // The heights: each lap's piece of the grades' rule, solved from these ROMs' screen alone.
  const projection = readProjection(p);
  const slopes = readSlopeTables(p);
  const pieces = screenPieces('final-lap-2');
  const lapPiece = (c: number) => {
    const piece = pieces.piece(names[c]!);
    const file = '/tools/road-data/shared/screen-pieces.json';
    requireInput(piece, file, `FINAL LAP 2's ${names[c]} has no piece`);
    requireInput(
      piece.inputs === finalLap2Inputs(projection, slopes[c]!, unit),
      file,
      `FINAL LAP 2's ${names[c]} was solved from other inputs than these ROMs': solve it again (screen-pieces)`,
    );
    return piece;
  };
  // The objects: their places, pictures and bodies, a lateral and a sprite's pixel in metres (its own car's). A kind
  // whose picture shows nothing has no body either (at most its colored columns) and is not placed.
  const read = COURSE_IDS.map((_, c) => readScenery(p, c));
  // JAPAN's underpass (class 5), its walls solid beyond its opening either side.
  const underpasses = COURSE_IDS.map((_, c) => readScenery(p, c, UNDERPASS_CLASS));
  const lateral = lateralMetres(p, metres);
  const allBoards = finalLap2Boards(
    p,
    read.flatMap((objects) => objects.map((o) => o.kind)),
    CAR_WIDTH / CAR_COLUMNS,
  );
  const boards = allBoards.filter((b) => b.colored > 0);
  for (const { image } of boards) outputs.file(image.path, image.bytes);
  const boardOf = new Map(boards.map((b) => [b.kind, b] as const));
  // The underpass's picture, its bank under its sprites, and its band's boards, by its course's colors.
  const underpassCourses = underpasses.flatMap((u, c) => (u.length ? [c] : []));
  if (underpassCourses.length > 1) throw contractUnmet('More than one course has an underpass, its pictures one');
  const underpassBoard =
    underpassCourses.length > 0 ? underpassBoards(p, underpassCourses[0]!, CAR_WIDTH / CAR_COLUMNS) : undefined;
  if (underpassBoard)
    for (const { image } of [underpassBoard, ...underpassBoard.bands]) outputs.file(image.path, image.bytes);
  const reachUnits = underpassReach(p);
  const carLimits = limitsReader(p);
  const opening = underpassOpening(p) * lateral;
  // The walls' parts: from the opening's edge out to the picture's colored columns, either side.
  const walls = underpassBoard
    ? [
        { across: (underpassBoard.reach[0] - opening) / 2, width: -opening - underpassBoard.reach[0] },
        { across: (opening + underpassBoard.reach[1]) / 2, width: underpassBoard.reach[1] - opening },
      ].filter((part) => part.width > 0)
    : [];
  const scenery = read.map((objects) => objects.filter((o) => boardOf.has(o.kind)));
  const courses = COURSE_IDS.map((id, c) => {
    const across = courseAcross(p, c, tiles, palette, metres);
    const lap = courseLap(tables, c, interval, across.width, names[c]!);
    const { scale, length, report } = lap;
    const intervals = fromLine(lap.intervals, line);
    const pieces = curvePlan(intervals, scale);
    const station = lapStations(lap.intervals, line);
    const laidHeights = lapHeights(lapPiece(c), unit, station, length, line);
    // A course with a model, within its circuit's elevation ([A course's
    // model](../../../docs/original-road-data.md#rules-of-the-originals)).
    const model = MODELS.has(c) ? courseModel(MODELS.get(c)!) : undefined;
    let within: ReturnType<typeof withinRise> = { road: laidHeights, factor: 1 };
    if (model) {
      requireInput(model.elevation, `${model.id}/elevation_m`, `${names[c]}'s model gives no elevation`);
      within = withinRise(laidHeights, length, model.elevation);
    }
    const road = within.road;
    const profile = profileOf(road.bends, [], road.kinks);
    const columns = leftEdges(p, c, tiles, palette, across);
    const left = columns.map((column) => (column - across.centre) * metres);
    const right = across.edges[1].middle;
    const edges = edgesAlong(left, station, length, right);
    // The narrowest road and where it lies, and where its middle lies farthest from P.
    const narrowest = left.reduce((k, x, j) => (x > left[k]! ? j : k), 0);
    const lane = across.width / 2;
    // Each underpass's passage: its picture and its bands again at equal steps over the stretch where its walls hit, on
    // the lap as laid, so fine that the eye sees nothing through them (`passageSteps`); each its walls.
    const passages = underpasses[c]!.map((o) => {
      const [from, to] = [-1, 1].map((side) => station(o.step * STEP_UNITS + side * reachUnits.walls));
      const steps = passageSteps(
        underpassBoard!.source,
        { x: underpassBoard!.layout.x, base: underpassBoard!.layout.y, half: opening / (CAR_WIDTH / CAR_COLUMNS) },
        (CAR_WIDTH / CAR_COLUMNS) * PIXEL_ASPECT,
        to! - from!,
      );
      return { o, from: from!, to: to!, steps };
    });
    // Its limits, the program's ([FINAL LAP 2's road
    // across](../../../docs/final-lap-2-road-data.md#final-lap-2s-road-across)): each step's at its start, straight
    // between.
    const stepLimits = Array.from({ length: LAP_UNITS / STEP_UNITS }, (_, k) => carLimits.at(c, k));
    const limits = {
      left: lapLine((k) => stepLimits[k]!.left * lateral, station, length),
      right: lapLine((k) => stepLimits[k]!.right * lateral, station, length),
    };
    const objects = [
      ...scenery[c]!.map((o) => {
        const board = boardOf.get(o.kind)!;
        const half = hitHalfWidth(p, o.kind);
        return {
          s: station(o.step * STEP_UNITS),
          lateral: o.x * lateral,
          image: board.name,
          palette: paletteName(0),
          body: half === null ? null : Math.min(2 * half * lateral, board.colored),
        };
      }),
      ...passages.flatMap(({ o, from, steps }) =>
        Array.from({ length: steps.boards }, (_, k) => {
          const at = from + steps.step * k;
          return [
            { image: underpassBoard!.name, body: walls.length ? walls : null },
            ...underpassBoard!.bands.map((b) => ({ image: b.name, body: null })),
          ].map((board) => ({ s: at, lateral: o.x * lateral, palette: paletteName(0), ...board }));
        }).flat(),
      ),
    ];
    const sky = `${id}-sky`;
    outputs.file(`images/${sky}.json`, JSON.stringify(finalLap2Sky(p, c, sky)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap: { pieces, length },
      crossSection: { ...across, bands: byMaterial(across.bands) },
      surface: finalLap2Surface({
        ...pictureRows(p, c, tiles, palette),
        edges: Array.from({ length: LAP_UNITS / STEP_UNITS }, (_, s) => columns[(s * STEP_UNITS) / ROW_UNITS]!),
        centre: across.centre,
        metres,
        line,
        station,
        length,
      }),
      laps,
      // The cars by the master's rule, behind the line by the table's metres, beside P.
      grid: { rule: (k) => ({ ahead: -slot(k).behind * unit, right: slot(k).x * lateral }) },
      sky,
      beyond: groundColor(p, c),
      road,
      interval,
      startLine: [],
      // The skies' pixel 0, the line's heading, at the camera's centre at the course's start.
      skyYawOrigin: skyYawOrigin(0, BACK_WIDTH),
      objects,
      limits,
      lane,
      leastLaneRadius: laneRadius(lane),
      ...(edges && { edges }),
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    const path = new CoursePath(pieces);
    const tightest = Math.min(...path.elements.filter((e) => e.turn !== 0).map((e) => e.length / Math.abs(e.turn)));
    return {
      course: `courses/${id}.course.json`,
      name: names[c],
      intervals: tables[c]!.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: laid.sections,
      valueCurvature: Number(scale.toPrecision(4)),
      tightestRadius: round1(tightest),
      lane: round3(lane),
      roadWidth: round3(across.width),
      pictureEdge: round3(across.edge),
      limits: limitsReport(stepLimits, limits, lateral, station, length, objects, across.edge),
      objects: scenery[c]!.length,
      underpasses: passages.map(({ o, from, to, steps }) => ({
        at: round3(station(o.step * STEP_UNITS)),
        lateral: round3(o.x * lateral),
        // Its passage: where its walls hit, its boards' step and count, and what sets the step (metres).
        passage: [round3(from), round3(to)],
        step: round3(steps.step),
        boards: steps.boards,
        g: round3(steps.g),
        t: round3(steps.t),
        D: round3(steps.D),
        most: round3(steps.d),
      })),
      gridFromLine: [laid.grid[0]!, laid.grid.at(-1)!].map((slot) => round3(length - slot.s)),
      heights: {
        ...heightsReport(profile, length),
        // The grades' factors: the lap's (its length by the clock over its length as laid) and its model's.
        factors: { lap: round3(laidHeights.factor), model: model ? round3(within.factor) : null },
      },
      unseen: read[c]!.length - scenery[c]!.length,
      ...(edges && {
        narrowest: {
          width: round3(right - left[narrowest]!),
          at: round1(station(narrowest * ROW_UNITS)),
          lane: round3((right - left[narrowest]!) / 2),
          middleFromP: round3((left[narrowest]! + right) / 2),
        },
      }),
      ...report,
    };
  });
  return {
    outputs,
    report: {
      names,
      unitMetres: Number(unit.toPrecision(6)),
      intervalMetres: round3(interval),
      laps,
      line,
      roadPixelMetres: Number(metres.toPrecision(5)),
      lateralMetres: Number(lateral.toPrecision(5)),
      // The underpass's picture and its walls' parts, metres.
      underpass: underpassBoard && {
        name: underpassBoard.name,
        width: round3(underpassBoard.width),
        colors: underpassBoard.distinct,
        replaced: round3(underpassBoard.replaced),
        reach: underpassBoard.reach.map(round3),
        opening: round3(opening),
        walls: walls.map((w) => ({ across: round3(w.across), width: round3(w.width) })),
        // Its bank's band and window, pixels high, and its band's boards.
        bank: underpassBoard.bank,
        bands: underpassBoard.bands.map((b) => ({ name: b.name, width: round3(b.width) })),
      },
      boards: boards.map((b) => ({
        name: b.name,
        colored: round3(b.colored),
        width: round3(b.width),
        colors: b.distinct,
        replaced: round3(b.replaced),
      })),
      courses,
    },
  };
}

export const FINAL_LAP_2_CONVERSION: Conversion = (set) => {
  const { outputs, report } = finalLap2Courses(set);
  return { outputs, report: { conversion: FINAL_LAP_2_CONVERSION_VERSION, ...report } };
};
