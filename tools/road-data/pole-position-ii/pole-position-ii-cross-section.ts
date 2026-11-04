/**
 * POLE POSITION II's road across ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-road-across)):
 * the road ROM counts 64 lateral steps across its road picture, and a road palette colors each step; a band is the
 * steps of one color in turn, laid at the road's lateral step.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { ROAD_PALETTE_ENTRIES } from '../pole-position-hardware/colors.js';
import { CENTRE_STEP, LANE, STEP_METRES } from './pole-position-ii-constants.js';

/** The road picture's steps: the first and last are its edge's (0 and 63), the rest its verges, kerbs, lines and road. */
const FIRST_STEP = 1;
const LAST_STEP = ROAD_PALETTE_ENTRIES - 2;
/** The kerbs' outer steps: from them in, the road is paved (its kerbs, edge lines and lanes); out, grass. */
const KERB_STEPS = [5, 58] as const;

/** A band of the road across: metres right of the road's centre, its color (RGB555) and material. */
export interface Band {
  readonly left: number;
  readonly right: number;
  readonly color: number;
  readonly material: 'ASPHALT' | 'GRASS';
}

/** The road across: its bands, and its limits, metres either side of its centre (the road picture's edges). */
export interface CrossSection {
  readonly bands: readonly Band[];
  readonly limit: number;
}

/** The least radius the lanes keep: a lane either side of P, the road's centre. */
export const leastLaneRadius = laneRadius(LANE);

/** A step's left edge, metres right of the road's centre. */
const lateral = (step: number) => (step - CENTRE_STEP) * STEP_METRES;

/** The road across from a road palette's colors, one a step. */
export function crossSection(palette: readonly number[]): CrossSection {
  const material = (step: number) => (step >= KERB_STEPS[0] && step <= KERB_STEPS[1] ? 'ASPHALT' : 'GRASS');
  const bands: Band[] = [];
  for (let step = FIRST_STEP; step <= LAST_STEP; step++) {
    const last = bands.at(-1);
    const color = palette[step]!;
    if (last && last.color === color && last.material === material(step))
      bands[bands.length - 1] = { ...last, right: lateral(step + 1) };
    else bands.push({ left: lateral(step), right: lateral(step + 1), color, material: material(step) });
  }
  return { bands, limit: -lateral(FIRST_STEP) };
}
