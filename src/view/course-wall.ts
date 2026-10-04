import type { CourseWallAppearance, CourseWallBand } from '../course/course-appearance.js';
import type { PseudoCamera } from './projection.js';
import type { SoftwareSurface } from './software-surface.js';

/** A visible wall on the Route: its route stations, its lateral on the route ruler, and its compiled picture. */
export interface RouteWall {
  readonly start: number;
  readonly end: number;
  readonly lateralAt: (s: number) => number;
  readonly picture: CourseWallAppearance;
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

/**
 * Paint one wall's column for a terrain row, right after the row's ground, at the same depth. Its screen x comes from the
 * row's own affine lateral mapping; it rises `top` and drops `bottom` metres from the row at the depth's scale, and fills
 * across to the x of the previous (farther) row this frame, `previousX`, so a surface joins the columns. Height picks the
 * band; the station along the wall picks the pattern entry, or the blended period where the row's footprint is wider
 * than the shortest entry. Returns the column's x for the next row and adds the written pixels to `stats`.
 */
export function drawWallColumn(
  target: SoftwareSurface,
  wall: RouteWall,
  row: WallRow,
  camera: PseudoCamera,
  previousX: number,
  stats: { wallPixels: number },
): number {
  const { picture } = wall;
  const x = row.xGroundL + (wall.lateralAt(row.s) + 1) * 0.5 * (row.xGroundR - row.xGroundL);
  const scale = (camera.focalLength / row.d) * Math.cos(camera.pitch);
  const ground = row.y + 0.5;
  const from = Number.isNaN(previousX) ? x : previousX;
  const x0 = Math.max(0, Math.floor(Math.min(from, x))),
    x1 = Math.min(target.width - 1, Math.floor(Math.max(from, x)));
  const y0 = Math.max(0, Math.ceil(ground - picture.top * scale - 0.5)),
    y1 = Math.min(target.height - 1, Math.floor(ground - picture.bottom * scale - 0.5));
  if (x1 < x0 || y1 < y0) return x;
  let bands: readonly CourseWallBand[] = picture.far;
  if (row.deltaS <= picture.shortestEntry) {
    const along = (((row.s - wall.start) % picture.period) + picture.period) % picture.period;
    bands = picture.entries.find((entry) => along < entry.to)?.bands ?? picture.entries.at(-1)!.bands;
  }
  // Rows run upward from the column's foot, so the band index only rises.
  let band = 0;
  for (let y = y1; y >= y0; y--) {
    const height = (ground - (y + 0.5)) / scale;
    while (band < bands.length - 1 && bands[band]!.to < height) band++;
    const color = bands[band]!.color;
    if (color === null) continue;
    target.pixels.fill(color, y * target.width + x0, y * target.width + x1 + 1);
    stats.wallPixels += x1 - x0 + 1;
  }
  return x;
}
