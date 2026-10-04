import type { CompiledCoursePosition } from './course-geometry.js';
import type { TileBackgroundImage } from '../image/tile-background-image.js';
import type { SpriteAsset } from '../image/sprite.js';
import type { CompiledBoundary } from './course-boundaries.js';

/** Decoded image facet; a compiler's canonical asset record structurally supplies it. */
interface DecodedImage<Image> {
  readonly image: Image;
}

export interface CourseSpriteResource {
  readonly palette: string;
  readonly asset: DecodedImage<SpriteAsset>;
}

/** A band of a wall picture: its color (null is transparent) up to `to` metres above the road. */
export interface CourseWallBand {
  readonly to: number;
  readonly color: number | null;
}

/**
 * A visible wall's picture along its Boundary over Section stations `[start, end]`: from `bottom` to `top` metres about
 * the road, in pattern entries repeating every `period` metres from `start` (each over `[from, to)` of the period), and the
 * bands of the whole period blended (`far`), for rows whose station footprint is wider than the shortest entry.
 */
export interface CourseWallAppearance {
  readonly boundary: CompiledBoundary;
  readonly start: number;
  readonly end: number;
  readonly top: number;
  readonly bottom: number;
  readonly period: number;
  readonly entries: readonly {
    readonly from: number;
    readonly to: number;
    readonly bands: readonly CourseWallBand[];
  }[];
  readonly shortestEntry: number;
  readonly far: readonly CourseWallBand[];
}

export interface CourseAppearance {
  readonly environments: readonly {
    readonly at: CompiledCoursePosition;
    readonly name: string;
    readonly background: {
      readonly asset: DecodedImage<TileBackgroundImage>;
      readonly horizonY: number;
      readonly pixelsPerRadian: number;
      readonly yawOriginRadians: number;
    };
  }[];
  readonly sprites: readonly {
    readonly instance: CourseSpriteResource;
    /** A state-selected sign names the fork exit Carriageway whose non-selection shows it; null is always shown. */
    readonly unselectedCarriagewayId: string | null;
    readonly at: CompiledCoursePosition;
    readonly l: number;
    readonly groundOffset: number;
  }[];
  /** The visible walls, in authored order; invisible walls draw nothing. */
  readonly walls: readonly CourseWallAppearance[];
}
