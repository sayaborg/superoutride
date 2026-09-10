import type { GuidePath } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import type { StageRoadView } from '../course/stage-road-view.js';
import type { VehicleRenderReadState } from '../physics/vehicle-contract.js';
import { applyStageRoadViewToTerrainLine } from '../road/stage-terrain-view.js';
import {
  computeForwardVisibleInterval,
  generateTerrainLines,
  type TerrainLine,
  type TerrainVisualProfile,
} from '../road/terrain-line.js';
import { drawFarBackground, type FarBackground } from '../visual/far-background.js';
import { sampleGroundMap, type GroundMapProfile } from '../visual/ground-map.js';
import { selectVehicleSprite, type SpriteAssets } from '../visual/sprite-assets.js';
import { sampleStageGroundMapAtLevel } from '../visual/stage-ground-map-view.js';
import { collectVisibleCourseSprites, type CourseSprite, type VisibleCourseSprite } from '../world/course-sprite.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { createRenderSpaceCamera, mapPhysicalHeightToRender } from './render-height-space.js';
import { SoftwareSurface } from './software-surface.js';
import { drawScaledSprite, type SpriteScanlineObserver } from './sprite.js';
import { deriveVehicleNormalizedBank } from './vehicle-presentation.js';

const MIN_TEXTURE_SPAN_PIXELS = 1e-8;

export type PlayerVisualKind = 'car' | 'bike';

export interface RenderResult {
  terrainLineCount: number;
  terrainOutputPixels: number;
  visibleSpriteCount: number;
  spriteOutputSamples: number;
  spriteWrittenPixels: number;
  playerOutputSamples: number;
  playerWrittenPixels: number;
  playerScreenY: number;
  activeSection: string;
  playerYawVariant: number;
  playerBankVariant: number;
  playerRelativeYaw: number;
  groundMapMaxLevel: number;
  groundMapBaked: boolean;
  spriteOutputSamplesIncludingPlayer: number;
  spriteWrittenPixelsIncludingPlayer: number;
  /** Detailed observation is absent during ordinary play. */
  workload?: RenderWorkload;
}

export interface RenderWorkload {
  overdrawRows: number;
  terrainLineCountPerScreenRowMax: number;
  terrainOutputPixelsPerScreenRowMax: number;
  spriteOutputSamplesPerScanlineMax: number;
  spriteWrittenPixelsPerScanlineMax: number;
  groundMapLevelHistogram: readonly number[];
}

export interface RenderScene {
  readonly background: FarBackground;
  readonly guide: GuidePath;
  readonly camera: PseudoCamera;
  readonly vehicle: VehicleRenderReadState;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: GroundMapProfile;
  readonly worldSprites: readonly CourseSprite[];
  readonly assets: SpriteAssets;
  readonly playerKind: PlayerVisualKind;
}

