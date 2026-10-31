/**
 * SUPER HANG-ON's own constants and fixed rules, each with its reason
 * ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md#super-hang-ons-constants)): what its ROMs do not hold.
 * What they hold is read where it is used.
 */

/**
 * A lane, metres, over the road's half to its lines' inner edges: K's 4.3 m, at which the original's upright rear frame
 * of the bike stands about as tall as VFR750R's upright rear picture. It is the one measure of SUPER HANG-ON's sizes
 * across and up.
 */
export const LANE = 4.3;

/** The road's centre: the middle of column 252, the centre line's (its 3s from 251 to 253, widening to 249 to 255). */
export const ROAD_CENTRE = 252.5;

/**
 * The gates' parts by their templates' order (`readGateParts`): the left and right legs 0 and 1, the signal 2, the left
 * and right corners 3 and 4 and the banner 5. START shows all six, as the original brings them out at the race's start,
 * its signal lit as at GO, its template's palette 3 on; each CHECK and GOAL all but the signal; the banner reads START,
 * CHECK or GOAL in its gate's palette.
 */
export const GATE_PARTS = Object.freeze({
  signal: 2,
  banner: 5,
  lit: 3,
  start: Object.freeze([0, 1, 2, 3, 4, 5]),
  others: Object.freeze([0, 1, 3, 4, 5]),
});

/** A figure of the ending, as its last frame stands: its frame, palette, x and height in road units. */
export interface EndingFigure {
  readonly list: number;
  readonly palette: number;
  readonly x: number;
  readonly height: number;
}

/**
 * The ending's figures, by course, as its last frame shows them: their frames, palettes, x and height above the road
 * (K's reading of the original's run).
 */
export const ENDING: readonly (readonly EndingFigure[])[] = [
  [],
  [
    { list: 0x13e5a, palette: 0x1c, x: 19, height: 3 },
    { list: 0x13eb4, palette: 0x21, x: -75, height: -2 },
  ],
  [
    { list: 0x1395a, palette: 0x19, x: -113, height: 3 },
    { list: 0x1393c, palette: 0x19, x: -71, height: 2 },
    { list: 0x13928, palette: 0x1d, x: -14, height: 84 },
  ],
  [{ list: 0x13810, palette: 0x1a, x: -48, height: 2 }],
];
/** The road's material: the ROMs hold none, so K's (2026-10-25). */
export const ROAD_MATERIAL = 'ASPHALT';
/** The ground's material beyond the road: the ROMs hold none, so K's (2026-10-25). */
export const GROUND_MATERIAL = 'SAND';
