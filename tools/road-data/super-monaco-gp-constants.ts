/**
 * SUPER MONACO GP's own constants and fixed rules, each with its reason
 * ([SUPER MONACO GP road data](../../docs/super-monaco-gp-road-data.md#super-monaco-gps-constants)): what its ROMs do
 * not hold, or hold only in its encrypted main program, whose values the research notes give. What they hold is read
 * where it is used.
 */
import { SKY_WIDTH } from './sky-baking.js';
import { metresAPosition } from './road-position.js';

/**
 * A step, metres: 96 units along the road, a unit 0.0349 / 9 m, as the clock (0.0349 s a tick) and the displayed km/h
 * (the camera moves 2.5 units a tick for each km/h) give it, encrypted.
 */
export const STEP_METRES = metresAPosition(1, 0.0349, 2.5 / 96);
/** A lateral unit, metres: 1640 units between the barriers are K's 11 m (2026-10-26). */
export const UNIT = 11 / 1640;
/** The original's pixels are 14 wide to 15 tall: its vertical amounts grow by this. */
export const UNIT_DOWN = (UNIT * 15) / 14;
/** The lap's line: every grid slot's lap count reaches its first lap at step 288, encrypted. */
export const LAP_LINE = 288;
/** The lanes, 512 units each, their centres at ±256 as the grid's, encrypted. */
export const LANE = 512 * UNIT;
export const OFFSET = LANE / 2;
/** Half a car, units: a band's limit is where the original hits (the limits routine, M 0xC414), this far out. */
export const HALF_CAR = 105;
/** A barrier's band and an escape area's limits, units from P: the original's hits at 700 and 1228, encrypted. */
export const BARRIER = 700 + HALF_CAR;
export const ESCAPE = 1228 + HALF_CAR;
/** A band's edges move to the next band's over the 4 steps about their border, the conversion's. */
export const BAND_RAMP = 2;
/**
 * The grid: the original's 24 slots 12 steps apart past the line, lane a for even slots and b for odd, slot s at
 * 576 − 12s, the original's 12(23 − s) moved on as its line moves them, 300 steps, encrypted.
 */
export const GRID = { slots: 24, first: 576, spacing: 12 } as const;
/** The dark of the tunnel's background, RGB555, encrypted. */
export const TUNNEL_DARK = 0x0842;
/**
 * The race's tunnel: its dark ground from its mouth to its exit's, made as this game makes tunnels (K, 2026-10-21);
 * its dark sky where the original's background is wholly dark, from 9054 to where it starts brightening, 10655,
 * encrypted.
 */
export const TUNNEL = { ground: [9032, 10860], sky: [9054, 10655] } as const;
/**
 * The pictures inside the tunnel made its frame (K, 2026-10-27): the walls' pillars (0x1494) and the ceiling's lights
 * (0x14B2), each drawn in a frame of the tunnel's dark with the road's opening left.
 */
export const TUNNEL_FRAME: ReadonlyMap<number, 'wall' | 'ceiling'> = new Map<number, 'wall' | 'ceiling'>([
  [0x1494, 'wall'],
  [0x14b2, 'ceiling'],
]);
/** At heading 0 the road vanishes at both layers' pixel 354 of 1536, the display's offset, encrypted. */
export const VANISHING_PIXEL = 354;
/** The sky's column there: 354 × 1504 / 1536. */
export const SKY_AT_HEADING = (VANISHING_PIXEL * SKY_WIDTH) / 1536;
/** A kerb stands on from the one before it within this many steps, alternating its palette. */
export const KERB_GAP = 8;
/** An object on a curve's inside stands only within this of the curve's centre's distance (metres). */
export const INSIDE_MARGIN = 2;

/**
 * The courses' names, K's (2026-10-23): the main program's text has SUPER MONACO GRAND PRIX, GRAND PRIX and QUALIFYING
 * RESULTS, but no course's name.
 */
export const COURSE_NAMES = Object.freeze({ race: 'SUPER MONACO GP', qualifying: 'MONACO QUALIFYING' } as const);
