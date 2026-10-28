/**
 * ENDURO RACER's own constants and fixed rules, each with its reason
 * ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-constants)): what its ROMs do not hold.
 * What they hold is read where it is used.
 */
import { halveRgb555 } from '../../src/image/rgb555.js';
import type { Mound } from './jump-mound.js';

/**
 * A lane, metres, over the road's surface's half: K's 3.8 m (2026-10-26). It is the one measure of ENDURO RACER's sizes
 * across.
 */
export const LANE = 3.8;
/**
 * The ground's material by stage, left and right of P: stage 1's grass, stage 3's water and stage 5's sea (left of P)
 * `WATER`, stages 2's and 4's ground and stage 5's white sand `SAND`.
 */
export const GROUND_MATERIALS = Object.freeze([
  { left: 'GRASS', right: 'GRASS' },
  { left: 'SAND', right: 'SAND' },
  { left: 'WATER', right: 'WATER' },
  { left: 'SAND', right: 'SAND' },
  { left: 'WATER', right: 'SAND' },
] as const);
/** The road's material, its surface and edge bands: the original's road is dirt, `WATER` over the water crossings. */
export const ROAD_MATERIAL = 'DIRT';
export const CROSSING_MATERIAL = 'WATER';
/**
 * The course's and its stages' names, K's: the main program holds no text ENDURO RACER (its attract text names ENDURO
 * alone) and writes the stages' numbers apart from its STAGE heading.
 */
export const COURSE_NAME = 'ENDURO RACER';
export const stageName = (stage: number) => `STAGE ${stage + 1}`;
/** Where the checkpoints and the finish stand: the CHECK banner's and the GOAL board's scenery types. */
export const CHECK_TYPE = 0x48;
export const GOAL_TYPE = 0x50;
/**
 * The skies face as the original's backgrounds: at a stage's start heading, the same for every stage, the road's
 * vanishing point shows the back layer's pixel 1281.5 of 1536, here 1281.5 × 1504 / 1536 of the sky's 1504.
 */
export const BACK_AT_HEADING = 1281.5;

/**
 * A jump ([Original road data](../../docs/original-road-data.md#profile), Jumps and dips): K's ramp, its 9 m face's
 * grade changing from level to 1/3 at its lip, 1.5 m high, back down in 4.5 m (K, 2026-10-27).
 */
export const JUMP: Mound = Object.freeze({ face: 9, root: 0, crest: 1 / 3 });

/** A ramp's bands across the road (K, 2026-10-27): the road's width, to its edge bands' outer edges, in nine. */
export const RAMP_BANDS = 9;
/** A ramp's light band (K, 2026-10-27): its color a quarter of the way to white, each channel floored. */
export const rampLight = (rgb555: number) => rgb555 + halveRgb555(halveRgb555(0x7fff ^ rgb555));

/** The front layer's pixel f lies over the back's 0.75f − 63.625 where the road vanishes. */
export const OVERLAP = -63.625;
/** Lateral units an unscaled pixel spans: the hardware draws it at depth number 0x7F, where a unit is 125/128 pixels. */
export const PIXEL_UNITS = 128 / 125;
