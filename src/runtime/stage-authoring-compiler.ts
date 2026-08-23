import { guideCoordinateCurve, guideCoordinateLateralOrigin, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { FarBackground } from '../visual/far-background.js';
import { CyclicHeightProfile, type HeightNode } from '../visual/height-profile.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import { CyclicVisualProfile, type VisualSection } from '../visual/visual-profile.js';
import { compileCourseSprite, type CourseSprite, type CourseSpriteAuthoring } from '../world/course-sprite.js';
import type { StageRuntimeContentPackage } from './stage-runtime-content.js';

export interface StageLocalSpriteAuthoring extends Omit<CourseSpriteAuthoring, 'l'> {
  /** Lateral position in the active stage chart, not the underlying raster source frame. */
  readonly l: number;
}

export interface StageEnvironmentAuthoring {
  readonly heightNodes: readonly HeightNode[];
  readonly visualSections: readonly VisualSection[];
  readonly sprites?: readonly StageLocalSpriteAuthoring[];
  readonly farBackground: FarBackground;
  readonly terrain?: Readonly<{
    dMin?: number;
    dMax?: number;
    groundLeft?: number;
    groundRight?: number;
    roadLeft?: number;
    roadRight?: number;
    thinSpanScreenRows?: number;
  }>;
}

export interface StageRuntimeSource {
  readonly packageId: string;
  readonly worldFrameId: string;
  readonly coordinateFrame: GuideCoordinateSource;
  readonly roadView: StageRoadView | null;
  readonly surfaceMap: SurfaceMapReader;
  readonly groundProfile: GroundMapProfile;
}

export interface CompiledStageEnvironment {
  readonly heightProfile: CyclicHeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly worldSprites: readonly CourseSprite[];
}

const DEFAULT_TERRAIN = Object.freeze({
  dMin: 2.5,
  dMax: 150,
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 3.5,
  roadRight: 3.5,
  thinSpanScreenRows: 1,
});

/**
 * Compile declarative stage-local environment authoring against one active Guide coordinate frame.
 *
 * Authoring uses local l. The compiler performs the only lateral rebase needed for raster-attached
 * sprites, keeping content definitions independent from parent/source lateral origins.
 */
export function compileStageEnvironment(
  coordinateFrame: GuideCoordinateSource,
  authoring: StageEnvironmentAuthoring,
): CompiledStageEnvironment {
  const guide = guideCoordinateCurve(coordinateFrame);
  const lateralOrigin = guideCoordinateLateralOrigin(coordinateFrame);
  const heightProfile = new CyclicHeightProfile(guide.length, authoring.heightNodes);
  const visual = new CyclicVisualProfile(guide.length, authoring.visualSections);
  const terrain = { ...DEFAULT_TERRAIN, ...authoring.terrain };
  const terrainProfile: TerrainVisualProfile = {
    screenHeight: 240,
    dMin: terrain.dMin,
    dMax: terrain.dMax,
    groundLeft: terrain.groundLeft,
    groundRight: terrain.groundRight,
    roadLeft: terrain.roadLeft,
    roadRight: terrain.roadRight,
    height: heightProfile,
    visual,
    thinSpanScreenRows: terrain.thinSpanScreenRows,
  };
  const worldSprites = Object.freeze((authoring.sprites ?? []).map((sprite) => compileCourseSprite(
    guide,
    heightProfile,
    { ...sprite, l: sprite.l + lateralOrigin },
  )));

  return Object.freeze({ heightProfile, terrainProfile, worldSprites });
}

/**
 * Compile one complete runtime package from source geometry/physics plus declarative environment.
 * This is content assembly only; route selection and renderer behavior remain outside the compiler.
 */
export function compileAuthoredStageRuntimePackage(
  source: StageRuntimeSource,
  authoring: StageEnvironmentAuthoring,
): StageRuntimeContentPackage {
  const environment = compileStageEnvironment(source.coordinateFrame, authoring);
  return Object.freeze({
    packageId: source.packageId,
    worldFrameId: source.worldFrameId,
    coordinateFrame: source.coordinateFrame,
    roadView: source.roadView,
    surfaceMap: source.surfaceMap,
    heightProfile: environment.heightProfile,
    terrainProfile: environment.terrainProfile,
    groundProfile: source.groundProfile,
    selectFarBackground: () => authoring.farBackground,
    worldSprites: environment.worldSprites,
  });
}
