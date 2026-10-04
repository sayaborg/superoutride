export { STRIP_ACTIVE_LIMIT } from '../course/strip-ground.js';
import { createStripRenderMetrics, type StripGroundReader, type StripRenderMetrics } from './strip-ground-sampler.js';
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
import { drawWallColumn, type RouteWall } from './course-wall.js';

import { deriveVehicleLeanRadians } from './vehicle-visuals.js';

/** DEV and tool measurements of one rendered frame; the product render takes none. */
export interface RenderMeasurements {
  stripGround: StripRenderMetrics & { method: StripRenderMethod };
  terrainLineCount: number;
  terrainOutputPixels: number;
  /** Pixels the visible walls painted. */
  wallPixels: number;
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

/** A measurement sink to pass to every measured render. */
export function createRenderMeasurements(): RenderMeasurements {
  return {
    stripGround: { ...createStripRenderMetrics(), method: 'LEVEL-POINT' },
    terrainLineCount: 0,
    terrainOutputPixels: 0,
    wallPixels: 0,
    visibleSpriteCount: 0,
    spriteOutputSamples: 0,
    spriteWrittenPixels: 0,
    playerOutputSamples: 0,
    playerWrittenPixels: 0,
    playerScreenX: 0,
    playerScreenY: 0,
    playerYawVariant: 0,
    playerBankVariant: 0,
    playerRelativeYaw: 0,
    spriteOutputSamplesIncludingPlayer: 0,
    spriteWrittenPixelsIncludingPlayer: 0,
  };
}

interface RenderScene {
  readonly background: TileBackground;
  readonly guide: { readonly coordinates: PlanCoordinateReader };
  readonly camera: PseudoCamera;
  readonly vehicle: VehicleRenderRead;
  readonly terrainParameters: TerrainRenderParameters;
  readonly worldSprites: readonly CourseSprite[];
  /** The visible walls on the resident Route. */
  readonly walls: readonly RouteWall[];
  readonly playerSet: VehicleSpriteSet;
}

export function createRenderWorkspace() {
  return {
    terrain: createTerrainWorkspace(),
    strips: createStripRenderMetrics(),
    /** Each frame's walls within the visible interval and the x of each one's last column. */
    walls: [] as RouteWall[],
    wallX: [] as number[],
    wallStats: { wallPixels: 0 },
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
  { background, guide, camera, vehicle, terrainParameters, worldSprites, walls, playerSet }: RenderScene,
  { ground, workspace, stripMethod }: RenderOptions,
  measurements: RenderMeasurements | null = null,
): void {
  const renderCamera = camera;
  // The terrain's forward visible interval also bounds the course sprites; it is computed once per frame.
  const { lines: terrain, visible } = generateTerrainLines(guide, camera, terrainParameters, workspace.terrain);
  drawTileBackground(target, background, renderCamera);
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];
  // Walls reaching the visible interval; each paints a column after every terrain row at its stations.
  const shownWalls = workspace.walls,
    wallX = workspace.wallX,
    wallStats = workspace.wallStats;
  shownWalls.length = wallX.length = 0;
  wallStats.wallPixels = 0;
  if (visible)
    for (const wall of walls)
      if (wall.end >= camera.s + visible.dStart && wall.start <= camera.s + visible.dEnd) {
        shownWalls.push(wall);
        wallX.push(NaN);
      }

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
      // At equal depth: ground, then walls, then sprites.
      for (let i = 0; i < shownWalls.length; i++) {
        const wall = shownWalls[i]!;
        if (line.s >= wall.start && line.s <= wall.end)
          wallX[i] = drawWallColumn(target, wall, line, renderCamera, wallX[i]!, wallStats);
      }
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

  // Only a measured render keeps the frame's measurements; the product render leaves them.
  if (!measurements) return;
  Object.assign(measurements.stripGround, stripStats);
  measurements.stripGround.method = stripMethod;
  measurements.terrainLineCount = terrain.length;
  measurements.terrainOutputPixels = terrainOutputPixels;
  measurements.wallPixels = wallStats.wallPixels;
  measurements.visibleSpriteCount = sprites.length;
  measurements.spriteOutputSamples = spriteOutputSamples;
  measurements.spriteWrittenPixels = spriteWrittenPixels;
  measurements.playerOutputSamples = playerStats.outputSamples;
  measurements.playerWrittenPixels = playerStats.writtenPixels;
  measurements.playerScreenX = playerProjection.x;
  measurements.playerScreenY = playerProjection.y;
  measurements.playerYawVariant = selected.yawIndex;
  measurements.playerBankVariant = selected.bankIndex;
  measurements.playerRelativeYaw = relativeYaw;
  measurements.spriteOutputSamplesIncludingPlayer = spriteOutputSamples + playerStats.outputSamples;
  measurements.spriteWrittenPixelsIncludingPlayer = spriteWrittenPixels + playerStats.writtenPixels;
}

function drawWorldSprite(target: SoftwareSurface, sprite: VisibleCourseSprite) {
  return drawScaledSprite(target, sprite.asset, sprite.projection.x, sprite.projection.y, sprite.projection.scale);
}
