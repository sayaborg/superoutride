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
