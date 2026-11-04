/**
 * POLE POSITION II's road across ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-road-across)):
 * the road ROM counts 64 lateral steps across its road picture, and a road palette colors each step; the palettes in
 * turn along an interval color it in stripes, and the start line's checker is two palettes by turns.
 */
import { leastLaneRadius as laneRadius } from '../../../src/course/plan-clearance.js';
import { ROAD_PALETTE_ENTRIES } from '../pole-position-hardware/colors.js';
import { CENTRE_STEP, LANE, STEP_METRES } from './pole-position-ii-constants.js';
import type { Band, CrossSection, Material } from '../shared/circuit-layout.js';

/** The road picture's steps: the first and last are its edge's (0 and 63), the rest its kerbs, shoulders, lines and road. */
const FIRST_STEP = 1;
const LAST_STEP = ROAD_PALETTE_ENTRIES - 2;
/** The shoulders' outer steps: from them in, the road is paved (its shoulders, edge lines and lanes); out, grass. */
const PAVED_STEPS = [5, 58] as const;

/** The least radius the lanes keep: a lane either side of P, the road's centre. */
export const leastLaneRadius = laneRadius(LANE);

/** A step's left edge, metres right of the road's centre. */
const lateral = (step: number) => (step - CENTRE_STEP) * STEP_METRES;

const material = (step: number): Material => (step >= PAVED_STEPS[0] && step <= PAVED_STEPS[1] ? 'ASPHALT' : 'GRASS');

/**
 * The road across from road palettes, each 64 colors, one a step (`palettes`, those in turn along an interval): a band
 * is the steps in turn of one material and the same colors in each palette.
 */
export function crossSection(palettes: readonly (readonly number[])[]): CrossSection {
  const bands: Band[] = [];
  for (let step = FIRST_STEP; step <= LAST_STEP; step++) {
    const last = bands.at(-1);
    const colors = palettes.map((palette) => palette[step]!);
    if (last && last.material === material(step) && last.colors.every((c, k) => c === colors[k]))
      bands[bands.length - 1] = { ...last, right: lateral(step + 1) };
    else bands.push({ left: lateral(step), right: lateral(step + 1), colors, material: material(step) });
  }
  return { bands, limit: -lateral(FIRST_STEP) };
}
