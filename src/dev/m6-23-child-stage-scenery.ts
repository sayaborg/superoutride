import { createStageRoadView, type StageRoadView } from '../course/stage-road-view.js';
import { createSpriteAsset, SPRITE_TRANSPARENT, type SpriteAsset } from '../render/sprite.js';
import { rgba } from '../render/software-surface.js';
import type { TerrainVisualProfile } from '../road/terrain-line.js';
import type { GroundMapProfile } from '../visual/ground-map.js';
import { CyclicHeightProfile } from '../visual/height-profile.js';
import { CyclicVisualProfile } from '../visual/visual-profile.js';
import { compileCourseSprite, type CourseSprite } from '../world/course-sprite.js';
import { M6_22_CHILD_FINISH_S, type M622ChildStageContinuation, type M622ChildStageRuntimeSource } from './m6-22-child-stage-continuation.js';

export interface M623ChildStageScenerySource {
  readonly roadView: StageRoadView;
  readonly heightProfile: CyclicHeightProfile;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly worldSprites: readonly CourseSprite[];
}

export interface M623ChildStageScenery {
  readonly left: M623ChildStageScenerySource;
  readonly right: M623ChildStageScenerySource;
}

/**
 * M6.23 adds package-owned scenery only. Geometry, physics maps, route gates and renderer Core stay
 * exactly on the M6.22 paths. LEFT becomes a low coastal road with ocean exposure and a lighthouse;
 * RIGHT climbs into a mountain pass with rock ground base and warning pylons.
 */
export function createM623ChildStageScenery(
  continuation: M622ChildStageContinuation,
): M623ChildStageScenery {
  const assets = createM623LandmarkAssets();
  return Object.freeze({
    left: createCoastScenery(continuation, continuation.left, assets),
    right: createMountainScenery(continuation, continuation.right, assets),
  });
}

function createCoastScenery(
  continuation: M622ChildStageContinuation,
  source: M622ChildStageRuntimeSource,
  assets: M623LandmarkAssets,
): M623ChildStageScenerySource {
  const heightProfile = childHeightProfile(
    source.guide.length,
    continuation.handoffLocalS,
    -1.5,
    0,
  );
  const visual = new CyclicVisualProfile(source.guide.length, [{
    sStart: 0,
    name: 'LEFT COAST / OCEAN',
    groundBaseLeft: { kind: 'transparent' },
    groundBaseRight: { kind: 'color', color: rgba(47, 96, 55) },
  }]);
  const terrainProfile = cloneTerrainProfile(source.terrainProfile, heightProfile, visual);
  const worldSprites = Object.freeze([
    stageSprite(source, heightProfile, 'LEFT LIGHTHOUSE', M6_22_CHILD_FINISH_S - 78, 4.2, assets.lighthouse),
    stageSprite(source, heightProfile, 'LEFT PALM A', M6_22_CHILD_FINISH_S - 145, 4.0, assets.palm),
    stageSprite(source, heightProfile, 'LEFT PALM B', M6_22_CHILD_FINISH_S - 120, 4.25, assets.palm),
  ]);
  return freezeScenerySource(source, heightProfile, terrainProfile, source.groundProfile, worldSprites);
}

function createMountainScenery(
  continuation: M622ChildStageContinuation,
  source: M622ChildStageRuntimeSource,
  assets: M623LandmarkAssets,
): M623ChildStageScenerySource {
  const heightProfile = childHeightProfile(
    source.guide.length,
    continuation.handoffLocalS,
    7.5,
    13,
  );
  const visual = new CyclicVisualProfile(source.guide.length, [{
    sStart: 0,
    name: 'RIGHT MOUNTAIN PASS',
    groundBaseLeft: { kind: 'color', color: rgba(82, 77, 67) },
    groundBaseRight: { kind: 'color', color: rgba(69, 72, 63) },
  }]);
  const terrainProfile = cloneTerrainProfile(source.terrainProfile, heightProfile, visual);
  const worldSprites = Object.freeze([
    stageSprite(source, heightProfile, 'RIGHT PYLON L1', M6_22_CHILD_FINISH_S - 142, -4.15, assets.pylon),
    stageSprite(source, heightProfile, 'RIGHT PYLON R1', M6_22_CHILD_FINISH_S - 142, 4.15, assets.pylon),
    stageSprite(source, heightProfile, 'RIGHT PASS SIGN', M6_22_CHILD_FINISH_S - 82, 4.1, assets.passSign),
  ]);
  return freezeScenerySource(source, heightProfile, terrainProfile, source.groundProfile, worldSprites);
}

