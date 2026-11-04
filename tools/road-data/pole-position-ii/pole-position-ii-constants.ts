/**
 * POLE POSITION II's own constants and fixed rules, each with its reason
 * ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-constants)).
 */

/** The road's lane, metres (K, 2026-11-04): its own car, 2.15 m at its depth, makes it 5.46 m; K rounded it. */
export const LANE = 5.5;
/** The road ROM's lateral steps a lane: the lanes lie between the edge lines, steps 8 to 31 and 32 to 55. */
export const LANE_STEPS = 24;
/** The road's lateral step, metres. */
export const STEP_METRES = LANE / LANE_STEPS;
/** The road ROM's lateral count at the road's centre. */
export const CENTRE_STEP = 32;
/**
 * The factory settings (MAME's driver's defaults): the speed shown in km/h at the average speed, the shown speed's
 * first factor (0x1F38's entry 0), and a race of four laps (the Goal setting's).
 */
export const SPEED_ENTRY = 0;
export const LAPS = 4;
/** The conversion's course ids, by the programs' course numbers. */
export const COURSE_IDS = [
  'pole-position-ii-fuji',
  'pole-position-ii-test',
  'pole-position-ii-suzuka',
  'pole-position-ii-seaside',
];
/**
 * The courses with a model and their models (K, 2026-11-04): FUJI on Fuji Speedway in 1983, SUZUKA on Suzuka in 1983
 * and SEASIDE on the 1982 United States Grand Prix West at Long Beach, by the programs' course numbers.
 */
export const MODELS: ReadonlyMap<number, string> = new Map([
  [0, 'fuji_1983'],
  [2, 'suzuka_1983'],
  [3, 'long_beach_1982'],
]);
/** The road's width a lap on its model keeps off itself by: its two lanes. */
export const ROAD_WIDTH = 2 * LANE;
/** TEST's course number, and its two long straights made 66 intervals each (K, 2026-11-04). */
export const TEST = 1;
export const TEST_STRAIGHT = 66;
