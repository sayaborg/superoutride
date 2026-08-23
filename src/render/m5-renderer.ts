import type { GuideCurve } from '../core/guide-curve.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import { wrapAngle } from '../core/math.js';
import type { VehicleRenderReadState } from '../physics/vehicle-contract.js';
import { computeForwardVisibleInterval, generateTerrainLines, type M3TerrainLine, type TerrainVisualProfile } from '../road/terrain-line.js';
import { drawFarBackground, type FarBackground } from '../visual/far-background.js';
import { sampleGroundMap, type GroundMapProfile } from '../visual/ground-map.js';
import { selectVehicleSprite, type M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import { collectVisibleCourseSprites, type CourseSprite, type VisibleCourseSprite } from '../world/course-sprite.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { drawScaledSprite, type SpriteScanlineObserver } from './sprite.js';
import { SoftwareSurface } from './software-surface.js';

export type PlayerVisualKind = 'car' | 'bike';

export interface M5RenderResult {
  terrainLineCount: number;
  terrainOutputPixels: number;
  overdrawRows: number;
  visibleSpriteCount: number;
  spriteOutputSamples: number;
  spriteWrittenPixels: number;
  playerOutputSamples: number;
  playerWrittenPixels: number;
  activeSection: string;
  playerYawVariant: number;
  playerBankVariant: number;
  playerRelativeYaw: number;
  groundMapMaxLevel: number;
  groundMapBaked: boolean;

  /** M5.8 workload telemetry. Counters never alter draw/cull decisions. */
  terrainLineCountPerScreenRowMax: number;
  terrainOutputPixelsPerScreenRowMax: number;
  spriteOutputSamplesIncludingPlayer: number;
  spriteOutputSamplesPerScanlineMax: number;
  spriteWrittenPixelsIncludingPlayer: number;
  spriteWrittenPixelsPerScanlineMax: number;
  groundMapLevelHistogram: readonly number[];
}

export function renderM5Driving(
  target: SoftwareSurface,
  background: FarBackground,
  guide: GuideCurve,
  camera: PseudoCamera,
  vehicle: VehicleRenderReadState,
  terrainProfile: TerrainVisualProfile,
  groundProfile: GroundMapProfile,
  worldSprites: readonly CourseSprite[],
  assets: M4SpriteAssets,
  playerKind: PlayerVisualKind,
): M5RenderResult {
  drawFarBackground(target, background, camera);

  const terrain = generateTerrainLines(guide, camera, terrainProfile);
  const visible = computeForwardVisibleInterval(
    guide,
    camera.yaw,
    camera.s,
    terrainProfile.dMin,
    terrainProfile.dMax,
  );
  const sprites = visible
    ? collectVisibleCourseSprites(worldSprites, camera, visible.dStart, visible.dEnd)
    : [];

  const terrainLinesByRow = new Uint16Array(target.height);
  const terrainOutputByRow = new Uint32Array(target.height);
  const spriteOutputByScanline = new Uint32Array(target.height);
  const spriteWrittenByScanline = new Uint32Array(target.height);
  const groundMapLevelHistogram = new Uint32Array((groundProfile.baked?.kMax ?? 0) + 1);
  let terrainOutputPixels = 0;
  let spriteOutputSamples = 0;
  let spriteWrittenPixels = 0;
  let groundMapMaxLevel = 0;

  const spriteObserver: SpriteScanlineObserver = (screenY, outputSamples, writtenPixels) => {
    if (screenY < 0 || screenY >= target.height) return;
    spriteOutputByScanline[screenY]! += outputSamples;
    spriteWrittenByScanline[screenY]! += writtenPixels;
  };

  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
      terrainLinesByRow[line.y]! += 1;
      const stats = drawTerrainLine(target, line, groundProfile);
      terrainOutputPixels += stats.outputPixels;
      terrainOutputByRow[line.y]! += stats.outputPixels;
      groundMapMaxLevel = Math.max(groundMapMaxLevel, stats.groundMapLevel);
      groundMapLevelHistogram[stats.groundMapLevel]! += 1;
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite, spriteObserver);
      spriteOutputSamples += stats.outputSamples;
      spriteWrittenPixels += stats.writtenPixels;
    },
  );

  const playerProjection = pseudoProject(
    { x: vehicle.x, y: vehicle.y, z: vehicle.z, s: vehicle.course.s },
    camera,
  );
  const playerSet = playerKind === 'bike' ? assets.bike : assets.car;
  const relativeYaw = wrapAngle(vehicle.yaw - camera.yaw);
  const normalizedBank = playerKind === 'bike' ? vehicle.sprungRoll / 0.55 : 0;
  const selected = selectVehicleSprite(playerSet, relativeYaw, normalizedBank);
  const playerStats = drawScaledSprite(
    target,
    selected.asset,
    playerProjection.x,
    playerProjection.y,
    playerProjection.scale,
    spriteObserver,
  );

  let overdrawRows = 0;
  let terrainLineCountPerScreenRowMax = 0;
  let terrainOutputPixelsPerScreenRowMax = 0;
  let spriteOutputSamplesPerScanlineMax = 0;
  let spriteWrittenPixelsPerScanlineMax = 0;
  for (let y = 0; y < target.height; y += 1) {
    const terrainLines = terrainLinesByRow[y]!;
    if (terrainLines > 1) overdrawRows += 1;
    terrainLineCountPerScreenRowMax = Math.max(terrainLineCountPerScreenRowMax, terrainLines);
    terrainOutputPixelsPerScreenRowMax = Math.max(terrainOutputPixelsPerScreenRowMax, terrainOutputByRow[y]!);
    spriteOutputSamplesPerScanlineMax = Math.max(spriteOutputSamplesPerScanlineMax, spriteOutputByScanline[y]!);
    spriteWrittenPixelsPerScanlineMax = Math.max(spriteWrittenPixelsPerScanlineMax, spriteWrittenByScanline[y]!);
  }

  return {
    terrainLineCount: terrain.length,
    terrainOutputPixels,
    overdrawRows,
    visibleSpriteCount: sprites.length,
    spriteOutputSamples,
    spriteWrittenPixels,
    playerOutputSamples: playerStats.outputSamples,
    playerWrittenPixels: playerStats.writtenPixels,
    activeSection: terrainProfile.visual.sample(vehicle.course.s).name,
    playerYawVariant: selected.yawIndex,
    playerBankVariant: selected.bankIndex,
    playerRelativeYaw: relativeYaw,
    groundMapMaxLevel,
    groundMapBaked: groundProfile.baked !== undefined,
    terrainLineCountPerScreenRowMax,
    terrainOutputPixelsPerScreenRowMax,
    spriteOutputSamplesIncludingPlayer: spriteOutputSamples + playerStats.outputSamples,
    spriteOutputSamplesPerScanlineMax,
    spriteWrittenPixelsIncludingPlayer: spriteWrittenPixels + playerStats.writtenPixels,
    spriteWrittenPixelsPerScanlineMax,
    groundMapLevelHistogram: Array.from(groundMapLevelHistogram),
  };
}

