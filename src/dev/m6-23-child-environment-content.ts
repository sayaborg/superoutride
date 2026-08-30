import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import {
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../core/presentation-scale.js';
import { HeightProfile } from '../visual/height-profile.js';
import { VisualProfile } from '../visual/visual-profile.js';
import { rgba } from '../render/software-surface.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import { compileCourseSprite, type CourseSprite, type CourseSpriteAuthoring } from '../world/course-sprite.js';
import type {
  M622ChildStageContinuation,
  M622ChildStageRuntimeSource,
} from './m6-22-child-stage-continuation.js';

const TERRAIN_D_MIN = CURRENT_RENDER_NEAR_DEPTH_METERS;
const TERRAIN_D_MAX = CURRENT_RENDER_FAR_DEPTH_METERS;
const GROUND_HALF_WIDTH = 12;
const ROAD_HALF_WIDTH = 3.5;
const SHARED_FLAT_END_S = 60;

export interface M623ChildEnvironment {
  readonly heightProfile: HeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly worldSprites: readonly CourseSprite[];
}

export interface M623ChildEnvironmentContent {
  readonly left: M623ChildEnvironment;
  readonly right: M623ChildEnvironment;
}

/**
 * Package-owned post-handoff scenery. The first 60 child meters stay at the M6.22 shared height
 * datum, comfortably beyond the handoff camera neighborhood; identity begins farther downstage.
 * All sprites are compiled directly into the selected child's own chainage/world geometry.
 */
export function createM623ChildEnvironmentContent(
  continuation: M622ChildStageContinuation,
  assets: M4SpriteAssets,
): M623ChildEnvironmentContent {
  if (!(continuation.handoffLocalS + 5 < SHARED_FLAT_END_S)) {
    throw new Error('M6.23 child scenery must begin after the D_cam handoff neighborhood');
  }

  return Object.freeze({
    left: createCoastEnvironment(continuation.left, assets),
    right: createMountainEnvironment(continuation.right, assets),
  });
}

function createCoastEnvironment(
  source: M622ChildStageRuntimeSource,
  assets: M4SpriteAssets,
): M623ChildEnvironment {
  const heightProfile = new HeightProfile(source.guide.length, [
    { s: 0, y: 0 },
    { s: SHARED_FLAT_END_S, y: 0 },
    { s: 105, y: -1.5 },
    { s: 155, y: 1.0 },
    { s: 215, y: 0 },
    { s: Math.min(source.guide.length - 1, 285), y: 0 },
    { s: source.guide.length, y: 0 },
  ]);
  const visual = new VisualProfile(source.guide.length, [{
    sStart: 0,
    name: 'LEFT_COAST_STAGE',
    groundBaseLeft: { kind: 'color', color: rgba(194, 169, 102) },
    groundBaseRight: { kind: 'color', color: rgba(72, 126, 69) },
  }]);
  const terrainProfile = terrain(heightProfile, visual);
  const origin = source.roadView.sourceLateralOrigin;
  const authoring: CourseSpriteAuthoring[] = [
    { name: 'COAST_SIGN_1', s: 82, l: origin + 5.2, asset: assets.sign },
    { name: 'COAST_GUARD_1', s: 112, l: origin - 5.0, asset: assets.guardrail },
    { name: 'COAST_GUARD_2', s: 145, l: origin - 5.0, asset: assets.guardrail },
    { name: 'COAST_BUILDING', s: 188, l: origin + 7.0, asset: assets.building },
    { name: 'COAST_GUARD_3', s: 224, l: origin - 5.0, asset: assets.guardrail },
  ];
  return Object.freeze({
    heightProfile,
    terrainProfile,
    worldSprites: Object.freeze(authoring.map((entry) => compileCourseSprite(source.guide, heightProfile, entry))),
  });
}

function createMountainEnvironment(
  source: M622ChildStageRuntimeSource,
  assets: M4SpriteAssets,
): M623ChildEnvironment {
  const heightProfile = new HeightProfile(source.guide.length, [
    { s: 0, y: 0 },
    { s: SHARED_FLAT_END_S, y: 0 },
    { s: 105, y: 4 },
    { s: 150, y: 9 },
    { s: 195, y: 3 },
    { s: 245, y: 7 },
    { s: Math.min(source.guide.length - 1, 295), y: 0 },
    { s: source.guide.length, y: 0 },
  ]);
  const visual = new VisualProfile(source.guide.length, [{
    sStart: 0,
    name: 'RIGHT_MOUNTAIN_STAGE',
    groundBaseLeft: { kind: 'color', color: rgba(47, 76, 48) },
    groundBaseRight: { kind: 'color', color: rgba(58, 82, 52) },
  }]);
  const terrainProfile = terrain(heightProfile, visual);
  const origin = source.roadView.sourceLateralOrigin;
  const authoring: CourseSpriteAuthoring[] = [
    { name: 'MOUNTAIN_TREE_1', s: 78, l: origin - 5.3, asset: assets.tree },
    { name: 'MOUNTAIN_TREE_2', s: 101, l: origin + 5.4, asset: assets.tree },
    { name: 'MOUNTAIN_TREE_3', s: 128, l: origin - 5.5, asset: assets.tree },
    { name: 'MOUNTAIN_SIGN', s: 162, l: origin + 5.0, asset: assets.sign },
    { name: 'MOUNTAIN_TREE_4', s: 193, l: origin + 5.6, asset: assets.tree },
    { name: 'MOUNTAIN_TREE_5', s: 226, l: origin - 5.4, asset: assets.tree },
    { name: 'MOUNTAIN_BUILDING', s: 268, l: origin + 7.2, asset: assets.building },
  ];
  return Object.freeze({
    heightProfile,
    terrainProfile,
    worldSprites: Object.freeze(authoring.map((entry) => compileCourseSprite(source.guide, heightProfile, entry))),
  });
}

function terrain(
  height: HeightProfile,
  visual: VisualProfile,
): TerrainVisualProfile {
  return {
    screenHeight: 240,
    dMin: TERRAIN_D_MIN,
    dMax: TERRAIN_D_MAX,
    groundLeft: GROUND_HALF_WIDTH,
    groundRight: GROUND_HALF_WIDTH,
    roadLeft: ROAD_HALF_WIDTH,
    roadRight: ROAD_HALF_WIDTH,
    height,
    visual,
    thinSpanScreenRows: 1,
  };
}
