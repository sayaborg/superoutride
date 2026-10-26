import type { MapRibbon } from './map-grid.js';
import type { MapGrid, TerrainParameters, TerrainProgress } from './map-terrain.js';

/** What the page asks the map worker: the ribbons, the grid it wants and the terrain's parameters. */
export interface MapRequest {
  readonly ribbons: readonly MapRibbon[];
  /** Metres between the grid's nodes asked for, and around the ribbons. */
  readonly spacing: number;
  readonly margin: number;
  readonly parameters: TerrainParameters;
}

export type MapMessage =
  | ({ readonly type: 'progress'; readonly grid: MapGrid } & TerrainProgress)
  | {
      readonly type: 'done';
      readonly grid: MapGrid;
      /** The terrain's height at each node. */
      readonly heights: Float32Array;
      readonly seconds: number;
    }
  | { readonly type: 'error'; readonly message: string };
