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
import { bakeSky, TRANSPARENT } from '../shared/sky-baking.js';
import { PIXEL_ASPECT } from '../namco-system-2/display.js';
import { assembleFinalLap2, type FinalLap2 } from './final-lap-2-rom.js';
import {
  INTERVAL_UNITS,
  INTERVALS,
  intervalMetres,
  readCurveTables,
  readGo,
  readLaps,
  readLine,
  readNames,
  readRoadPalette,
  readRoadStep,
  readRoadTiles,
} from './final-lap-2-road.js';
import { crossSection, roadPixelMetres } from './final-lap-2-cross-section.js';
import { COURSE_IDS, MODELS, PLAIN_SKY, USA } from './final-lap-2-constants.js';
import { courseModel } from '../shared/course-models.js';
import { courseOnModel, type LapInputs } from '../shared/model-lap.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const FINAL_LAP_2_CONVERSION_VERSION = 3;

/**
 * A plain sky until the background is laid (NM-11): `PLAIN_SKY` over the ground's color below the horizon. Its layer
 * is empty, so its width shows nowhere.
 */
function plainSky(name: string, ground: number) {
  const width = 2048;
  return bakeSky(
    name,
    {
      back: { width, pixels: new Int32Array(width).fill(TRANSPARENT), bottom: 0 },
      ramp: { rows: [PLAIN_SKY], below: ground },
    },
    PIXEL_ASPECT,
  );
}

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
 * Course `c`'s lap from its line: USA's its own table's, its intervals the clock's, turned once round; a course with a
 * model, its lap on its model as solved (`model-laps.json`), which must meet the rule. With its report's figures.
 */
function courseLap(
  tables: readonly (readonly number[])[],
  c: number,
  interval: number,
  line: number,
  width: number,
  name: string,
) {
  if (c === USA) {
    const values = tables[c]!;
    const turning = values.reduce((sum, v) => sum + v, 0) * interval;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const intervals = fromLine(
      values.map((value) => ({ value, length: interval })),
      line,
    );
    return { intervals, scale, length: INTERVALS * interval, report: {} };
  }
  const lap = courseOnModel(COURSE_IDS[c]!, name, lapInputs(tables, c, width));
  return { ...lap, intervals: fromLine(lap.intervals, line) };
}

/** FINAL LAP 2's courses, from the ROM set: each one's document, crest trials and report. */
export function finalLap2Courses(set: RomSet) {
  const p = assembleFinalLap2(set);
  const names = readNames(p);
  const tables = readCurveTables(p);
  const laps = readLaps(p);
  const line = readLine(p);
  const go = readGo(p);
  const { unit, interval } = intervalMetres(p);
  const tiles = readRoadTiles(p);
  const palette = readRoadPalette(p);
  const metres = roadPixelMetres(p);
  const outputs = new OriginalOutputs();
  const courses = COURSE_IDS.map((id, c) => {
    const across = courseAcross(p, c, tiles, palette, metres);
    const { intervals, scale, length, report } = courseLap(tables, c, interval, line, across.width, names[c]!);
    const pieces = curvePlan(intervals, scale);
    const lane = across.width / 2;
    const sky = `${id}-sky`;
    outputs.file(`images/${sky}.json`, JSON.stringify(plainSky(sky, across.bands[0]!.colors[0]!)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap: { pieces, length },
      crossSection: across,
      laps,
      playerBehindLine: go.behind * unit,
      sky,
      interval,
      startLine: [],
      skyYawOrigin: 0,
      objects: [],
      lane,
      leastLaneRadius: laneRadius(lane),
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
      limit: round3(across.limit),
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
      courses,
    },
  };
}

export const FINAL_LAP_2_CONVERSION: Conversion = (set) => {
  const { outputs, report } = finalLap2Courses(set);
  return { outputs, report: { conversion: FINAL_LAP_2_CONVERSION_VERSION, ...report } };
};
