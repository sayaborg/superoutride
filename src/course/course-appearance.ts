import type { CompiledCoursePosition } from './course-geometry.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { SpriteLodAsset } from '../image/sprite.js';
import type { CompiledBoundary } from './course-boundaries.js';
import type { StripGround } from './strip-ground.js';

/** Decoded image facet; a compiler's canonical asset record structurally supplies it. */
interface DecodedImage<Image> {
  readonly image: Image;
}

/** A placement's image: a course image. */
export type CourseSpriteImage = DecodedImage<SpriteLodAsset> & { readonly kind: 'sprite' };

export interface CourseSpriteResource<Image extends CourseSpriteImage = CourseSpriteImage> {
  readonly palette: string;
  readonly asset: Image;
}

/**
 * A visible wall's picture along its Boundary over Section stations `[start, end]`: its color Strip ground, read at station
 * `s - start` with height above the road as lateral, and the heights `bottom` to `top` its opaque Strips span.
 */
export interface CourseWallAppearance {
  readonly boundary: CompiledBoundary;
  readonly start: number;
  readonly end: number;
  readonly bottom: number;
  readonly top: number;
  readonly color: StripGround;
}

export interface CourseAppearance {
  readonly environments: readonly {
    readonly at: CompiledCoursePosition;
    readonly name: string;
    readonly background: {
      readonly asset: DecodedImage<TilePicture>;
      readonly horizonY: number;
      readonly yawOriginRadians: number;
    };
    /** Metres from the knot over which its background replaces the one before it; 0 at once. */
    readonly transition: number;
  }[];
  readonly sprites: readonly {
    readonly instance: CourseSpriteResource;
    /** A state-selected sign names the fork's exit Link whose non-selection shows it; null is always shown. */
    readonly unselectedLink: string | null;
    readonly at: CompiledCoursePosition;
    readonly l: number;
    readonly groundOffset: number;
    /** A movable placement's pictures while flying and once landed, in its palette; null for any other. */
    readonly knocked: {
      readonly airborne: CourseSpriteResource<CourseSpriteImage & { readonly kind: 'sprite' }>;
      readonly landed: CourseSpriteResource<CourseSpriteImage & { readonly kind: 'sprite' }>;
    } | null;
  }[];
  /** The visible walls, in authored order; invisible walls draw nothing. */
  readonly walls: readonly CourseWallAppearance[];
}
