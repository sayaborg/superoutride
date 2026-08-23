import type { GuideCurve } from '../core/guide-curve.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import { wrapAngle } from '../core/math.js';
import type { M5CarState } from '../physics/car-physics.js';
import { computeForwardVisibleInterval, generateTerrainLines, type M3TerrainLine, type TerrainVisualProfile } from '../road/terrain-line.js';
import { drawFarBackground, type FarBackground } from '../visual/far-background.js';
import { sampleGroundMap, type GroundMapProfile } from '../visual/ground-map.js';
import { selectVehicleSprite, type M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import { collectVisibleCourseSprites, type CourseSprite, type VisibleCourseSprite } from '../world/course-sprite.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { drawScaledSprite } from './sprite.js';
import { SoftwareSurface } from './software-surface.js';

export type PlayerVisualKind = 'car' | 'bike';

export interface M5RenderResult {
  terrainLineCount: number;
  terrainOutputPixels: number;
  terrainLinesMaxPerRow: number;
  terrainOutputPixelsMaxPerRow: number;
  overdrawRows: number;
  visibleSpriteCount: number;
  spriteOutputSamples: number;
  spriteWrittenPixels: number;
  spriteOutputSamplesMaxPerScanline: number;
  playerOutputSamples: number;
  playerWrittenPixels: number;
  activeSection: string;
  playerYawVariant: number;
  playerBankVariant: number;
  playerRelativeYaw: number;
  groundMapMaxLevel: number;
  groundMapBaked: boolean;
  /** TerrainLine count by selected GroundMap level. */
  groundMapLevelLineCounts: readonly number[];
  /** Actual terrain GroundMap/GroundBase output samples attributed to each selected level. */
  groundMapLevelOutputPixels: readonly number[];
}

export function renderM5Driving(
  target: SoftwareSurface,
  background: FarBackground,
  guide: GuideCurve,
  camera: PseudoCamera,
  vehicle: M5CarState,
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

  const terrainLineCountsByRow = new Uint16Array(target.height);
  const terrainOutputByRow = new Uint32Array(target.height);
  const spriteOutputByScanline = new Uint32Array(target.height);
  const levelCount = (groundProfile.baked?.kMax ?? 0) + 1;
  const groundMapLevelLineCounts = new Array<number>(levelCount).fill(0);
  const groundMapLevelOutputPixels = new Array<number>(levelCount).fill(0);
  let terrainOutputPixels = 0;
  let spriteOutputSamples = 0;
  let spriteWrittenPixels = 0;
  let groundMapMaxLevel = 0;

  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
      terrainLineCountsByRow[line.y]! += 1;
      const stats = drawTerrainLine(target, line, groundProfile);
      terrainOutputPixels += stats.outputPixels;
      terrainOutputByRow[line.y]! += stats.outputPixels;
      groundMapMaxLevel = Math.max(groundMapMaxLevel, stats.groundMapLevel);
      groundMapLevelLineCounts[stats.groundMapLevel] = (groundMapLevelLineCounts[stats.groundMapLevel] ?? 0) + 1;
      groundMapLevelOutputPixels[stats.groundMapLevel] = (groundMapLevelOutputPixels[stats.groundMapLevel] ?? 0) + stats.outputPixels;
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite, spriteOutputByScanline);
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
    { outputSamplesPerScanline: spriteOutputByScanline },
  );

  let overdrawRows = 0;
  let terrainLinesMaxPerRow = 0;
  let terrainOutputPixelsMaxPerRow = 0;
  let spriteOutputSamplesMaxPerScanline = 0;
  for (let y = 0; y < target.height; y += 1) {
    const lineCount = terrainLineCountsByRow[y]!;
    if (lineCount > 1) overdrawRows += 1;
    terrainLinesMaxPerRow = Math.max(terrainLinesMaxPerRow, lineCount);
    terrainOutputPixelsMaxPerRow = Math.max(terrainOutputPixelsMaxPerRow, terrainOutputByRow[y]!);
    spriteOutputSamplesMaxPerScanline = Math.max(spriteOutputSamplesMaxPerScanline, spriteOutputByScanline[y]!);
  }

  return {
    terrainLineCount: terrain.length,
    terrainOutputPixels,
    terrainLinesMaxPerRow,
    terrainOutputPixelsMaxPerRow,
    overdrawRows,
    visibleSpriteCount: sprites.length,
    spriteOutputSamples,
    spriteWrittenPixels,
    spriteOutputSamplesMaxPerScanline,
    playerOutputSamples: playerStats.outputSamples,
    playerWrittenPixels: playerStats.writtenPixels,
    activeSection: terrainProfile.visual.sample(vehicle.course.s).name,
    playerYawVariant: selected.yawIndex,
    playerBankVariant: selected.bankIndex,
    playerRelativeYaw: relativeYaw,
    groundMapMaxLevel,
    groundMapBaked: groundProfile.baked !== undefined,
    groundMapLevelLineCounts,
    groundMapLevelOutputPixels,
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
  const preparedRow = baked?.prepareRow(line.s, groundMapLevel);

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
      let sourceColumn = preparedRow ? baked!.lateralToSourceColumn(groundMapLevel, lateral) : 0;
      const sourceColumnStep = preparedRow
        ? (lateralStep / (groundProfile.groundLeft + groundProfile.groundRight)) * preparedRow.lateralTexels
        : 0;

      for (let x = x0; x <= x1; x += 1) {
        target.pixels[offset + x] = preparedRow
          ? baked!.samplePreparedColumn(preparedRow, sourceColumn)
          : sampleGroundMap(line.s, lateral, groundProfile, cliffSection);
        lateral += lateralStep;
        sourceColumn += sourceColumnStep;
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

function drawWorldSprite(target: SoftwareSurface, sprite: VisibleCourseSprite, outputSamplesPerScanline: Uint32Array) {
  return drawScaledSprite(
    target,
    sprite.asset,
    sprite.projection.x,
    sprite.projection.y,
    sprite.projection.scale,
    { outputSamplesPerScanline },
  );
}
