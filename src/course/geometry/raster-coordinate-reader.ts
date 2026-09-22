import type { Writable } from '../../core/writable.js';
import { rasterPathToWorld, type CourseWorldSample, type RasterPath } from './raster-path.js';

/** Read-only segment metadata and point mapping, without source vertices or topology. */
export interface RasterCoordinateReader {
  readonly length: number;
  readonly segments: readonly {
    readonly sStart: number;
    readonly length: number;
    readonly heading: number;
  }[];
  toWorld(s: number, l: number, out: Writable<CourseWorldSample>): CourseWorldSample;
}

type RasterCoordinateSource = RasterPath | RasterCoordinateReader;

/** Terrain needs Raster only. Existing GuidePath objects satisfy this structural facet. */
export interface RasterGeometry {
  readonly length: number;
  readonly raster: RasterCoordinateSource;
}

export function rasterCoordinateToWorld(
  source: RasterCoordinateSource,
  s: number,
  l: number,
  out: Writable<CourseWorldSample>,
): CourseWorldSample {
  return 'toWorld' in source ? source.toWorld(s, l, out) : rasterPathToWorld(source, s, l, out);
}
