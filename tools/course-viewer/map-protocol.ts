import type { MapRibbon } from './map-grid.js';
import type { Stripes } from './map-stripes.js';
import type { MapGrid, TerrainParameters } from './map-terrain.js';

/**
 * What the page asks the map worker: the ribbons and their stripe bands (`mapBands`) with how many pairs of colors they
 * name, the grid it wants and the terrain's parameters.
 */
export interface MapRequest {
  readonly ribbons: readonly MapRibbon[];
  readonly bands: readonly Float64Array[];
  readonly pairCount: number;
  /** Metres between the grid's nodes asked for, and around the ribbons. */
  readonly spacing: number;
  readonly margin: number;
  readonly parameters: TerrainParameters;
}

export type MapMessage =
  | {
      readonly type: 'progress';
      readonly grid: MapGrid;
      /** What is being solved, at which spacing, and the terrain's step there. */
      readonly stage: 'terrain' | 'slopes' | 'stripes';
      readonly spacing: number;
      readonly step: number;
    }
  | {
      readonly type: 'done';
      readonly grid: MapGrid;
      /** The terrain's height at each node. */
      readonly heights: Float32Array;
      /** The stripes, or none where no ribbon has a band. */
      readonly stripes: Stripes | null;
      /** Seconds the terrain and the stripes took. */
      readonly seconds: { readonly terrain: number; readonly stripes: number };
    }
  | { readonly type: 'error'; readonly message: string };
