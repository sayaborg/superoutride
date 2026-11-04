/**
 * POLE POSITION II's courses from its ROMs ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-courses)):
 * its conversion, each course's lap from its curve table laid out by the shared `circuit-layout`.
 */
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { instruction } from '../cpu/program-words.js';
import { crestTrials } from '../shared/crest-trials.js';
import { curvePlan, curveRuns } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';
import { roadPalette } from '../pole-position-hardware/colors.js';
import { SCREEN_COLUMNS } from '../pole-position-hardware/display.js';
import { skyYawOrigin } from '../shared/sky-baking.js';
import { PANORAMA_COLUMNS, polePositionIISky } from './pole-position-ii-backgrounds.js';
import { assemblePolePositionII, type PolePositionII } from './pole-position-ii-rom.js';
import {
  BAND_UNITS,
  HIGH_UNITS,
  INTERVALS,
  intervalMetres,
  readCurveTables,
  readNames,
  readRoadPalettes,
  readStartLine,
} from './pole-position-ii-road.js';
import { crossSection, leastLaneRadius } from './pole-position-ii-cross-section.js';
import { layCourse } from '../shared/circuit-layout.js';
import {
  COURSE_IDS,
  LANE,
  LAPS,
  MODELS,
  ROAD_STEP_PIXELS,
  ROAD_WIDTH,
  SPEED_ENTRY,
  STEP_METRES,
  TEST,
  TEST_STRAIGHT,
} from './pole-position-ii-constants.js';
import { readBoardPictures, readProjection, readScenery, readSceneryReach } from './pole-position-ii-scenery.js';
import { boardName, polePositionIIBoards } from './pole-position-ii-boards.js';
import { paletteName } from '../shared/pixel-grid.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const POLE_POSITION_II_CONVERSION_VERSION = 6;

/**
 * TEST's values with its two long straights made `TEST_STRAIGHT` intervals each (K, 2026-11-04), the intervals added
 * or taken at their beginnings, so that the table's start keeps its place before T1; in the table's order from its
 * start.
 */
function testValues(values: readonly number[]): number[] {
  const n = values.length;
  const runs = curveRuns(values);
  const longest = runs
    .map((run, i) => ({ count: run.count, straight: run.sign === 0, i }))
    .filter((r) => r.straight)
    .sort((x, y) => y.count - x.count || x.i - y.i)
    .slice(0, 2)
    .map((r) => r.i);
  if (longest.length !== 2) throw romDiffers("TEST's table has no two straights");
  const out: number[] = [];
  let start = -1;
  runs.forEach((run, i) => {
    const made = longest.includes(i) ? TEST_STRAIGHT : run.count;
    // Intervals taken from, or added at, the run's beginning: the rest keep their places from its end.
    const shift = made - run.count;
    const first = out.length;
    for (let k = 0; k < made; k++) out.push(values[(run.from + Math.max(0, k - shift)) % n]!);
    const zero = (n - run.from) % n;
    if (zero < run.count && zero + shift >= 0) start = first + zero + shift;
  });
  if (start < 0) throw romDiffers("TEST's table start lies in no straight kept");
  return [...out.slice(start), ...out.slice(0, start)];
}

/**
 * Where the sky faces: the background's column at the screen's middle at GO, its scroll 0 there (the second program's
 * 0x05AE), the road vanishing at the middle.
 */
function skyFacing(p: PolePositionII) {
  instruction(p.second, 0x05ae, [0x8d08, 0xa101, 0x5d00, 0x8180, 0x6f00, 0xc000], "the background's scroll at GO");
  return skyYawOrigin(SCREEN_COLUMNS / 2, PANORAMA_COLUMNS * 8);
}

/**
 * How far behind the line the player stands at GO: the second program's 0x0658 takes this from its place, a share of
 * the interval before the line, `interval` metres as laid.
 */
function playerBehind(p: PolePositionII, interval: number) {
  const [units] = instruction(p.second, 0x0656, [0xa110, 0x0300, null, 0x6f00, 0x8184], "the player's place at GO");
  return (units! / HIGH_UNITS) * interval;
}

/** What course `c`'s lap on its model is solved from: its curve table, its model, its road's width and least radius. */
function lapInputs(tables: readonly (readonly number[])[], c: number): LapInputs {
  return { values: tables[c]!, model: courseModel(MODELS.get(c)!), roadWidth: ROAD_WIDTH, leastLaneRadius };
}

/** The courses with a model, each its id and what its lap on its model is solved from, for the solving command. */
export function polePositionIIModelLaps(set: RomSet): { course: string; inputs: LapInputs }[] {
  const tables = readCurveTables(assemblePolePositionII(set));
  return [...MODELS.keys()].map((c) => ({ course: COURSE_IDS[c]!, inputs: lapInputs(tables, c) }));
}

/**
 * Course `c`'s lap: TEST's from its own table, its intervals the clock's, turned once round; a course with a model, its
 * lap on its model as solved (`model-laps.json`), which must meet the rule. With its report's figures.
 */
function courseLap(tables: readonly (readonly number[])[], c: number, metres: number, name: string) {
  if (c === TEST) {
    const values = testValues(tables[c]!);
    if (values.length !== INTERVALS) throw new Error("TEST's lap lost intervals");
    const turning = values.reduce((sum, v) => sum + v, 0) * metres;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const intervals = values.map((value) => ({ value, length: metres }));
    return { intervals, scale, length: INTERVALS * metres, report: {} };
  }
  return courseOnModel(COURSE_IDS[c]!, name, lapInputs(tables, c));
}

