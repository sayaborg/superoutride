import type { BoardRecord } from './viewer-boards.js';

/**
 * The board a ray from the eye meets first where its picture is opaque (its master texel's palette index is not 0):
 * each of its quads is two triangles, and the hit's texel is interpolated across the triangle it meets.
 */
export function pickBoard(
  records: readonly BoardRecord[],
  origin: readonly number[],
  direction: readonly number[],
  shown: (record: BoardRecord, lying: boolean) => boolean,
): { record: BoardRecord; lying: boolean; distance: number } | null {
  let best: { record: BoardRecord; lying: boolean; distance: number } | null = null;
  for (const record of records)
    for (const quad of record.quads) {
      if (!shown(record, quad.lying)) continue;
      for (const [a, b, c] of [
        [0, 1, 2],
        [2, 1, 3],
      ] as const) {
        const hit = intersect(quad.corners, a, b, c, origin, direction);
        if (!hit || (best && hit.t >= best.distance)) continue;
        const u = quad.texels[2 * a]! * (1 - hit.u - hit.v) + quad.texels[2 * b]! * hit.u + quad.texels[2 * c]! * hit.v,
          v =
            quad.texels[2 * a + 1]! * (1 - hit.u - hit.v) +
            quad.texels[2 * b + 1]! * hit.u +
            quad.texels[2 * c + 1]! * hit.v;
        const level = record.image.levels[0]!;
        const x = Math.min(level.width - 1, Math.max(0, Math.floor(u))),
          y = Math.min(level.height - 1, Math.max(0, Math.floor(v)));
        if (!level.pattern.indexAt(y * level.width + x)) continue;
        best = { record, lying: quad.lying, distance: hit.t };
      }
    }
  return best;
}

/** Möller–Trumbore: where the ray meets triangle (a, b, c) of `p`, its distance and barycentric (u toward b, v toward c). */
function intersect(
  p: readonly number[],
  a: number,
  b: number,
  c: number,
  origin: readonly number[],
  direction: readonly number[],
) {
  const e1 = [0, 1, 2].map((i) => p[3 * b + i]! - p[3 * a + i]!),
    e2 = [0, 1, 2].map((i) => p[3 * c + i]! - p[3 * a + i]!);
  const h = cross(direction, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return null;
  const s = [0, 1, 2].map((i) => origin[i]! - p[3 * a + i]!);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = dot(direction, q) / det;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) / det;
  return t > 0 ? { t, u, v } : null;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
