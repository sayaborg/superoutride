/**
 * POLE POSITION II's courses from its ROMs ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-courses)):
 * its conversion, each course's lap from its curve table laid out by `pole-position-ii-layout`.
 */
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { instruction } from '../cpu/program-words.js';
import { crestTrials } from '../shared/crest-trials.js';
import { curvePlan, curveRuns } from '../shared/curve-plan.js';
import { CoursePath } from '../shared/course-path.js';
import { OriginalOutputs, round1, round3, type Conversion } from '../shared/conversion.js';
import type { RomSet } from '../shared/rom-set.js';
import { paletteColor, roadPalette } from '../pole-position-hardware/colors.js';
import { PIXEL_ASPECT } from '../pole-position-hardware/display.js';
import { bakeSky, TRANSPARENT } from '../shared/sky-baking.js';
import { BACK_WIDTH, FRONT_WIDTH } from '../sega-16/display.js';
import { assemblePolePositionII, type PolePositionII } from './pole-position-ii-rom.js';
import { INTERVALS, intervalMetres, readCurveTables, readNames, readRoadPalettes } from './pole-position-ii-road.js';
import { crossSection, leastLaneRadius } from './pole-position-ii-cross-section.js';
import { layCourse } from './pole-position-ii-layout.js';
import { COURSE_IDS, LAPS, SPEED_ENTRY, TEST, TEST_STRAIGHT } from './pole-position-ii-constants.js';

/** The conversion's version, recorded in the specification beside the courses it wrote. */
export const POLE_POSITION_II_CONVERSION_VERSION = 1;

/** The road position's high word's units an interval: the player stands this many of them behind its place at GO. */
const HIGH_UNITS = 256;

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
 * A sky of the background's color where it draws nothing, the first color group's pen 0, over the verge's color below
 * the horizon: until the background is laid (NM-8), the sky shows none of its pictures. Its layers are empty, so their
 * widths, Sky baking's, show nowhere.
 */
function plainSky(p: PolePositionII, name: string, verge: number) {
  const sky = paletteColor(p.colors.red, p.colors.green, p.colors.blue, p.background[0]! & 15);
  const layer = (width: number) => ({ width, pixels: new Int32Array(width).fill(TRANSPARENT), bottom: 0 });
  return bakeSky(
    name,
    { back: layer(BACK_WIDTH), front: layer(FRONT_WIDTH), overlap: 0, ramp: { rows: [sky], below: verge } },
    PIXEL_ASPECT,
  );
}

/** How far behind the line the player stands at GO: the second program's 0x0658 takes this from its place. */
function playerBehind(p: PolePositionII, interval: number) {
  const [units] = instruction(p.second, 0x0656, [0xa110, 0x0300, null, 0x6f00, 0x8184], "the player's place at GO");
  return (units! / HIGH_UNITS) * interval;
}

/** POLE POSITION II's courses, from the ROM set: each one's document, crest trials and report. */
export function polePositionIICourses(set: RomSet) {
  const p = assemblePolePositionII(set);
  const tables = readCurveTables(p);
  const names = readNames(p);
  const palettes = readRoadPalettes(p);
  const { factor, metres } = intervalMetres(p, SPEED_ENTRY);
  const outputs = new OriginalOutputs();
  const courses = [TEST].map((c) => {
    const values = testValues(tables[c]!);
    if (values.length !== INTERVALS) throw new Error("TEST's lap lost intervals");
    const turning = values.reduce((sum, v) => sum + v, 0) * metres;
    const scale = (2 * Math.PI * Math.sign(turning)) / turning;
    const pieces = curvePlan(
      values.map((value) => ({ value, length: metres })),
      scale,
    );
    const lap = { pieces, length: INTERVALS * metres };
    const id = COURSE_IDS[c]!;
    const across = crossSection(roadPalette(p.road, p.colors, palettes[c]![0]!));
    const sky = `${id}-sky`;
    outputs.file(`images/${sky}.json`, JSON.stringify(plainSky(p, sky, across.bands[0]!.color)));
    const laid = layCourse({
      id: names[c]!.toLowerCase(),
      name: names[c]!,
      lap,
      crossSection: across,
      sky,
      laps: LAPS,
      playerBehindLine: playerBehind(p, metres),
    });
    outputs.course(id, laid.document);
    outputs.crestTrials(id, crestTrials(laid.heights, laid.write));
    const path = new CoursePath(pieces);
    const tightest = Math.min(...path.elements.filter((e) => e.turn !== 0).map((e) => e.length / Math.abs(e.turn)));
    if (tightest < leastLaneRadius) throw contractUnmet(`${names[c]}'s tightest arc is tighter than its lanes keep`);
    return {
      course: `courses/${id}.course.json`,
      name: names[c],
      intervals: values.length,
      pieces: path.elements.length,
      length: round3(path.length),
      sections: laid.sections,
      turnScale: round3(scale * metres * 1000),
      tightestRadius: round1(tightest),
    };
  });
  return {
    outputs,
    report: { names, speedFactor: factor, intervalMetres: round3(metres), laps: LAPS, courses },
  };
}

export const POLE_POSITION_II_CONVERSION: Conversion = (set) => {
  const { outputs, report } = polePositionIICourses(set);
  return { outputs, report: { conversion: POLE_POSITION_II_CONVERSION_VERSION, ...report } };
};
