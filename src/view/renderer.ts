export { STRIP_ACTIVE_LIMIT } from '../course/strip-ground.js';
import { createStripRenderMetrics, type StripRenderMetrics } from './strip-ground-sampler.js';
import type { StripRenderMethod } from './display-settings.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from './projection.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { SoftwareSurface } from './software-surface.js';
import { drawScaledSprite } from './sprite.js';
import type { VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import { generateTerrainLines, createTerrainWorkspace, type TerrainRenderParameters } from './terrain-line.js';
import { drawTileBackground, type TileBackground } from './tile-background.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import { collectVisibleCourseSprites, type CourseSprite, type VisibleCourseSprite } from './course-sprite.js';

import { deriveVehicleLeanRadians } from './vehicle-visuals.js';

interface RenderResult {
  stripGround: StripRenderMetrics & { method: StripRenderMethod };
  terrainLineCount: number;
  terrainOutputPixels: number;
  visibleSpriteCount: number;
  spriteOutputSamples: number;
  spriteWrittenPixels: number;
  playerOutputSamples: number;
  playerWrittenPixels: number;
  /** The player's reference point on screen; the renderer's projection is its one authority. */
  playerScreenX: number;
  playerScreenY: number;
  playerYawVariant: number;
  playerBankVariant: number;
  playerRelativeYaw: number;
  spriteOutputSamplesIncludingPlayer: number;
  spriteWrittenPixelsIncludingPlayer: number;
}

export interface StripGroundReader {
  sampleSpan(
    pixels: Uint16Array,
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
  readonly vehicle: VehicleRenderRead;
  readonly terrainParameters: TerrainRenderParameters;
  readonly worldSprites: readonly CourseSprite[];
  readonly playerSet: VehicleSpriteSet;
}

export function createRenderWorkspace() {
  return {
    terrain: createTerrainWorkspace(),
    strips: createStripRenderMetrics(),
  };
}

interface RenderOptions {
  readonly workspace: ReturnType<typeof createRenderWorkspace>;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: StripGroundReader;
  readonly stripMethod: StripRenderMethod;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, vehicle, terrainParameters, worldSprites, playerSet }: RenderScene,
  { ground, workspace, stripMethod }: RenderOptions,
): RenderResult {
  const renderCamera = camera;
  // The terrain's forward visible interval also bounds the course sprites; it is computed once per frame.
  const { lines: terrain, visible } = generateTerrainLines(guide, camera, terrainParameters, workspace.terrain);
  drawTileBackground(target, background, renderCamera);
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];

  let terrainOutputPixels = 0;
  let spriteOutputSamples = 0;
  let spriteWrittenPixels = 0;

  const stripStats = workspace.strips;
  stripStats.activeStrips = stripStats.outputPixels = 0;
  mergeTerrainAndSprites(
    terrain,
    sprites,
    (line) => {
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
        line.deltaS,
        stripMethod,
        stripStats,
      );
      terrainOutputPixels += stripStats.outputPixels - before;
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite);
      spriteOutputSamples += stats.outputSamples;
      spriteWrittenPixels += stats.writtenPixels;
    },
  );

  const playerProjection = pseudoProject(
    { x: vehicle.x, z: vehicle.z, y: vehicle.renderY, s: vehicle.course.s },
    camera,
  );
  const relativeYaw = wrapAngle(vehicle.yaw - renderCamera.yaw);
  const selected = selectVehicleSprite(playerSet, relativeYaw, deriveVehicleLeanRadians(vehicle));
  const playerStats = drawScaledSprite(
    target,
    selected.asset,
    playerProjection.x,
    playerProjection.y,
    playerProjection.scale,
  );

  return {
    stripGround: { ...stripStats, method: stripMethod },
    terrainLineCount: terrain.length,
    terrainOutputPixels,
    visibleSpriteCount: sprites.length,
    spriteOutputSamples,
    spriteWrittenPixels,
    playerOutputSamples: playerStats.outputSamples,
    playerWrittenPixels: playerStats.writtenPixels,
    playerScreenX: playerProjection.x,
    playerScreenY: playerProjection.y,
    playerYawVariant: selected.yawIndex,
    playerBankVariant: selected.bankIndex,
    playerRelativeYaw: relativeYaw,
    spriteOutputSamplesIncludingPlayer: spriteOutputSamples + playerStats.outputSamples,
    spriteWrittenPixelsIncludingPlayer: spriteWrittenPixels + playerStats.writtenPixels,
  };
}

function drawWorldSprite(target: SoftwareSurface, sprite: VisibleCourseSprite) {
  return drawScaledSprite(target, sprite.asset, sprite.projection.x, sprite.projection.y, sprite.projection.scale);
}
