import type { PseudoCamera } from './projection.js';
import type { SoftwareSurface } from './software-surface.js';
import type { StripGroundReader, StripRenderMetrics } from './strip-ground-sampler.js';
import type { StripRenderMethod } from './display-settings.js';

/**
 * A visible wall on the Route: its route stations, its lateral on the route ruler, the heights `bottom` to `top` its
 * opaque Strips span, and its color Strips read at route stations with height as lateral.
 */
export interface RouteWall {
  readonly start: number;
  readonly end: number;
  readonly lateralAt: (s: number) => number;
  readonly bottom: number;
  readonly top: number;
  readonly color: StripGroundReader;
}

/** One terrain row as a wall column reads it: depth, station, row, the l = ±1 screen x and the row's station footprint. */
interface WallRow {
  readonly d: number;
  readonly s: number;
  readonly y: number;
  readonly xGroundL: number;
  readonly xGroundR: number;
  readonly deltaS: number;
}

/** A renderer's wall scratch: one column of samples and the measurements. */
export interface WallWorkspace {
  column: Uint16Array;
  readonly strips: StripRenderMetrics;
  wallPixels: number;
}

/** Above every RGB555 color, so a column pixel the Strips left transparent keeps it. */
const UNWRITTEN = 0xffff;

/**
 * Paint one wall's column for a terrain row, right after the row's ground, at the same depth. Its screen x comes from the
 * row's own affine lateral mapping; it spans the wall's height range at the depth's scale and fills across to the x of the
 * previous (farther) row this frame, `previousX`, so a surface joins the columns. Each pixel row reads the wall's Strips
 * at its height, with the road's Strip sampler, `method` and the row's station footprint. Returns the column's x.
 */
export function drawWallColumn(
  target: SoftwareSurface,
  wall: RouteWall,
  row: WallRow,
  camera: PseudoCamera,
  previousX: number,
  method: StripRenderMethod,
  workspace: WallWorkspace,
): number {
  const x = row.xGroundL + (wall.lateralAt(row.s) + 1) * 0.5 * (row.xGroundR - row.xGroundL);
  const scale = (camera.focalLength / row.d) * Math.cos(camera.pitch);
  const ground = row.y + 0.5;
  const from = Number.isNaN(previousX) ? x : previousX;
  const x0 = Math.max(0, Math.floor(Math.min(from, x))),
    x1 = Math.min(target.width - 1, Math.floor(Math.max(from, x)));
  const y0 = Math.max(0, Math.ceil(ground - wall.top * scale - 0.5)),
    y1 = Math.min(target.height - 1, Math.floor(ground - wall.bottom * scale - 0.5));
  if (x1 < x0 || y1 < y0) return x;
  // Sample upward from the column's foot, one height per pixel row.
  const count = y1 - y0 + 1;
  if (workspace.column.length < count) workspace.column = new Uint16Array(target.height);
  const column = workspace.column;
  column.fill(UNWRITTEN, 0, count);
  wall.color.sampleSpan(
    column,
    0,
    count,
    row.s,
    (ground - (y1 + 0.5)) / scale,
    1 / scale,
    row.deltaS,
    method,
    workspace.strips,
  );
  for (let i = 0; i < count; i++) {
    const color = column[i]!;
    if (color === UNWRITTEN) continue;
    const y = y1 - i;
    target.pixels.fill(color, y * target.width + x0, y * target.width + x1 + 1);
    workspace.wallPixels += x1 - x0 + 1;
  }
  return x;
}
