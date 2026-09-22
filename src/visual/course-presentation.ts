import type { BandGround } from './band-ground.js';
import type { CompiledCarriageway } from '../course/course-regions.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import type { TileBackgroundDocument } from '../graphics/tile-background-image.js';
import { type SpriteLodDocument } from '../graphics/sprite.js';

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
  readonly ground: BandGround;
  readonly environments: readonly {
    readonly anchor: CompiledCourseAnchor;
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
    readonly anchor: CompiledCourseAnchor;
    readonly l: number;
    readonly groundOffset: number;
  }[];
}