function drawTerrainLine(
  target: SoftwareSurface,
  line: M3TerrainLine,
  groundProfile: GroundMapProfile,
): { outputPixels: number; groundMapLevel: number } {
  let outputPixels = 0;
  const leftEdge = Math.ceil(line.xGroundL);
  const rightEdge = Math.floor(line.xGroundR);
  const baked = groundProfile.baked;
  const groundMapLevel = baked?.selectLevel(line.sourceFootprint.deltaSEffective) ?? 0;

  if (line.groundBaseLeft.kind === 'color') {
    const right = Math.min(target.width - 1, leftEdge - 1);
    if (right >= 0) {
      target.fillSpan(line.y, 0, right, line.groundBaseLeft.color);
      outputPixels += right + 1;
    }
  }

  const x0 = Math.max(0, leftEdge);
  const x1 = Math.min(target.width - 1, rightEdge);
  if (x1 >= x0) {
    const dx = line.xGroundR - line.xGroundL;
    if (Math.abs(dx) >= 1e-8) {
      let lateral = -groundProfile.groundLeft
        + ((x0 + 0.5 - line.xGroundL) / dx) * (groundProfile.groundLeft + groundProfile.groundRight);
      const lateralStep = (groundProfile.groundLeft + groundProfile.groundRight) / dx;
      const cliffSection = line.groundBaseLeft.kind === 'transparent';
      const offset = line.y * target.width;
      for (let x = x0; x <= x1; x += 1) {
        target.pixels[offset + x] = baked
          ? baked.sampleAtLevel(line.s, lateral, groundMapLevel)
          : sampleGroundMap(line.s, lateral, groundProfile, cliffSection);
        lateral += lateralStep;
      }
      outputPixels += x1 - x0 + 1;
    }
  }

  if (line.groundBaseRight.kind === 'color') {
    const left = Math.max(0, rightEdge + 1);
    if (left < target.width) {
      target.fillSpan(line.y, left, target.width - 1, line.groundBaseRight.color);
      outputPixels += target.width - left;
    }
  }

  return { outputPixels, groundMapLevel };
}

function drawWorldSprite(
  target: SoftwareSurface,
  sprite: VisibleCourseSprite,
  scanlineObserver?: SpriteScanlineObserver,
) {
  return drawScaledSprite(
    target,
    sprite.asset,
    sprite.projection.x,
    sprite.projection.y,
    sprite.projection.scale,
    scanlineObserver,
  );
}