/** The least distance between two of `points`, metres. */
const nearest = (points: readonly { x: number; y: number }[]) =>
  Math.min(...points.flatMap((a, i) => points.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));

/** POLE POSITION II's courses, from the ROM set: each one's document, crest trials and report. */
export function polePositionIICourses(set: RomSet) {
  const p = assemblePolePositionII(set);
  const tables = readCurveTables(p);
  const names = readNames(p);
  const palettes = readRoadPalettes(p);
  const startLine = readStartLine(p);
  const outputs = new OriginalOutputs();
  // The boards: their places, pictures and reach, a lateral unit and a source pixel in metres by the road's steps.
  const scenery = readScenery(p);
  const pictures = readBoardPictures(p);
  const reach = readSceneryReach(p);
  const projection = readProjection(p);
  const lateralMetres = (STEP_METRES * projection.lateral) / ROAD_STEP_PIXELS;
  const pixelMetres = (STEP_METRES * projection.pixel) / ROAD_STEP_PIXELS;
  const boards = polePositionIIBoards(
    p,
    scenery.flat().map((place) => pictures[place.kind]!),
    pixelMetres,
  );
  for (const { image } of boards) outputs.file(image.path, image.bytes);
  const boardOf = new Map(boards.map((b) => [b.name, b]));
  const { factor, metres } = intervalMetres(p, SPEED_ENTRY);
  const courses = COURSE_IDS.map((id, c) => {
    const { intervals, scale, length, report } = courseLap(tables, c, metres, names[c]!);
    const pieces = curvePlan(intervals, scale);
    // Each board at its curve table position on the lap as laid: its interval and its share of it.
    const starts = [0];
    for (const { length: l } of intervals) starts.push(starts.at(-1)! + l);
    const objects = scenery[c]!.map((place) => {
      const [i, share] = [place.position >> 8, (place.position & 255) / HIGH_UNITS];
      const picture = pictures[place.kind]!;
      const board = boardOf.get(boardName(picture))!;
      return {
        s: starts[i]! + share * intervals[i]!.length,
        lateral: -place.lateral * lateralMetres,
        image: board.name,
        palette: paletteName(picture.color),
        body: Math.min(board.colored, 2 * reach.across * lateralMetres),
      };
    });
    const lap = { pieces, length };
    // The road across: its palettes in turn along an interval, a band each, and the start line's rows.
    const palette = (k: number) => roadPalette(p.road, p.colors, k);
    if (palettes[c]!.length * BAND_UNITS !== HIGH_UNITS)
      throw romDiffers("A course's palettes do not fill an interval");
    const across = crossSection(palettes[c]!.map(palette));
    const interval = length / INTERVALS;
    const unit = interval / HIGH_UNITS;
    const rows = Array.from({ length: startLine.width / startLine.row }, (_, r) => {
      const from = (startLine.from + r * startLine.row) * unit;
      const two = startLine.palettes[c]!;
      const turn = Math.floor((startLine.from + r * startLine.row) / startLine.row) % two.length;
      return { from, to: from + startLine.row * unit, bands: crossSection([palette(two[turn]!)]).bands };
    });
    const sky = `${id}-sky`;
    // The ground beyond the road is its picture's edge, step 0, in the course's first palette.
    outputs.file(`images/${sky}.json`, JSON.stringify(polePositionIISky(p, c, sky, palette(palettes[c]![0]!)[0]!)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap,
      crossSection: across,
      sky,
      laps: LAPS,
      playerBehindLine: playerBehind(p, intervals.at(-1)!.length),
      interval,
      startLine: rows,
      objects,
      skyYawOrigin: skyFacing(p),
      lane: LANE,
      leastLaneRadius,
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    const path = new CoursePath(pieces);
    const tightest = Math.min(...path.elements.filter((e) => e.turn !== 0).map((e) => e.length / Math.abs(e.turn)));
    if (tightest < leastLaneRadius) throw contractUnmet(`${names[c]}'s tightest arc is tighter than its lanes keep`);
    return {
      course: `courses/${id}.course.json`,
      name: names[c],
      intervals: intervals.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: laid.sections,
      valueCurvature: Number(scale.toPrecision(4)),
      tightestRadius: round1(tightest),
      objects: objects.length,
      nearestObjects: round1(nearest(objects.map((o) => path.aside(o.s, o.lateral)))),
      ...report,
    };
  });
  return {
    outputs,
    report: {
      names,
      speedFactor: factor,
      intervalMetres: round3(metres),
      laps: LAPS,
      boards: boards.map((b) => ({ name: b.name, colored: round3(b.colored), width: round3(b.width) })),
      lateralMetres: Number(lateralMetres.toPrecision(5)),
      pixelMetres: Number(pixelMetres.toPrecision(5)),
      courses,
    },
  };
}

export const POLE_POSITION_II_CONVERSION: Conversion = (set) => {
  const { outputs, report } = polePositionIICourses(set);
  return { outputs, report: { conversion: POLE_POSITION_II_CONVERSION_VERSION, ...report } };
};
