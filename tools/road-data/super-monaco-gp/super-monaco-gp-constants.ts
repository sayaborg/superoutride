/**
 * SUPER MONACO GP's own constants and fixed rules, each with its reason
 * ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-constants)): what its ROMs do
 * not hold, or hold only in its encrypted main program, whose values the research notes give. What they hold is read
 * where it is used.
 */
import { SKY_WIDTH } from '../shared/sky-baking.js';
import { metresAPosition } from '../shared/road-position.js';
import { BACK_WIDTH } from '../sega-16/display.js';

/** A step's units along the road. */
export const STEP_UNITS = 96;
/**
 * A step, metres: 96 units along the road, a unit 0.0349 / 9 m, as the clock (0.0349 s a tick) and the displayed km/h
 * (the camera moves 2.5 units a tick for each km/h) give it, encrypted.
 */
export const STEP_METRES = metresAPosition(1, 0.0349, 2.5 / STEP_UNITS);
/** The metres between the barriers, K's 11 (2026-10-26): with their units apart, the lateral unit (`courseScale`). */
export const BARRIER_METRES = 11;
/** The barriers: the objects turning through view table 0x040A, the conversion's. */
export const BARRIERS = 0x040a;
/**
 * The laps the original runs its race, by its records (K, 2026-10-30): its default records hold a three laps' time,
 * 4'39"40 (M 0xC280). The ROMs give the course alone; its laps are not read.
 */
export const RACE_LAPS = 3;
/** The lap's line: every grid slot's lap count reaches its first lap at step 288, encrypted. */
export const LAP_LINE = 288;
/** The lanes, 512 units each, their centres at ±256 as the grid's, encrypted. */
export const LANE_UNITS = 512;
/** Where the original hits, units from P (the limits routine, M 0xC414): a barrier 700, an escape area 1228, encrypted. */
export const BARRIER_HIT = 700;
export const ESCAPE_HIT = 1228;
/**
 * The rival cars' size class, b1 2, their pixel 8 / 2^2 = 2 units (`pixelUnits`): they have no size class byte, and
 * their routine (M 0x12D5C to 0x12E48) takes the size index q / 4 + 8 (M 0x12E42), the shift a b1 of 2 gives, encrypted.
 */
export const RIVAL_SIZE_CLASS = 2;
/** A band's edges move to the next band's over the 4 steps about their border, the conversion's. */
export const BAND_RAMP = 2;
/**
 * The grid: the original's 24 slots 12 steps apart past the line, lane a for even slots and b for odd, slot s at
 * 576 − 12s, the original's 12(23 − s) moved on as its line moves them, 300 steps, encrypted.
 */
export const GRID = { slots: 24, first: 576, spacing: 12 } as const;
/** The dark of the tunnel's background: the palette word M 0x7D94 writes, encrypted. */
export const TUNNEL_DARK = 0x0111;
/**
 * The race's tunnel: its dark ground from its mouth to its exit's, made as this game makes tunnels (K, 2026-10-21);
 * its dark sky where the original's background is wholly dark, from 9054 to where it starts brightening, 10655,
 * encrypted.
 */
export const TUNNEL = { ground: [9032, 10860], sky: [9054, 10655] } as const;
/** At heading 0 the road vanishes at both layers' pixel 354 of 1536, the display's offset, encrypted. */
export const VANISHING_PIXEL = 354;
/** The sky's column there: 354 × 1504 / 1536. */
export const SKY_AT_HEADING = (VANISHING_PIXEL * SKY_WIDTH) / BACK_WIDTH;
/** A kerb stands on from the one before it within this many steps, alternating its palette. */
export const KERB_GAP = 8;
/** An object on a curve's inside stands only within this of the curve's centre's distance (metres). */
export const INSIDE_MARGIN = 2;

/**
 * The course's name, K's (2026-10-23): the main program's text has SUPER MONACO GRAND PRIX and GRAND PRIX, but no
 * course's name.
 */
export const COURSE_NAME = 'SUPER MONACO GP';

/**
 * The course: the race's lap (the descriptors' course 1; the qualifying's short way, course 0, is not raised, K,
 * 2026-10-31), its id, name, checkpoints' steps and the laps the original runs it.
 */
export const COURSE = Object.freeze({
  course: 1,
  id: 'super-monaco-gp',
  name: COURSE_NAME,
  checkpoints: [4697, 9538],
  laps: RACE_LAPS,
} as const);
export type SuperMonacoGpCourse = typeof COURSE;

/** The skies, by name. */
export const SKIES = Object.freeze({ fine: 'smgp-sky', tunnel: 'smgp-tunnel-sky' } as const);
/** The road's material: the ROMs hold none, so K's (2026-10-25). */
export const ROAD_MATERIAL = 'ASPHALT';
/** The escape areas' grass band's material: the ROMs hold none, so K's (2026-10-25). */
export const GRASS_MATERIAL = 'GRASS';

/** A road path unit, metres: a step's 96 units are `STEP_METRES` (the scale along the road). */
export const PATH_UNIT = STEP_METRES / STEP_UNITS;
/** The road path's resolution, units: its points are integers. */
export const PATH_RESOLUTION = 1;
/**
 * The surface boards, a step's flat boards across the road (their width and where they stand, `readPaving`), and those
 * that draw it.
 */
export const SURFACE_BOARD = 0x0da4;
export const GRID_BOARD = 0x0dfe;
export const START_BOARD = 0x1f4a;
export const SURFACE_FRAMES = Object.freeze(new Set([SURFACE_BOARD, GRID_BOARD, 0x0e1c, 0x0e3a, START_BOARD, 0x1f92]));
/**
 * The centre line: a board's top row's columns 119–128, the line's ten pixels about the board's middle, drawn here 80
 * units wide and 2 steps long at its band's far end.
 */
export const CENTRE_LINE = { row: 0, from: 119, to: 128, half: 40, steps: 2 } as const;
/** Each grid slot's marks: the grid board's rows, each `MARK_STEPS` long. */
export const GRID_MARKS = Object.freeze([
  { row: 2, back: 0, from: 80, to: 896 },
  { row: 22, back: 4, from: 64, to: 808 },
] as const);
export const MARK_STEPS = 0.5;
/** The start line: its boards' row 6, in blocks of bright (8–10) and dark (11–13) pixels, 2 steps before each board. */
export const START_LINE = { row: 6, steps: 2, bright: [8, 10], dark: [11, 13] } as const;
/**
 * The kerbs: the objects turning through view table 0x050A, 4 steps apart, each a blue and a white stripe (its pixels
 * 1–6 and 7–12, the next kerb's palette swapping them), drawn as stripes.
 */
export const KERBS = 0x050a;
export const KERB_STEPS = 4;
export const KERB_CLASSES = [
  [1, 6],
  [7, 12],
] as const;