function childHeightProfile(
  courseLength: number,
  handoffS: number,
  midHeight: number,
  finishHeight: number,
): CyclicHeightProfile {
  if (!(handoffS > 0 && handoffS < M6_22_CHILD_FINISH_S)) {
    throw new RangeError('M6.23 requires handoff before child FINISH');
  }
  const midS = handoffS + (M6_22_CHILD_FINISH_S - handoffS) * 0.52;
  const tailS = Math.min(courseLength - 1, M6_22_CHILD_FINISH_S + 70);
  if (!(tailS > M6_22_CHILD_FINISH_S)) throw new RangeError('M6.23 child course has no post-finish tail');
  return new CyclicHeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: handoffS, y: 0 },
    { s: midS, y: midHeight },
    { s: M6_22_CHILD_FINISH_S, y: finishHeight },
    { s: tailS, y: 0 },
  ]);
}

function cloneTerrainProfile(
  base: TerrainVisualProfile,
  height: CyclicHeightProfile,
  visual: CyclicVisualProfile,
): TerrainVisualProfile {
  return Object.freeze({
    ...base,
    height,
    visual,
  });
}

function freezeScenerySource(
  source: M622ChildStageRuntimeSource,
  heightProfile: CyclicHeightProfile,
  terrainProfile: TerrainVisualProfile,
  groundProfile: GroundMapProfile,
  worldSprites: readonly CourseSprite[],
): M623ChildStageScenerySource {
  // Keep the proven M6.22 lateral corridor. Only presentation/height ownership changes here.
  const roadView = createStageRoadView({ ...source.roadView });
  return Object.freeze({ roadView, heightProfile, terrainProfile, groundProfile, worldSprites });
}

function stageSprite(
  source: M622ChildStageRuntimeSource,
  height: CyclicHeightProfile,
  name: string,
  s: number,
  localL: number,
  asset: SpriteAsset,
): CourseSprite {
  return compileCourseSprite(source.guide, height, {
    name,
    s,
    l: source.chart.lateralOrigin + localL,
    asset,
  });
}

interface M623LandmarkAssets {
  readonly lighthouse: SpriteAsset;
  readonly palm: SpriteAsset;
  readonly pylon: SpriteAsset;
  readonly passSign: SpriteAsset;
}

function createM623LandmarkAssets(): M623LandmarkAssets {
  const white = rgba(232, 232, 218);
  const red = rgba(190, 54, 48);
  const dark = rgba(42, 47, 46);
  const green = rgba(46, 105, 57);
  const brown = rgba(91, 65, 43);
  const amber = rgba(224, 143, 45);
  const gray = rgba(108, 104, 92);
  const yellow = rgba(226, 196, 60);

  const lighthouse = makeAsset('M623_LIGHTHOUSE', 12, 30, 4.5, (x, y) => {
    if (y < 4 && x >= 3 && x <= 8) return red;
    if (y >= 4 && y < 7 && x >= 2 && x <= 9) return dark;
    if (y >= 7 && y < 28 && x >= 4 && x <= 7) return ((y >> 2) & 1) === 0 ? white : red;
    if (y >= 28 && x >= 3 && x <= 8) return dark;
    return SPRITE_TRANSPARENT;
  });
  const palm = makeAsset('M623_PALM', 14, 24, 5.5, (x, y) => {
    if (y >= 8 && x >= 6 && x <= 7) return brown;
    if (y < 10 && (Math.abs(x - 6.5) + y * 0.7 < 8 || Math.abs(x - 6.5) < 2)) return green;
    return SPRITE_TRANSPARENT;
  });
  const pylon = makeAsset('M623_PYLON', 8, 16, 1.8, (x, y) => {
    if (y >= 3 && x >= 2 && x <= 5) return ((y >> 2) & 1) === 0 ? amber : white;
    if (y >= 14 && x >= 1 && x <= 6) return dark;
    return SPRITE_TRANSPARENT;
  });
  const passSign = makeAsset('M623_PASS_SIGN', 16, 15, 4.5, (x, y) => {
    if (y >= 2 && y <= 9 && x >= 1 && x <= 14) {
      if (x === 1 || x === 14 || y === 2 || y === 9) return yellow;
      return gray;
    }
    if (y >= 10 && x >= 7 && x <= 8) return dark;
    return SPRITE_TRANSPARENT;
  });
  return Object.freeze({ lighthouse, palm, pylon, passSign });
}

function makeAsset(
  name: string,
  width: number,
  height: number,
  worldWidthMeters: number,
  pixel: (x: number, y: number) => number,
): SpriteAsset {
  const pixels = new Uint32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels[y * width + x] = pixel(x, y) >>> 0;
  }
  return createSpriteAsset(name, width, height, pixels, undefined, undefined, worldWidthMeters);
}
