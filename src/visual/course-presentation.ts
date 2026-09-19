import type { CompiledBand, CompiledBandPartition } from '../course/course-bands.js';
import type { CompiledCourseAnchor } from '../course/course-geometry.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../graphics/sprite.js';

/** Ordinary indexed-image facet; a compiler's canonical asset record structurally supplies it. */
interface IndexedSource {
  readonly source: SpriteLodDocument;
}

/** Full billboard extent about its anchor, including transparent margins; no opaque-bounds shortcut. */
export function courseSceneryAnchorReach(presentations: readonly CoursePresentation[]): number {
  let reach = 0;
  for (const presentation of presentations)
    for (const placement of presentation.scenery) {
      const image = placement.instance.asset.source;
      reach = Math.max(reach, Math.abs(image.anchorX + 0.5), Math.abs(image.width - image.anchorX - 0.5));
    }
  return reach / SPRITE_SOURCE_TEXELS_PER_METER;
}

export interface CoursePaint {
  readonly asset: IndexedSource;
  readonly phaseS: number;
  readonly phaseL: number;
  readonly alternate: null | {
    readonly paletteRgb555: readonly number[];
    readonly spanS: number;
    readonly spanL: number;
  };
}
export interface CourseGroundSourceData {
  readonly partition: CompiledBandPartition;
  readonly left: number;
  readonly right: number;
  readonly baseRgb555: number;
  readonly bands: readonly {
    readonly band: CompiledBand;
    readonly sections: readonly { readonly anchor: CompiledCourseAnchor; readonly paint: CoursePaint | null }[];
  }[];
  readonly stamps: readonly {
    readonly id: string;
    readonly asset: IndexedSource;
    readonly anchor: CompiledCourseAnchor;
    readonly l: number;
    readonly gridS: number;
    readonly gridL: number;
  }[];
}

export interface CourseSceneryInstance {
  readonly id: string;
  readonly asset: IndexedSource;
}

export interface CoursePresentation {
  readonly ground: CourseGroundSourceData;
  readonly environments: readonly {
    readonly anchor: CompiledCourseAnchor;
    readonly name: string;
    readonly groundBaseLeft: number | null;
    readonly groundBaseRight: number | null;
    readonly background: {
      readonly asset: IndexedSource;
      readonly horizonY: number;
      readonly pixelsPerRadian: number;
      readonly yawOriginRadians: number;
    };
  }[];
  readonly scenery: readonly {
    readonly id: string;
    readonly instance: CourseSceneryInstance;
    readonly anchor: CompiledCourseAnchor;
    readonly l: number;
    readonly groundOffset: number;
  }[];
}
