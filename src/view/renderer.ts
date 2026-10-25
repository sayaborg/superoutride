export { STRIP_ACTIVE_LIMIT } from '../course/strip-ground.js';
import { createStripRenderMetrics, type StripGroundReader, type StripRenderMetrics } from './strip-ground-sampler.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import { pseudoProject, type PseudoCamera } from './projection.js';
import { mergeTerrainAndSprites } from './painter-merge.js';
import { SoftwareSurface } from './software-surface.js';
import { drawScaledSprite, scaledSpriteBounds } from './sprite.js';
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
import { spriteFolds, type SpriteAsset } from '../image/sprite.js';
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
  /**
   * The player's reference point on screen; the renderer's projection is its one authority. A render without a player
   * measures NaN here, and -1 for its variants.
   */
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
  /**
   * The player, drawn after the ground and walls and among the pictures by its base point's depth, before the nearer
   * ones; null draws none.
   */
  readonly player: RenderPlayer | null;
  readonly terrainParameters: TerrainRenderParameters;
  /** The pictures but the player's: course images, tire puffs and the other vehicles' pictures. */
  readonly worldSprites: readonly CourseSprite[];
  /** The visible walls on the resident Route. */
  readonly walls: readonly RouteWall[];
}

interface RenderPlayer {
  readonly vehicle: VehicleRenderRead;
  /** The player picture's anchor: its base point (`basePoint`). */
  readonly base: BasePoint;
  /** The player's shadow place. */
  readonly shadow: SpriteShadowPlace;
  readonly set: VehicleSpriteImages;
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
    /** Each screen row's terrain rows, far to near: `rowLines` from `rowFirst[y]` to `rowFirst[y + 1]`. */
    rowFirst: new Int32Array(0),
    rowLines: [] as number[],
    /**
     * The picture rows drawn after a terrain row and its walls, lying on the ground: each terrain row's first and last entry, and each
     * entry's picture, screen row and next entry (-1 ends).
     */
    laidFirst: [] as number[],
    laidLast: [] as number[],
    laidSprite: [] as number[],
    laidRow: [] as number[],
    laidNext: [] as number[],
  };
}

interface RenderOptions {
  readonly workspace: ReturnType<typeof createRenderWorkspace>;
  /** Final compiled color field in scene-local coordinates; never source-rebased or repainted. */
  readonly ground: StripGroundReader;
}

