import type { SurfaceMap } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { FarBackground } from '../visual/far-background.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { CourseSprite } from '../world/course-sprite.js';

/** Shared source inputs for focused and production DEV stage compositions. */
export interface SharedRuntimeContent {
  readonly heightProfile: HeightProfileReader;
  readonly surfaceMap: SurfaceMap;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly selectFarBackground: (cameraS: number) => FarBackground;
  readonly worldSprites: readonly CourseSprite[];
}
