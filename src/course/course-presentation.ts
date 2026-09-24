import type { CompiledCarriageway } from './course-regions.js';
import type { CompiledCoursePosition } from './course-geometry.js';
import type { TileBackgroundDocument } from '../image/tile-background-image.js';
import { type SpriteLodDocument } from '../image/sprite.js';

/** Ordinary indexed-image facet; a compiler's canonical asset record structurally supplies it. */
interface IndexedSource {
  readonly source: SpriteLodDocument;
}

export interface CourseSceneryInstance {
  readonly id: string;
  readonly paletteRgb555: readonly number[] | null;
  readonly asset: IndexedSource;
}

export interface CoursePresentation {
  readonly environments: readonly {
    readonly at: CompiledCoursePosition;
    readonly name: string;
    readonly background: {
      readonly asset: { readonly source: TileBackgroundDocument };
      readonly horizonY: number;
      readonly pixelsPerRadian: number;
      readonly yawOriginRadians: number;
    };
  }[];
  readonly scenery: readonly {
    readonly id: string;
    readonly instance: CourseSceneryInstance;
    readonly unselected: CompiledCarriageway | null;
    readonly at: CompiledCoursePosition;
    readonly l: number;
    readonly groundOffset: number;
  }[];
}
