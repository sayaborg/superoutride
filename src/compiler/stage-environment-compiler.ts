import type { GuideCurve } from '../core/guide-curve.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { SpriteAsset } from '../render/sprite.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import { CyclicHeightProfile, type HeightNode } from '../visual/height-profile.js';
import { CyclicVisualProfile, type VisualSection } from '../visual/visual-profile.js';
import { compileCourseSprite, type CourseSprite } from '../world/course-sprite.js';

export interface StageEnvironmentSpriteAuthoring {
  readonly name: string;
  readonly s: number;
  /** Stage-local lateral coordinate. The compiler applies roadView.sourceLateralOrigin once. */
  readonly l: number;
  readonly assetId: string;
}

export interface StageEnvironmentTerrainAuthoring {
  readonly screenHeight: number;
  readonly dMin: number;
  readonly dMax: number;
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly roadLeft: number;
  readonly roadRight: number;
  readonly thinSpanScreenRows: number;
}

export interface StageEnvironmentAuthoring {
  readonly id: string;
  readonly heightNodes: readonly HeightNode[];
  readonly visualSections: readonly VisualSection[];
  readonly terrain: StageEnvironmentTerrainAuthoring;
  readonly sprites: readonly StageEnvironmentSpriteAuthoring[];
}

export type StageEnvironmentAssetLibrary = Readonly<Record<string, SpriteAsset>>;

export interface StageEnvironmentCompileSource {
  readonly guide: GuideCurve;
  readonly roadView: StageRoadView;
}

export interface CompiledStageEnvironment {
  readonly id: string;
  readonly heightProfile: CyclicHeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly worldSprites: readonly CourseSprite[];
}

/**
 * Compile serializable-ish stage environment authoring into the existing runtime source types.
 *
 * This compiler deliberately knows nothing about RouteDag, activePackageId, camera, projection or
 * renderer decisions. It only resolves stage-local authoring against one already-compiled Guide and
 * StageRoadView. Runtime depth/Y/Painter behavior therefore remains entirely in the existing Core.
 */
export function compileStageEnvironment(
  source: StageEnvironmentCompileSource,
  authoring: StageEnvironmentAuthoring,
  assets: StageEnvironmentAssetLibrary,
): CompiledStageEnvironment {
  validateAuthoring(source, authoring, assets);

  const heightProfile = new CyclicHeightProfile(source.guide.length, authoring.heightNodes);
  const visual = new CyclicVisualProfile(source.guide.length, authoring.visualSections);
  const terrainProfile: TerrainVisualProfile = Object.freeze({
    screenHeight: authoring.terrain.screenHeight,
    dMin: authoring.terrain.dMin,
    dMax: authoring.terrain.dMax,
    groundLeft: authoring.terrain.groundLeft,
    groundRight: authoring.terrain.groundRight,
    roadLeft: authoring.terrain.roadLeft,
    roadRight: authoring.terrain.roadRight,
    height: heightProfile,
    visual,
    thinSpanScreenRows: authoring.terrain.thinSpanScreenRows,
  });

  const worldSprites = Object.freeze(authoring.sprites.map((entry) => {
    const asset = assets[entry.assetId]!;
    return compileCourseSprite(source.guide, heightProfile, {
      name: entry.name,
      s: entry.s,
      l: source.roadView.sourceLateralOrigin + entry.l,
      asset,
    });
  }));

  return Object.freeze({
    id: authoring.id,
    heightProfile,
    terrainProfile,
    worldSprites,
  });
}

function validateAuthoring(
  source: StageEnvironmentCompileSource,
  authoring: StageEnvironmentAuthoring,
  assets: StageEnvironmentAssetLibrary,
): void {
  if (authoring.id.trim().length === 0) throw new Error('stage environment id must not be empty');
  if (!(source.guide.length > 0)) throw new RangeError('stage environment requires a positive Guide length');

  const terrain = authoring.terrain;
  if (!(terrain.screenHeight > 0)) throw new RangeError('stage terrain screenHeight must be > 0');
  if (!(terrain.dMin > 0 && terrain.dMax > terrain.dMin)) {
    throw new RangeError('stage terrain depth range must satisfy 0 < dMin < dMax');
  }
  if (!(terrain.groundLeft > 0 && terrain.groundRight > 0)) {
    throw new RangeError('stage terrain ground extents must be > 0');
  }
  if (!(terrain.roadLeft > 0 && terrain.roadRight > 0)) {
    throw new RangeError('stage terrain road extents must be > 0');
  }
  if (!(terrain.thinSpanScreenRows >= 1)) {
    throw new RangeError('stage terrain thinSpanScreenRows must be >= 1');
  }

  const names = new Set<string>();
  for (const sprite of authoring.sprites) {
    if (sprite.name.trim().length === 0) throw new Error('stage sprite name must not be empty');
    if (names.has(sprite.name)) throw new Error(`duplicate stage sprite name: ${sprite.name}`);
    names.add(sprite.name);
    if (!(sprite.s >= 0 && sprite.s < source.guide.length)) {
      throw new RangeError(`stage sprite outside Guide chainage: ${sprite.name}`);
    }
    if (!Number.isFinite(sprite.l)) throw new RangeError(`stage sprite lateral must be finite: ${sprite.name}`);
    if (assets[sprite.assetId] === undefined) {
      throw new Error(`unknown stage sprite asset: ${sprite.assetId}`);
    }
  }
}
