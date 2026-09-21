import type { RasterGeometry } from '../core/raster-coordinate-reader.js';
import { wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from '../core/projection.js';
import { mergeTerrainAndSprites } from '../graphics/painter-merge.js';
import { SoftwareSurface } from '../graphics/software-surface.js';
import { drawScaledSprite, type SpriteScanlineObserver } from '../graphics/sprite.js';
import type { VehicleRenderReadState } from '../physics/vehicle-contract.js';
import {
  computeForwardVisibleInterval,
  generateTerrainLines,
  createTerrainWorkspace,
  type TerrainLine,
  type TerrainVisualProfile,
} from '../terrain/terrain-line.js';
import { drawTileBackground, type TileBackground } from '../visual/tile-background.js';
import { selectVehicleSprite, type SpriteAssets } from '../visual/sprite-assets.js';
import { collectVisibleCourseSprites, type CourseSpriteSource, type VisibleCourseSprite } from './course-sprite.js';
import { createRenderSpaceCamera, mapPhysicalHeightToRender } from './render-height-space.js';
import { deriveVehicleNormalizedBank } from './vehicle-presentation.js';

const MIN_TEXTURE_SPAN_PIXELS = 1e-8;

type PlayerVisualKind = 'car' | 'bike';

interface RenderResult {
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

interface RenderWorkload {
  overdrawRows: number;
  terrainLineCountPerScreenRowMax: number;
  terrainOutputPixelsPerScreenRowMax: number;
  spriteOutputSamplesPerScanlineMax: number;
  spriteWrittenPixelsPerScanlineMax: number;
  groundMapLevelHistogram: readonly number[];
}

/** Synchronous color reader. Source evaluation supplies saved paint until resident images are compiled. */
export interface GroundColorReader {
  readonly kind: 'baked' | 'source';
  readonly kMax: number;
  selectLevel(deltaSEffective: number): number;
  sampleAtLevel(s: number, l: number, level: number): number | null;
  /** Batch an affine scanline without changing per-pixel sampling or accumulation order. */
  sampleSpan?(
    pixels: Uint32Array,
    offset: number,
    count: number,
    s: number,
    l: number,
    stepL: number,
    level: number,
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
  return { terrain: createTerrainWorkspace(), terrainStats: { outputPixels: 0, groundMapLevel: 0 } };
}

interface RenderOptions {
  readonly workspace?: ReturnType<typeof createRenderWorkspace>;
  readonly observeWorkload?: boolean;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: GroundColorReader;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, vehicle, terrainProfile, groundProfile, worldSprites, assets, playerKind }: RenderScene,
  { observeWorkload = false, ground, workspace = createRenderWorkspace() }: RenderOptions,
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
        groundMapLevelHistogram: new Uint32Array(ground.kMax + 1),
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
      const stats = drawTerrainLine(target, line, groundProfile, ground, workspace.terrainStats);
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
    groundMapBaked: ground.kind === 'baked',
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

function drawTerrainLine(
  target: SoftwareSurface,
  line: TerrainLine,
  groundProfile: { readonly groundLeft: number; readonly groundRight: number },
  ground: GroundColorReader,
  out: { outputPixels: number; groundMapLevel: number },
): { outputPixels: number; groundMapLevel: number } {
  let outputPixels = 0;
  const leftEdge = Math.ceil(line.xGroundL);
  const rightEdge = Math.floor(line.xGroundR);
  const groundMapLevel = ground.selectLevel(line.sourceFootprint.deltaSEffective);

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
      const localGroundLeft = groundProfile.groundLeft;
      const localGroundRight = groundProfile.groundRight;
      let lateral = -localGroundLeft + ((x0 + 0.5 - line.xGroundL) / dx) * (localGroundLeft + localGroundRight);
      const lateralStep = (localGroundLeft + localGroundRight) / dx;

      const offset = line.y * target.width;
      if (ground.sampleSpan)
        ground.sampleSpan(target.pixels, offset + x0, x1 - x0 + 1, line.s, lateral, lateralStep, groundMapLevel);
      else
        for (let x = x0; x <= x1; x += 1) {
          const color = ground.sampleAtLevel(line.s, lateral, groundMapLevel);
          if (color !== null) target.pixels[offset + x] = color;
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

  out.outputPixels = outputPixels;
  out.groundMapLevel = groundMapLevel;
  return out;
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
