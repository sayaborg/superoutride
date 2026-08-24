import { guideCoordinateCurve, guideCoordinateLateralOrigin, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { FarBackground } from '../visual/far-background.js';
import { HeightProfile, type HeightNode } from '../visual/height-profile.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import { VisualProfile, type VisualSection } from '../visual/visual-profile.js';
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
  readonly heightProfile: HeightProfile;
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
const EPSILON = 1e-9;

/**
 * Compile declarative stage-local environment authoring against one active Guide coordinate frame.
 *
 * Authoring uses local l. The compiler performs the only lateral rebase needed for raster-attached
 * sprites, keeping content definitions independent from parent/source lateral origins.
 *
 * Height authoring describes change points rather than topology. If its last authored point precedes
 * the Guide endpoint, compilation explicitly extends that final height to s=L. The open HeightProfile
 * itself never guesses, clamps, or wraps missing endpoint data.
 */
export function compileStageEnvironment(
  coordinateFrame: GuideCoordinateSource,
  authoring: StageEnvironmentAuthoring,
): CompiledStageEnvironment {
  const guide = guideCoordinateCurve(coordinateFrame);
  const lateralOrigin = guideCoordinateLateralOrigin(coordinateFrame);
  const heightProfile = new HeightProfile(guide.length, compileOpenHeightNodes(guide.length, authoring.heightNodes));
  const visual = new VisualProfile(guide.length, authoring.visualSections);
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

function compileOpenHeightNodes(courseLength: number, nodes: readonly HeightNode[]): readonly HeightNode[] {
  if (nodes.length === 0) throw new Error('stage height authoring requires at least one node');
  const copied = nodes.map((node) => ({ ...node })).sort((a, b) => a.s - b.s);
  const last = copied.at(-1)!;
  if (last.s > courseLength + EPSILON) {
    throw new RangeError('stage height authoring extends beyond Guide endpoint');
  }
  if (Math.abs(last.s - courseLength) <= EPSILON) {
    copied[copied.length - 1] = { ...last, s: courseLength };
    return copied;
  }
  return [...copied, { s: courseLength, y: last.y }];
}
