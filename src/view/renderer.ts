export { STRIP_ACTIVE_LIMIT } from '../course/strip-ground.js';
import { createStripRenderMetrics, type StripRenderMetrics } from './strip-ground-sampler.js';
import { DEFAULT_STRIP_RENDER_METHOD } from './display-settings.js';
import type { StripRenderMethod } from './display-settings.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from './projection.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { SoftwareSurface } from './software-surface.js';
import { drawScaledSprite, type SpriteScanlineObserver } from './sprite.js';
import type { VehicleRenderReadState } from '../vehicle/physics/vehicle-contract.js';
import {
  computeForwardVisibleInterval,
  generateTerrainLines,
  createTerrainWorkspace,
  type TerrainRenderParameters,
} from './terrain-line.js';
import { drawTileBackground, type TileBackground } from './tile-background.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../image/sprite-assets.js';
import { collectVisibleCourseSprites, type CourseSpriteInput, type VisibleCourseSprite } from './course-sprite.js';

import { deriveVehicleNormalizedBank } from './vehicle-visuals.js';

interface RenderResult {
  stripGround: StripRenderMetrics & { method: StripRenderMethod; milliseconds: number };
  terrainLineCount: number;
  terrainOutputPixels: number;
  visibleSpriteCount: number;
  spriteOutputSamples: number;
  spriteWrittenPixels: number;
  playerOutputSamples: number;
  playerWrittenPixels: number;
  playerScreenY: number;
  activeEnvironment: string;
  playerYawVariant: number;
  playerBankVariant: number;
  playerRelativeYaw: number;
  spriteOutputSamplesIncludingPlayer: number;
  spriteWrittenPixelsIncludingPlayer: number;
  /** Detailed observation is absent during ordinary play. */
  workload?: RenderWorkload;
}

interface RenderWorkload {
  overdrawRows: number;
  terrainLineCountPerScreenRowMax: number;
  terrainOutputPixelsPerScreenRowMax: number;
  spriteOutputSamplesPerScanlineMax: number;
  spriteWrittenPixelsPerScanlineMax: number;
}

export interface StripGroundReader {
  readonly kind: 'strips';
  sampleSpan(
    pixels: Uint32Array,
    offset: number,
    count: number,
    s: number,
    l: number,
    stepL: number,
    deltaS: number,
    method: StripRenderMethod,
    stats: StripRenderMetrics,
  ): void;
}

interface RenderScene {
  readonly background: TileBackground;
  readonly guide: { readonly coordinates: PlanCoordinateReader };
  readonly camera: PseudoCamera;
  readonly vehicle: VehicleRenderReadState;
  readonly terrainParameters: TerrainRenderParameters;
  readonly worldSprites: CourseSpriteInput;
  readonly playerSet: VehicleSpriteSet;
}

export function createRenderWorkspace() {
  return {
    terrain: createTerrainWorkspace(),
    strips: createStripRenderMetrics(),
  };
}

interface RenderOptions {
  readonly workspace?: ReturnType<typeof createRenderWorkspace>;
  readonly observeWorkload?: boolean;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: StripGroundReader;
  readonly stripMethod?: StripRenderMethod;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, vehicle, terrainParameters, worldSprites, playerSet }: RenderScene,
  {
    observeWorkload = false,
    ground,
    workspace = createRenderWorkspace(),
    stripMethod = DEFAULT_STRIP_RENDER_METHOD,
  }: RenderOptions,
): RenderResult {
  const renderCamera = camera;
  const terrain = generateTerrainLines(guide, camera, terrainParameters, workspace.terrain);
  drawTileBackground(target, background, renderCamera);
  const visible = computeForwardVisibleInterval(
    guide,
    terrainParameters.extent,
    renderCamera.yaw,
    renderCamera.s,
    terrainParameters.dMin,
    terrainParameters.dMax,
  );
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];

  const observation = observeWorkload
    ? {
        terrainLinesByRow: new Uint16Array(target.height),
        terrainOutputByRow: new Uint32Array(target.height),
        spriteOutputByScanline: new Uint32Array(target.height),
        spriteWrittenByScanline: new Uint32Array(target.height),
      }
    : undefined;
  let terrainOutputPixels = 0;
  let spriteOutputSamples = 0;
  let spriteWrittenPixels = 0;

  const spriteObserver: SpriteScanlineObserver | undefined =
    observation &&
    ((screenY, outputSamples, writtenPixels) => {
      if (screenY < 0 || screenY >= target.height) return;
      observation.spriteOutputByScanline[screenY]! += outputSamples;
      observation.spriteWrittenByScanline[screenY]! += writtenPixels;
    });

  const stripStats = workspace.strips;
  stripStats.activeStrips = stripStats.outputPixels = 0;
  let stripMilliseconds = 0;
  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
      const started = performance.now();
      const span = line.xGroundR - line.xGroundL;
      const step = 2 / span;
      const lateral = -1 + (0.5 - line.xGroundL) * step;
      const before = stripStats.outputPixels;
      ground.sampleSpan(
        target.pixels,
        line.y * target.width,
        target.width,
        line.s,
        lateral,
        step,
        line.footprint.deltaSEffective,
        stripMethod,
        stripStats,
      );
      const outputPixels = stripStats.outputPixels - before;
      stripMilliseconds += performance.now() - started;
      terrainOutputPixels += outputPixels;
      if (observation) {
        observation.terrainLinesByRow[line.y]! += 1;
        observation.terrainOutputByRow[line.y]! += outputPixels;
      }
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite, spriteObserver);
      spriteOutputSamples += stats.outputSamples;
      spriteWrittenPixels += stats.writtenPixels;
    },
  );

  const playerProjection = pseudoProject(
    { x: vehicle.x, z: vehicle.z, y: vehicle.renderY ?? vehicle.y, s: vehicle.course.s },
    camera,
  );
  const relativeYaw = wrapAngle(vehicle.yaw - renderCamera.yaw);
  const normalizedBank = playerSet.bankVariants > 1 ? deriveVehicleNormalizedBank(vehicle) : 0;
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
    const { terrainLinesByRow, terrainOutputByRow, spriteOutputByScanline, spriteWrittenByScanline } = observation;
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
    };
  }

  return {
    stripGround: { ...stripStats, method: stripMethod, milliseconds: stripMilliseconds },
    terrainLineCount: terrain.length,
    terrainOutputPixels,
    visibleSpriteCount: sprites.length,
    spriteOutputSamples,
    spriteWrittenPixels,
    playerOutputSamples: playerStats.outputSamples,
    playerWrittenPixels: playerStats.writtenPixels,
    playerScreenY: playerProjection.y,
    activeEnvironment: terrainParameters.environment.sample(vehicle.course.s).name,
    playerYawVariant: selected.yawIndex,
    playerBankVariant: selected.bankIndex,
    playerRelativeYaw: relativeYaw,
    spriteOutputSamplesIncludingPlayer: spriteOutputSamples + playerStats.outputSamples,
    spriteWrittenPixelsIncludingPlayer: spriteWrittenPixels + playerStats.writtenPixels,
    workload,
  };
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
