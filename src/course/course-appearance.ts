import type { CompiledCoursePosition } from './course-geometry.js';
import type { TileBackgroundImage } from '../image/tile-background-image.js';
import type { SpriteAsset } from '../image/sprite.js';

/** Decoded image facet; a compiler's canonical asset record structurally supplies it. */
interface DecodedImage<Image> {
  readonly image: Image;
}

export interface CourseSpriteResource {
  readonly palette: string;
  readonly asset: DecodedImage<SpriteAsset>;
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
}
