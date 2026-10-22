import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';

/** Authored geometry in metres: right, up, forward, about the common vehicle base point. */
export type Point3 = readonly [number, number, number];
export type SurfaceColor = Rgb | ((position: Point3, normal: Point3) => Rgb);
const BLACK: Rgb = [16, 16, 18],
  METAL: Rgb = [140, 144, 148];
const length = (a: Point3) => Math.hypot(...a);
const unit = (a: Point3): Point3 => {
  const n = length(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * A deterministic surface sampler for provisional authored shapes. Its output uses the same camera, palette,
 * shadows, anchors and LOD baker as a four-view solid. No runtime geometry or vehicle physics is introduced.
 */
export function createProceduralVehicleSolid(spacing = 0.008) {
  if (!(spacing > 0 && Number.isFinite(spacing))) throw new RangeError('Surface spacing must be finite and positive');
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const point = (position: Point3, normal: Point3, color: SurfaceColor) => {
    positions.push(...position);
    normals.push(...normal);
    colors.push(...(typeof color === 'function' ? color(position, normal) : color));
  };
  const segments = (extent: number) => Math.max(1, Math.ceil(extent / spacing));
  const box = (center: Point3, half: Point3, color: SurfaceColor) => {
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const nu = segments(2 * half[u]!),
        nv = segments(2 * half[v]!);
      for (const side of [-1, 1])
        for (let j = 0; j <= nv; j++)
          for (let i = 0; i <= nu; i++) {
            const p: [number, number, number] = [...center],
              n: [number, number, number] = [0, 0, 0];
            p[axis] = p[axis]! + side * half[axis]!;
            p[u] = p[u]! + half[u]! * ((2 * i) / nu - 1);
            p[v] = p[v]! + half[v]! * ((2 * j) / nv - 1);
            n[axis] = side;
            point(p, n, color);
          }
    }
  };
  const ellipsoid = (center: Point3, radius: Point3, color: SurfaceColor) => {
    const rings = segments(Math.PI * Math.max(...radius));
    for (let j = 0; j <= rings; j++) {
      const phi = (j * Math.PI) / rings,
        y = Math.cos(phi),
        band = Math.sin(phi);
      const around = Math.max(4, segments(2 * Math.PI * Math.max(radius[0], radius[2]) * band));
      for (let i = 0; i < around; i++) {
        const theta = (i * 2 * Math.PI) / around,
          x = Math.cos(theta) * band,
          z = Math.sin(theta) * band;
        point(
          [center[0] + x * radius[0], center[1] + y * radius[1], center[2] + z * radius[2]],
          unit([x / radius[0], y / radius[1], z / radius[2]]),
          color,
        );
      }
    }
  };
  const cylinder = (from: Point3, to: Point3, radius: number, color: SurfaceColor) => {
    const delta: Point3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]],
      span = length(delta);
    if (!(span > 0 && radius > 0)) throw new RangeError('A cylinder needs positive length and radius');
    const axis = unit(delta),
      u = unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])),
      v = cross(axis, u);
    const around = Math.ceil(segments(2 * Math.PI * radius) / 4) * 4,
      along = segments(span);
    const radial = (angle: number): Point3 => [
      u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
      u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
      u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
    ];
    for (let j = 0; j <= along; j++)
      for (let i = 0; i < around; i++) {
        const n = radial((i * 2 * Math.PI) / around);
        point(
          [
            from[0] + (delta[0] * j) / along + n[0] * radius,
            from[1] + (delta[1] * j) / along + n[1] * radius,
            from[2] + (delta[2] * j) / along + n[2] * radius,
          ],
          n,
          color,
        );
      }
    for (const end of [0, 1])
      for (let r = 0; r <= segments(radius); r++) {
        const rad = (radius * r) / segments(radius),
          steps = Math.max(4, segments(2 * Math.PI * rad));
        for (let i = 0; i < steps; i++) {
          const n = radial((i * 2 * Math.PI) / steps),
            sign = end * 2 - 1;
          point(
            [
              from[0] + delta[0] * end + n[0] * rad,
              from[1] + delta[1] * end + n[1] * rad,
              from[2] + delta[2] * end + n[2] * rad,
            ],
            [axis[0] * sign, axis[1] * sign, axis[2] * sign],
            color,
          );
        }
      }
  };
  /** A dry tire with rounded shoulders, sidewalls, hub and authored spoke count; no tire motion is simulated. */
  const wheel = (center: Point3, radius: number, width: number, rim: Rgb, spokes: number) => {
    const around = Math.ceil(segments(2 * Math.PI * radius) / 4) * 4,
      across = segments(width);
    for (let j = 0; j <= across; j++) {
      const fraction = (2 * j) / across - 1,
        shoulder = 1 - 0.08 * fraction ** 8;
      for (let i = 0; i < around; i++) {
        const a = (2 * Math.PI * i) / around,
          cy = Math.cos(a),
          sz = Math.sin(a);
        point(
          [center[0] + (fraction * width) / 2, center[1] + radius * shoulder * cy, center[2] + radius * shoulder * sz],
          unit([((0.64 * radius) / (width / 2)) * fraction ** 7, cy, sz]),
          BLACK,
        );
      }
    }
    const rings = segments(radius * 0.92);
    for (const side of [-1, 1])
      for (let j = 0; j <= rings; j++) {
        const r = (radius * 0.92 * j) / rings,
          steps = Math.max(4, segments(2 * Math.PI * r));
        for (let i = 0; i < steps; i++) {
          const a = (i * 2 * Math.PI) / steps,
            fraction = r / radius;
          const spoke = Math.cos(a * spokes) > 0.77;
          const color = fraction < 0.14 ? METAL : fraction < 0.68 && (fraction > 0.6 || spoke) ? rim : BLACK;
          point(
            [center[0] + (side * width) / 2, center[1] + r * Math.cos(a), center[2] + r * Math.sin(a)],
            [side, 0, 0],
            color,
          );
        }
      }
  };
  return Object.freeze({
    point,
    box,
    ellipsoid,
    cylinder,
    wheel,
    /** Bank the whole authored rider/body geometry about its ground line; keep the lowest tire point on the ground. */
    finish(bankRadians = 0): VehicleSolid {
      if (!positions.length || !Number.isFinite(bankRadians))
        throw new RangeError('A solid needs points and a finite bank');
      const count = positions.length / 3,
        p = new Float32Array(positions.length),
        n = new Float32Array(normals.length);
      const cos = Math.cos(bankRadians),
        sin = Math.sin(bankRadians);
      let lowest = Infinity,
        reach = 0,
        height = 0;
      for (let i = 0; i < count; i++) {
        const at = i * 3,
          x = positions[at]!,
          y = positions[at + 1]!;
        p[at] = x * cos + y * sin;
        p[at + 1] = y * cos - x * sin;
        p[at + 2] = positions[at + 2]!;
        n[at] = normals[at]! * cos + normals[at + 1]! * sin;
        n[at + 1] = normals[at + 1]! * cos - normals[at]! * sin;
        n[at + 2] = normals[at + 2]!;
        lowest = Math.min(lowest, p[at + 1]!);
      }
      const columns = new Map<string, readonly [number, number]>();
      for (let i = 0; i < count; i++) {
        const at = i * 3;
        p[at + 1] = p[at + 1]! - lowest;
        reach = Math.max(reach, Math.hypot(p[at]!, p[at + 2]!));
        height = Math.max(height, p[at + 1]!);
        columns.set(`${Math.round(p[at]! / spacing)},${Math.round(p[at + 2]! / spacing)}`, [p[at]!, p[at + 2]!]);
      }
      return {
        count,
        positions: p,
        normals: n,
        colors: Float32Array.from(colors),
        edge: new Float32Array(count),
        paint: new Uint8Array(count),
        glass: new Uint8Array(count),
        lamp: new Uint8Array(count),
        footprint: Float32Array.from([...columns.values()].flat()),
        reach,
        height,
      };
    },
  });
}
