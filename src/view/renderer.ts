export { BAND_ACTIVE_LIMIT } from '../course/band-ground.js';
import { createBandRenderMetrics, type BandRenderMetrics } from '../course/band-ground.js';
import { DEFAULT_BAND_RENDER_MODE } from './display-settings.js';
import { type BandRenderMode } from '../course/band-ground.js';
import type { RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
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
  type TerrainVisualProfile,
} from './terrain-line.js';
import { drawTileBackground, type TileBackground } from './tile-background.js';
import { selectVehicleSprite, type SpriteAssets } from '../image/sprite-assets.js';
import { collectVisibleCourseSprites, type CourseSpriteSource, type VisibleCourseSprite } from './course-sprite.js';
import { createRenderSpaceCamera, mapPhysicalHeightToRender } from './render-height-space.js';
import { deriveVehicleNormalizedBank } from './vehicle-presentation.js';

type PlayerVisualKind = 'car' | 'bike';

interface RenderResult {
  bandGround: BandRenderMetrics & { mode: BandRenderMode; milliseconds: number };
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

export interface BandGroundReader {
  readonly kind: 'bands';
  sampleSpan(
    pixels: Uint32Array,
    offset: number,
    count: number,
    s: number,
    l: number,
    stepL: number,
    deltaS: number,
    mode: BandRenderMode,
    stats: BandRenderMetrics,
  ): void;
}

interface RenderScene {
  readonly background: TileBackground;
  readonly guide: RasterGeometry;
  readonly camera: PseudoCamera;
  readonly vehicle: VehicleRenderReadState;
  readonly terrainProfile: TerrainVisualProfile;
  readonly groundProfile: { readonly groundLeft: number; readonly groundRight: number };
  readonly worldSprites: CourseSpriteSource;
  readonly assets: SpriteAssets;
  readonly playerKind: PlayerVisualKind;
}

export function createRenderWorkspace() {
  return {
    terrain: createTerrainWorkspace(),
    bands: createBandRenderMetrics(),
  };
}

interface RenderOptions {
  readonly workspace?: ReturnType<typeof createRenderWorkspace>;
  readonly observeWorkload?: boolean;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: BandGroundReader;
  readonly bandMode?: BandRenderMode;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, vehicle, terrainProfile, groundProfile, worldSprites, assets, playerKind }: RenderScene,
  {
    observeWorkload = false,
    ground,
    workspace = createRenderWorkspace(),
    bandMode = DEFAULT_BAND_RENDER_MODE,
  }: RenderOptions,
): RenderResult {
  const { renderCamera, terrain } = prepareTerrain(guide, camera, terrainProfile, workspace);
  drawTileBackground(target, background, renderCamera);
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

  const bandStats = workspace.bands;
  bandStats.activeBands = bandStats.outputPixels = 0;
  let bandMilliseconds = 0;
  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
      const started = performance.now();
      const span = line.xGroundR - line.xGroundL;
      const step = (groundProfile.groundLeft + groundProfile.groundRight) / span;
      const lateral = -groundProfile.groundLeft + (0.5 - line.xGroundL) * step;
      const before = bandStats.outputPixels;
      ground.sampleSpan(
        target.pixels,
        line.y * target.width,
        target.width,
        line.s,
        lateral,
        step,
        line.sourceFootprint.deltaSEffective,
        bandMode,
        bandStats,
      );
      const outputPixels = bandStats.outputPixels - before;
      bandMilliseconds += performance.now() - started;
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
    bandGround: { ...bandStats, mode: bandMode, milliseconds: bandMilliseconds },
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
    spriteOutputSamplesIncludingPlayer: spriteOutputSamples + playerStats.outputSamples,
    spriteWrittenPixelsIncludingPlayer: spriteWrittenPixels + playerStats.writtenPixels,
    workload,
  };
}

function prepareTerrain(
  guide: RasterGeometry,
  camera: PseudoCamera,
  terrainProfile: TerrainVisualProfile,
  workspace: ReturnType<typeof createRenderWorkspace>,
) {
  const renderCamera = createRenderSpaceCamera(terrainProfile.height, camera);

  const terrain = generateTerrainLines(guide, renderCamera, terrainProfile, workspace.terrain);
  return { renderCamera, terrain };
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
