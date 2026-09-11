import type { HeightProfileReader } from '../core/height-profile.js';
import type { GuideChart } from '../gameplay/guide-chart.js';
import type { GroundMapProfile } from '../groundmap/ground-map.js';
import type { SurfaceMap } from '../physics/surface-map.js';
import type { CourseSprite } from '../render/course-sprite.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { GuideChartRuntimePackage } from '../runtime/declarative-live-route.js';
import type { StageRuntimeContentPackage } from '../runtime/stage-runtime-content.js';
import type { FarBackground } from '../visual/far-background.js';

/** Shared source inputs for focused and production DEV stage compositions. */
export interface SharedRuntimeContent {
  readonly heightProfile: HeightProfileReader;
  readonly surfaceMap: SurfaceMap;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly selectFarBackground: (cameraS: number) => FarBackground;
  readonly worldSprites: readonly CourseSprite[];
}

export function chartPackage(runtime: StageRuntimeContentPackage): GuideChartRuntimePackage {
  const frame = runtime.coordinateFrame as Partial<GuideChart>;
  if (typeof frame.id !== 'string' || frame.guide === undefined || typeof frame.lateralOrigin !== 'number') {
    throw new RangeError(`runtime package must use a GuideChart coordinate frame: ${runtime.packageId}`);
  }
  return runtime as GuideChartRuntimePackage;
}
