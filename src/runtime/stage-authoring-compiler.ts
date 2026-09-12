import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { HeightProfile, type HeightNode, type HeightProfileReader } from '../core/height-profile.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
  LOGICAL_HEIGHT,
} from '../core/presentation-scale.js';
import { SOURCE_ENDPOINT_TOLERANCE_METERS } from '../core/tolerances.js';
import { positiveFinite } from '../core/validation.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { GroundMapProfile } from '../groundmap/ground-map.js';
import { validateSurfaceGuideEnvelope } from '../physics/surface-guide-envelope.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import { compileCourseSprite, type CourseSprite, type CourseSpriteAuthoring } from '../render/course-sprite.js';
import { DEFAULT_THIN_SPAN_SCREEN_ROWS, type TerrainVisualProfile } from '../road/terrain-line.js';
import type { FarBackground } from '../visual/far-background.js';
import { VisualProfile, type VisualSection, type VisualProfileReader } from '../visual/visual-profile.js';
import type { StageRuntimeContentPackage } from './stage-runtime-content.js';

interface StageLocalSpriteAuthoring extends Omit<CourseSpriteAuthoring, 'l'> {
  /** Lateral position in the active stage chart, not the underlying raster source frame. */
  readonly l: number;
}

export interface StageEnvironmentAuthoring {
  readonly heightNodes: readonly HeightNode[];
  readonly visualSections: readonly VisualSection[];
  readonly sprites?: readonly StageLocalSpriteAuthoring[];
  readonly farBackground: FarBackground;
  readonly terrain: Readonly<{
    dMin?: number;
    dMax?: number;
    groundLeft: number;
    groundRight: number;
    roadLeft: number;
    roadRight: number;
    thinSpanScreenRows?: number;
  }>;
}

interface StageRuntimeSource {
  readonly packageId: string;
  readonly worldFrameId: string;
  readonly coordinateFrame: GuideCoordinateSource;
  readonly roadView: StageRoadView | null;
  readonly surfaceMap: SurfaceMapReader;
  readonly groundProfile: GroundMapProfile;
}

interface CompiledStageEnvironment {
  readonly heightProfile: HeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly worldSprites: readonly CourseSprite[];
}

const DEFAULT_TERRAIN = Object.freeze({
  dMin: CURRENT_RENDER_NEAR_DEPTH_METERS,
  dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
  thinSpanScreenRows: DEFAULT_THIN_SPAN_SCREEN_ROWS,
});

/** Compile one immutable terrain reader from authored widths and source profiles. */
export function createTerrainVisualProfile(
  widths: Pick<GroundMapProfile, 'groundLeft' | 'groundRight' | 'roadLeft' | 'roadRight'>,
  height: HeightProfileReader,
  visual: VisualProfileReader,
  options: Pick<StageEnvironmentAuthoring['terrain'], 'dMin' | 'dMax' | 'thinSpanScreenRows'> = {},
): TerrainVisualProfile {
  if (!widths) throw new RangeError('stage terrain widths must be authored');
  const terrain = { ...DEFAULT_TERRAIN, ...options };
  for (const key of ['groundLeft', 'groundRight', 'roadLeft', 'roadRight'] as const) {
    positiveFinite(widths[key], `terrain ${key}`);
  }
  positiveFinite(terrain.dMin, 'near draw distance');
  positiveFinite(terrain.dMax, 'far draw distance');
  if (terrain.dMax <= terrain.dMin) throw new RangeError('far draw distance must exceed near draw distance');
  return Object.freeze({
    screenHeight: LOGICAL_HEIGHT,
    dMin: terrain.dMin,
    dMax: terrain.dMax,
    groundLeft: widths.groundLeft,
    groundRight: widths.groundRight,
    roadLeft: widths.roadLeft,
    roadRight: widths.roadRight,
    height,
    visual,
    thinSpanScreenRows: terrain.thinSpanScreenRows,
  });
}

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
  const terrainProfile = createTerrainVisualProfile(authoring.terrain, heightProfile, visual, authoring.terrain);
  const worldSprites = Object.freeze(
    (authoring.sprites ?? []).map((sprite) =>
      compileCourseSprite(guide, heightProfile, { ...sprite, l: sprite.l + lateralOrigin }),
    ),
  );

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
  validateSurfaceGuideEnvelope(source.coordinateFrame, source.surfaceMap);
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
  if (last.s > courseLength + SOURCE_ENDPOINT_TOLERANCE_METERS) {
    throw new RangeError('stage height authoring extends beyond Guide endpoint');
  }
  if (Math.abs(last.s - courseLength) <= SOURCE_ENDPOINT_TOLERANCE_METERS) {
    copied[copied.length - 1] = { ...last, s: courseLength };
    return copied;
  }
  return [...copied, { s: courseLength, y: last.y }];
}
