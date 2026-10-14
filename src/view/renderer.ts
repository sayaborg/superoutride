export { STRIP_ACTIVE_LIMIT } from '../course/strip-ground.js';
import { createStripRenderMetrics, type StripGroundReader, type StripRenderMetrics } from './strip-ground-sampler.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from './projection.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { SoftwareSurface } from './software-surface.js';
import { drawScaledSprite } from './sprite.js';
import type { VehicleRenderRead } from '../vehicle/physics/vehicle-contract.js';
import { generateTerrainLines, createTerrainWorkspace, type TerrainRenderParameters } from './terrain-line.js';
import { selectVehicleSprite, type VehicleSpriteImages } from '../vehicle/vehicle-sprite-set.js';
import {
  collectVisibleCourseSprites,
  type CourseSprite,
  type SpriteShadowPlace,
  type VisibleCourseSprite,
} from './course-sprite.js';
import { drawWallColumn, type RouteWall, type WallWorkspace } from './course-wall.js';

import { deriveVehicleLeanRadians } from './vehicle-visuals.js';
import { placeShadow, shadowRowSpans, type PlacedShadow } from './sprite-shadow.js';
import type { SpriteAsset } from '../image/sprite.js';
import type { BasePoint } from './base-point.js';

/** DEV and tool measurements of one rendered frame; the product render takes none. */
export interface RenderMeasurements {
  stripGround: StripRenderMetrics;
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
    stripGround: createStripRenderMetrics(),
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
  /** The frame's background: a map, or a transition between two. */
  readonly background: { draw(target: SoftwareSurface, camera: PseudoCamera): void };
  readonly guide: { readonly coordinates: PlanCoordinateReader };
  readonly camera: PseudoCamera;
  readonly vehicle: VehicleRenderRead;
  /** The player picture's anchor: its base point (`basePoint`). */
  readonly playerBase: BasePoint;
  /** The player's shadow place. */
  readonly playerShadow: SpriteShadowPlace;
  readonly terrainParameters: TerrainRenderParameters;
  readonly worldSprites: readonly CourseSprite[];
  /** The visible walls on the resident Route. */
  readonly walls: readonly RouteWall[];
  readonly playerSet: VehicleSpriteImages;
}

export function createRenderWorkspace() {
  return {
    terrain: createTerrainWorkspace(),
    strips: createStripRenderMetrics(),
    /** Each frame's walls within the visible interval and the x of each one's last column. */
    walls: [] as RouteWall[],
    wallX: [] as number[],
    wall: { column: new Uint16Array(0), strips: createStripRenderMetrics(), wallPixels: 0 } as WallWorkspace,
    /** Each row's shaded pixel spans. */
    shade: [] as number[],
    /** The frame's placed shadows and their pool. */
    shadows: [] as PlacedShadow[],
    shadowPool: [] as PlacedShadow[],
    shadowAnchor: { x: 0, y: 0, z: 0, s: 0 },
    shadowProjection: { x: 0, y: 0, scale: 0, depth: 0, cameraRightDistance: 0 },
  };
}

interface RenderOptions {
  readonly workspace: ReturnType<typeof createRenderWorkspace>;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: StripGroundReader;
}

export function renderDriving(
  target: SoftwareSurface,
  {
    background,
    guide,
    camera,
    vehicle,
    playerBase,
    playerShadow,
    terrainParameters,
    worldSprites,
    walls,
    playerSet,
  }: RenderScene,
  { ground, workspace }: RenderOptions,
  measurements: RenderMeasurements | null = null,
): void {
  const renderCamera = camera;
  // The terrain's forward visible interval also bounds the course sprites; it is computed once per frame.
  const { lines: terrain, visible } = generateTerrainLines(guide, camera, terrainParameters, workspace.terrain);
  background.draw(target, renderCamera);
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];
  const playerProjection = pseudoProject(playerBase, camera);
  const relativeYaw = wrapAngle(vehicle.yaw - renderCamera.yaw);
  const selected = selectVehicleSprite(playerSet, relativeYaw, deriveVehicleLeanRadians(vehicle));
  // Every drawn picture with a shadow place casts its level's shadow on the road beneath it, drawn into the ground rows.
  const shadows = workspace.shadows,
    pool = workspace.shadowPool,
    anchor = workspace.shadowAnchor;
  shadows.length = 0;
  const cast = (asset: SpriteAsset, x: number, z: number, s: number, place: SpriteShadowPlace) => {
    anchor.x = x;
    anchor.y = place.y;
    anchor.z = z;
    anchor.s = s;
    const projected = pseudoProject(anchor, camera, workspace.shadowProjection);
    const shadow = (pool[shadows.length] ??= { frame: null!, left: 0, top: 0, scale: 0, sStart: 0, sEnd: 0 });
    if (placeShadow(asset, projected.x, projected.y, projected.scale, s, place.reach, shadow)) shadows.push(shadow);
  };
  for (const sprite of sprites)
    if (sprite.shadow) cast(sprite.asset, sprite.x, sprite.z, sprite.sRender, sprite.shadow);
  cast(selected.asset, playerBase.x, playerBase.z, playerBase.s, playerShadow);
  // Walls reaching the visible interval; each paints a column after every terrain row at its stations.
  const shownWalls = workspace.walls,
    wallX = workspace.wallX,
    wallWorkspace = workspace.wall;
  shownWalls.length = wallX.length = 0;
  wallWorkspace.wallPixels = 0;
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
        stripStats,
        // Shadows darken the row's own ground as it is written, before any wall or sprite at its depth.
        shadowRowSpans(line, shadows, target.width, workspace.shade),
      );
      terrainOutputPixels += stripStats.outputPixels - before;
      // At equal depth: ground, then walls, then sprites.
      for (let i = 0; i < shownWalls.length; i++) {
        const wall = shownWalls[i]!;
        if (line.s >= wall.start && line.s <= wall.end)
          wallX[i] = drawWallColumn(target, wall, line, renderCamera, wallX[i]!, wallWorkspace);
      }
    },
    (sprite) => {
      const stats = drawWorldSprite(target, sprite);
      spriteOutputSamples += stats.outputSamples;
      spriteWrittenPixels += stats.writtenPixels;
    },
  );

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
  measurements.terrainLineCount = terrain.length;
  measurements.terrainOutputPixels = terrainOutputPixels;
  measurements.wallPixels = wallWorkspace.wallPixels;
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
