import type { SpriteLodDocument, SpriteShadowDocument } from '../../src/image/sprite.js';

/** The one game-wide light of board shadows. Editing it rebuilds shadows without regenerating art. */
export const BOARD_SHADOW_LIGHT = Object.freeze({ elevation: 60, azimuth: 45 });
type Point = readonly [number, number];

/** The parts of a master its board shadow is cast from: its extent, base point and level 0's texels. */
export type BoardShadowCaster = Pick<SpriteLodDocument, 'width' | 'height' | 'anchorX' | 'anchorY'> & {
  readonly levels: readonly { readonly indices: readonly number[] }[];
};

/** Project opaque standing texel areas onto flat ground, then through the size-0 camera. */
export function boardShadow(
  master: BoardShadowCaster,
  light: Readonly<{ elevation: number; azimuth: number }> = BOARD_SHADOW_LIGHT,
): SpriteShadowDocument {
  if (!(
    Number.isFinite(light.elevation) &&
    light.elevation > 0 &&
    light.elevation <= 90 &&
    Number.isFinite(light.azimuth) &&
    Math.abs(light.azimuth) <= 90
  ))
    throw new RangeError('The board shadow light requires elevation (0, 90] and frontal azimuth [-90, 90]');
  const e = (light.elevation * Math.PI) / 180,
    a = (light.azimuth * Math.PI) / 180;
  const cotangent = light.elevation === 90 ? 0 : 1 / Math.tan(e);
  const dx = Math.sin(a) * cotangent,
    dz = Math.abs(light.azimuth) === 90 ? 0 : Math.cos(a) * cotangent;
  const anchorY = (master.anchorY ?? master.height - 0.5) + 0.5;
  const anchorX = master.anchorX + 0.5;
  const project = (x: number, y: number): Point => {
    const height = (anchorY - y) / 40,
      depth = 6 + height * dz;
    return [anchorX + (240 * ((x - anchorX) / 40 + height * dx)) / depth, anchorY + 480 / depth - 80];
  };
  const polygons: Point[][] = [];
  let left = Math.floor(anchorX),
    right = Math.ceil(anchorX),
    top = Math.floor(anchorY),
    bottom = Math.ceil(anchorY);
  for (let y = 0; y < Math.min(master.height, Math.ceil(anchorY)); y++)
    for (let x = 0; x < master.width; x++) {
      if (dz === 0 || !master.levels[0]!.indices[y * master.width + x]) continue;
      const y1 = Math.min(y + 1, anchorY);
      if (y1 <= y) continue;
      const polygon = [project(x, y), project(x + 1, y), project(x + 1, y1), project(x, y1)];
      polygons.push(polygon);
      for (const [px, py] of polygon) {
        left = Math.min(left, Math.floor(px));
        right = Math.max(right, Math.ceil(px));
        top = Math.min(top, Math.floor(py));
        bottom = Math.max(bottom, Math.ceil(py));
      }
    }
  const width = Math.max(1, right - left),
    height = Math.max(1, bottom - top);
  if (width * height > 1048576) throw new RangeError('A board shadow exceeds the master pixel limit');
  const indices = Array<number>(width * height).fill(0);
  for (const polygon of polygons) {
    const y0 = Math.max(top, Math.floor(Math.min(...polygon.map((p) => p[1]))));
    const y1 = Math.min(bottom, Math.ceil(Math.max(...polygon.map((p) => p[1]))));
    for (let y = y0; y < y1; y++) {
      const strip = clipRow(clipRow(polygon, y, true), y + 1, false);
      if (strip.length < 3) continue;
      const x0 = Math.max(left, Math.floor(Math.min(...strip.map((p) => p[0]))));
      const x1 = Math.min(right, Math.ceil(Math.max(...strip.map((p) => p[0]))));
      for (let x = x0; x < x1; x++) indices[(y - top) * width + x - left] = 1;
    }
  }
  return { width, height, anchorX: anchorX - left - 0.5, anchorY: anchorY - top - 0.5, levels: [{ indices }] };
}

/** Clip a convex projected texel to a horizontal half-plane. */
function clipRow(polygon: readonly Point[], edge: number, above: boolean): Point[] {
  const result: Point[] = [];
  if (!polygon.length) return result;
  let previous = polygon[polygon.length - 1]!;
  let wasInside = above ? previous[1] >= edge : previous[1] <= edge;
  for (const point of polygon) {
    const inside = above ? point[1] >= edge : point[1] <= edge;
    if (inside !== wasInside) {
      const t = (edge - previous[1]) / (point[1] - previous[1]);
      result.push([previous[0] + t * (point[0] - previous[0]), edge]);
    }
    if (inside) result.push(point);
    previous = point;
    wasInside = inside;
  }
  return result;
}
