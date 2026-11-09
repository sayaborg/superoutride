/**
 * CONTINENTAL CIRCUS's courses ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md)): each a
 * lap on its model ([Original road data](../../../docs/original-road-data.md#a-lap-on-its-model)), K's course sources'
 * circuit the original drew, laid from its curve table of records of their own lengths.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { courseModel } from '../shared/course-models.js';
import type { LapInputs } from '../shared/model-lap.js';
import type { RomSet } from '../shared/rom-set.js';
import { CONTINENTAL_CIRCUS_COURSES } from './continental-circus-backgrounds.js';
import { continentalCircusLap, curveTable } from './continental-circus-road.js';
import { continentalCircusRoadPicture } from './continental-circus-road-picture.js';
import {
  assembleContinentalCircusMain,
  assembleContinentalCircusSub,
  CONTINENTAL_CIRCUS_ROAD_ROM,
} from './continental-circus-rom.js';

/** The conversion's course ids, by the program's course numbers. */
export const COURSE_IDS = CONTINENTAL_CIRCUS_COURSES.map((name) => `continental-circus-${name.toLowerCase()}`);

/**
 * Each course's model, K's course sources' layout of the circuit the original drew (K, 2026-11-06), by the program's
 * course numbers.
 */
export const MODELS = Object.freeze([
  'jacarepagua_1978_1995',
  'watkins_glen_1975_1985',
  'dijon_prenois_extended_gp',
  'monaco_1976_1985',
  'hockenheim_1970_1981',
  'jarama_1967_1979',
  'long_beach_1976_1981',
  'suzuka_1962_1983',
] as const);

/**
 * What course `c` has its lap on its model solved from: its curve table from its line, each record its own length
 * (`curveTable`), its values negated, as the original's positive value bends the road right and a plan's turns left
 * ([Plan from a curve table](../../../docs/original-road-data.md#plan-from-a-curve-table)); its model, its road's width
 * and its lanes' least radius, its two lanes each half the road (K, 2026-11-05).
 */
function lapInputs(sub: Uint8Array, halfMetres: number, c: number): LapInputs {
  const table = curveTable(sub, continentalCircusLap(sub, c));
  return {
    values: table.map((t) => -t.value),
    lengths: table.map((t) => t.length),
    model: courseModel(MODELS[c]!, `CONTINENTAL CIRCUS ${CONTINENTAL_CIRCUS_COURSES[c]!}`),
    roadWidth: 2 * halfMetres,
    leastLaneRadius: laneRadius(halfMetres),
  };
}

/** The courses, each its id and what its lap on its model is solved from, for the solving command. */
export function continentalCircusModelLaps(set: RomSet): { course: string; inputs: LapInputs }[] {
  const [main, sub] = [assembleContinentalCircusMain(set), assembleContinentalCircusSub(set)];
  const { halfMetres } = continentalCircusRoadPicture(main, set.data(CONTINENTAL_CIRCUS_ROAD_ROM));
  return COURSE_IDS.map((course, c) => ({ course, inputs: lapInputs(sub, halfMetres, c) }));
}