export interface RenderOptions {
  readonly roadView?: StageRoadView;
  readonly observeWorkload?: boolean;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, vehicle, terrainProfile, groundProfile, worldSprites, assets, playerKind }: RenderScene,
  { roadView, observeWorkload = false }: RenderOptions = {},
): RenderResult {
  const renderCamera = createRenderSpaceCamera(terrainProfile.height, camera);
  drawFarBackground(target, background, renderCamera);

  const baseTerrain = generateTerrainLines(guide, renderCamera, terrainProfile);
  const terrain: TerrainLine[] = roadView === undefined ? baseTerrain : [];
  if (roadView !== undefined) {
    for (const line of baseTerrain) {
      const viewed = applyStageRoadViewToTerrainLine(guide, renderCamera, line, roadView);
      if (viewed !== null) terrain.push(viewed);
    }
  }
  const visible = computeForwardVisibleInterval(
    guide,
    renderCamera.yaw,
    renderCamera.s,
    terrainProfile.dMin,
    terrainProfile.dMax,
  );
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];

  const observation = observeWorkload
    ? {
        terrainLinesByRow: new Uint16Array(target.height),
        terrainOutputByRow: new Uint32Array(target.height),
        spriteOutputByScanline: new Uint32Array(target.height),
        spriteWrittenByScanline: new Uint32Array(target.height),
        groundMapLevelHistogram: new Uint32Array((groundProfile.baked?.kMax ?? 0) + 1),
      }
    : undefined;
  let terrainOutputPixels = 0;
  let spriteOutputSamples = 0;
  let spriteWrittenPixels = 0;
  let groundMapMaxLevel = 0;

  const spriteObserver: SpriteScanlineObserver | undefined =
    observation &&
    ((screenY, outputSamples, writtenPixels) => {
      if (screenY < 0 || screenY >= target.height) return;
      observation.spriteOutputByScanline[screenY]! += outputSamples;
      observation.spriteWrittenByScanline[screenY]! += writtenPixels;
    });

  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
      const stats = drawTerrainLine(target, line, groundProfile, roadView);
      terrainOutputPixels += stats.outputPixels;
      groundMapMaxLevel = Math.max(groundMapMaxLevel, stats.groundMapLevel);
      if (observation) {
        observation.terrainLinesByRow[line.y]! += 1;
        observation.terrainOutputByRow[line.y]! += stats.outputPixels;
        observation.groundMapLevelHistogram[stats.groundMapLevel]! += 1;
      }
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite, spriteObserver);
      spriteOutputSamples += stats.outputSamples;
      spriteWrittenPixels += stats.writtenPixels;
    },
  );

  const playerRenderY = mapPhysicalHeightToRender(
    terrainProfile.height,
    vehicle.course.s,
    vehicle.presentationY ?? vehicle.y,
  );
  const playerProjection = pseudoProject(
    { x: vehicle.x, y: playerRenderY, z: vehicle.z, s: vehicle.course.s },
    renderCamera,
  );
  const playerSet = playerKind === 'bike' ? assets.bike : assets.car;
  const relativeYaw = wrapAngle(vehicle.yaw - renderCamera.yaw);
  const normalizedBank = playerKind === 'bike' ? deriveVehicleNormalizedBank(vehicle) : 0;
  const selected = selectVehicleSprite(playerSet, relativeYaw, normalizedBank);
  const playerStats = drawScaledSprite(
    target,
    selected.asset,
    playerProjection.x,
    playerProjection.y,
    playerProjection.scale,
    spriteObserver,
  );

  let workload: RenderWorkload | undefined;
  if (observation) {
    const {
      terrainLinesByRow,
      terrainOutputByRow,
      spriteOutputByScanline,
      spriteWrittenByScanline,
      groundMapLevelHistogram,
    } = observation;
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

    workload = {
      overdrawRows,
      terrainLineCountPerScreenRowMax,
      terrainOutputPixelsPerScreenRowMax,
      spriteOutputSamplesPerScanlineMax,
      spriteWrittenPixelsPerScanlineMax,
      groundMapLevelHistogram: Array.from(groundMapLevelHistogram),
    };
  }

  return {
    terrainLineCount: terrain.length,
    terrainOutputPixels,
    visibleSpriteCount: sprites.length,
    spriteOutputSamples,
    spriteWrittenPixels,
    playerOutputSamples: playerStats.outputSamples,
    playerWrittenPixels: playerStats.writtenPixels,
    playerScreenY: playerProjection.y,
    activeSection: terrainProfile.visual.sample(vehicle.course.s).name,
    playerYawVariant: selected.yawIndex,
    playerBankVariant: selected.bankIndex,
    playerRelativeYaw: relativeYaw,
    groundMapMaxLevel,
    groundMapBaked: groundProfile.baked !== undefined,
    spriteOutputSamplesIncludingPlayer: spriteOutputSamples + playerStats.outputSamples,
    spriteWrittenPixelsIncludingPlayer: spriteWrittenPixels + playerStats.writtenPixels,
    workload,
  };
}

function drawTerrainLine(
  target: SoftwareSurface,
  line: TerrainLine,
  groundProfile: GroundMapProfile,
  roadView?: StageRoadView,
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
    if (Math.abs(dx) >= MIN_TEXTURE_SPAN_PIXELS) {
      const localGroundLeft = roadView?.groundLeft ?? groundProfile.groundLeft;
      const localGroundRight = roadView?.groundRight ?? groundProfile.groundRight;
      let lateral = -localGroundLeft + ((x0 + 0.5 - line.xGroundL) / dx) * (localGroundLeft + localGroundRight);
      const lateralStep = (localGroundLeft + localGroundRight) / dx;
      const offset = line.y * target.width;
      for (let x = x0; x <= x1; x += 1) {
        const sampledLateral = roadView === undefined ? lateral : clamp(lateral, -localGroundLeft, localGroundRight);
        target.pixels[offset + x] =
          roadView === undefined
            ? baked
              ? baked.sampleAtLevel(line.s, sampledLateral, groundMapLevel)
              : sampleGroundMap(line.s, sampledLateral, groundProfile)
            : sampleStageGroundMapAtLevel(line.s, sampledLateral, groundMapLevel, roadView, groundProfile);
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