export function renderDriving(
  target: SoftwareSurface,
  { background, guide, camera, player, terrainParameters, worldSprites, walls }: RenderScene,
  { ground, workspace }: RenderOptions,
  measurements: RenderMeasurements | null = null,
): void {
  const renderCamera = camera;
  // The terrain's forward visible interval also bounds the course sprites; it is computed once per frame.
  const { lines: terrain, visible } = generateTerrainLines(guide, camera, terrainParameters, workspace.terrain);
  background.draw(target, renderCamera);
  const sprites = visible ? collectVisibleCourseSprites(worldSprites, renderCamera, visible.dStart, visible.dEnd) : [];
  const playerProjection = player && pseudoProject(player.base, camera);
  const relativeYaw = player ? wrapAngle(player.vehicle.yaw - renderCamera.yaw) : NaN;
  const selected = player && selectVehicleSprite(player.set, relativeYaw, deriveVehicleLeanRadians(player.vehicle));
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
  if (player) cast(selected!.asset, player.base.x, player.base.z, player.base.s, player.shadow);
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
  // Each screen row's terrain rows, far to near, for the picture rows lying on the ground.
  const height = target.height;
  if (workspace.rowFirst.length < height + 1) workspace.rowFirst = new Int32Array(height + 1);
  const rowFirst = workspace.rowFirst,
    rowLines = workspace.rowLines;
  rowFirst.fill(0);
  for (const line of terrain) rowFirst[line.y + 1]!++;
  for (let y = 0; y < height; y++) rowFirst[y + 1]! += rowFirst[y]!;
  rowLines.length = terrain.length;
  for (let i = 0; i < terrain.length; i++) rowLines[rowFirst[terrain[i]!.y]!++] = i;
  for (let y = height; y > 0; y--) rowFirst[y] = rowFirst[y - 1]!;
  rowFirst[0] = 0;
  const { laidFirst, laidLast, laidSprite, laidRow, laidNext } = workspace;
  laidFirst.length = laidLast.length = terrain.length;
  laidFirst.fill(-1);
  laidSprite.length = laidRow.length = laidNext.length = 0;

  const drawRows = (sprite: VisibleCourseSprite, rowStart: number, rowEnd: number) => {
    const { x, y, scale } = sprite.projection;
    const stats = drawScaledSprite(target, sprite.asset, x, y, scale, rowStart, rowEnd);
    spriteOutputSamples += stats.outputSamples;
    spriteWrittenPixels += stats.writtenPixels;
  };
  // A picture folds at its anchor's screen row: the rows on and above it draw at the anchor's depth. Each row below lies
  // on the ground in front of the anchor as far as that ground faces the camera: from the anchor toward the camera, the
  // terrain rows nearer than it are followed in Painter order up to the first facing away, to the picture's bottom row.
  // A row below draws after its screen row's farthest terrain row nearer than the anchor where that is one of them, else
  // at the anchor's depth, so a picture beyond a crest lays no row over the nearer slope. A picture anchored at its full
  // size's bottom edge all stands (`spriteFolds`).
  const drawSprite = (sprite: VisibleCourseSprite, index: number) => {
    if (!spriteFolds(sprite.asset)) return drawRows(sprite, 0, height);
    const { y, scale } = sprite.projection;
    const bounds = scaledSpriteBounds(sprite.asset, scale);
    const anchorRow = Math.floor(y),
      bottom = Math.min(height - 1, Math.ceil(y + bounds.bottom));
    // The ground the rows below lie on: the merge has drawn every farther terrain row, so the nearer ones start at
    // `lineIndex`; followed to the first facing away, or to the picture's bottom row.
    let groundNear = sprite.d;
    for (let i = lineIndex; i < terrain.length; i++) {
      const line = terrain[i]!;
      if (line.away) break;
      groundNear = line.d;
      if (line.y >= bottom) break;
    }
    let runStart = 0;
    for (let row = Math.max(0, anchorRow + 1); row <= bottom; row++) {
      let line = -1;
      for (let i = rowFirst[row]!; i < rowFirst[row + 1]!; i++)
        if (terrain[rowLines[i]!]!.d < sprite.d) {
          line = rowLines[i]!;
          break;
        }
      if (line < 0 || terrain[line]!.d < groundNear) continue;
      drawRows(sprite, runStart, row);
      runStart = row + 1;
      const entry = laidSprite.length;
      laidSprite.push(index);
      laidRow.push(row);
      laidNext.push(-1);
      if (laidFirst[line]! < 0) laidFirst[line] = entry;
      else laidNext[laidLast[line]!] = entry;
      laidLast[line] = entry;
    }
    drawRows(sprite, runStart, height);
  };
  // The pictures at the player's depth or beyond join the terrain merge; the nearer ones follow the player.
  let nearSprites = sprites.length;
  if (playerProjection) while (nearSprites > 0 && sprites[nearSprites - 1]!.d < playerProjection.depth) nearSprites--;
  let lineIndex = 0,
    spriteIndex = 0;
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
      // Then the picture rows lying on this ground row, far anchors to near.
      for (let entry = laidFirst[lineIndex++]!; entry >= 0; entry = laidNext[entry]!)
        drawRows(sprites[laidSprite[entry]!]!, laidRow[entry]!, laidRow[entry]! + 1);
    },
    (sprite) => drawSprite(sprite, spriteIndex++),
    nearSprites,
  );

  const playerStats = selected
    ? drawScaledSprite(target, selected.asset, playerProjection!.x, playerProjection!.y, playerProjection!.scale)
    : { outputSamples: 0, writtenPixels: 0 };
  for (let i = nearSprites; i < sprites.length; i++) drawRows(sprites[i]!, 0, height);

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
  measurements.playerScreenX = playerProjection?.x ?? NaN;
  measurements.playerScreenY = playerProjection?.y ?? NaN;
  measurements.playerYawVariant = selected?.yawIndex ?? -1;
  measurements.playerBankVariant = selected?.bankIndex ?? -1;
  measurements.playerRelativeYaw = relativeYaw;
  measurements.spriteOutputSamplesIncludingPlayer = spriteOutputSamples + playerStats.outputSamples;
  measurements.spriteWrittenPixelsIncludingPlayer = spriteWrittenPixels + playerStats.writtenPixels;
}
