/**
 * ENDURO RACER's own constants and fixed rules, each with its reason
 * ([ENDURO RACER road data](../../../docs/enduro-racer-road-data.md#enduro-racers-constants)): what its ROMs do not hold.
 * What they hold is read where it is used.
 */
import { halveRgb555 } from '../../../src/image/rgb555.js';
import type { Mound } from '../shared/jump-mound.js';

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
/** The road's material, its surface and edge bands: the original's road is dirt, `WATER` over the fords. */
export const ROAD_MATERIAL = 'DIRT';
export const FORD_MATERIAL = 'WATER';
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
 * The hardware shows a tile layer's pixel `LAYER_MIDDLE` − its scroll at the screen's middle column, where the road
 * vanishes: its display offset, which no program holds (`backgroundScroll`, from the original's road vanishing at its
 * back layer's pixel 1281.5 at a stage's start).
 */
export const LAYER_MIDDLE = 1893.5;

/**
 * A jump ([Original road data](../../../docs/original-road-data.md#profile), Jumps and dips): K's ramp, its 9 m face's
 * grade changing from level to 1/3 at its lip, 1.5 m high, back down in 4.5 m (K, 2026-10-27).
 */
export const JUMP: Mound = Object.freeze({ face: 9, root: 0, crest: 1 / 3 });

/** A ramp's bands across the road (K, 2026-10-27): the road's width, to its edge bands' outer edges, in nine. */
export const RAMP_BANDS = 9;
/** A ramp's light band (K, 2026-10-27): its color a quarter of the way to white, each channel floored. */
export const rampLight = (rgb555: number) => rgb555 + halveRgb555(halveRgb555(0x7fff ^ rgb555));

/**
 * The sprite hardware's scale, which no program holds: at zoom z a lateral unit spans (z − `offset`) / `scale` pixels
 * (`objectZoom`).
 */
export const ZOOM_UNIT = Object.freeze({ offset: 2, scale: 128 } as const);

/** The id of ENDURO RACER's one course, its file's name and its Sections' and images' prefix. */
export const COURSE_ID = 'enduro-racer';
