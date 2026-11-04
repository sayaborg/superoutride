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
import { assembleFinalLap2 } from './final-lap-2-rom.js';
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
import { COURSE_IDS, PLAIN_SKY, USA } from './final-lap-2-constants.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const FINAL_LAP_2_CONVERSION_VERSION = 2;

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
 * A curve table's intervals from the line, `line` units in: the line's interval from the line on, the rest in turn,
 * then the line's interval up to the line; each `metres` long.
 */
function fromLine(values: readonly number[], line: number, metres: number): CurveInterval[] {
  const [i, share] = [Math.floor(line / INTERVAL_UNITS), (line % INTERVAL_UNITS) / INTERVAL_UNITS];
  const n = values.length;
  return [
    { value: values[i]!, length: metres * (1 - share) },
    ...Array.from({ length: n - 1 }, (_, k) => ({ value: values[(i + 1 + k) % n]!, length: metres })),
    ...(share > 0 ? [{ value: values[i]!, length: metres * share }] : []),
  ];
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
  const courses = [USA].map((c) => {
    const id = COURSE_IDS[c]!;
    const values = tables[c]!;
    const turning = values.reduce((sum, v) => sum + v, 0) * interval;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const intervals = fromLine(values, line, interval);
    const pieces = curvePlan(intervals, scale);
    const across = crossSection(p, readRoadStep(p, c, 0)[0]!, tiles, palette, metres);
    const lane = across.width / 2;
    const sky = `${id}-sky`;
    outputs.file(`images/${sky}.json`, JSON.stringify(plainSky(sky, across.bands[0]!.colors[0]!)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap: { pieces, length: INTERVALS * interval },
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
      intervals: values.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: laid.sections,
      tightestRadius: round1(tightest),
      lane: round3(lane),
      roadWidth: round3(across.width),
      limit: round3(across.limit),
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
