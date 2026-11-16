import { baseColorAt, type GlbModel } from './glb-model.js';
import type { VehicleModelRecipe } from './vehicle-model-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';

/** The plastic constant of the R2 sequence: its two strides spread the samples of a triangle evenly and alike. */
const R2 = 1.324717957244746;
const R2_U = 1 / R2,
  R2_V = 1 / (R2 * R2);

/**
 * A vehicle's solid from its model, the third source beside four views and procedural shapes: the model's triangles
 * sampled evenly by area at the recipe's spacing, each sample carrying its texture's base color and its normal (the
 * model's vertex normals interpolated across the triangle, else the face's), in vehicle coordinates. The recipe's axes
 * turn the model to the vehicle's right, up and forward; the model then stands with its front wheels' mean origin
 * `frontAxle` ahead of the base point and its lowest sample on the road. Its samples are neither paint nor glass: a
 * model's pictures are lit by their roles ([vehicle role pictures](./vehicle-role-pictures.ts)). The same model and
 * recipe make the same solid: the samples follow the triangles' order, each triangle taking its share of one running
 * count.
 */
export function buildModelVehicleSolid(model: GlbModel, recipe: VehicleModelRecipe, frontAxle: number): VehicleSolid {
  const { spacing } = recipe;
  const axis = (signed: string) => ({ index: 'xyz'.indexOf(signed[1]!), sign: signed[0] === '-' ? -1 : 1 });
  const basis = [recipe.model.right, recipe.model.up, recipe.model.forward].map(axis);
  /** A model point or direction in vehicle axes (before the base point's offsets). */
  const turn = (x: number, y: number, z: number, out: number[], at: number) => {
    const m = [x, y, z];
    for (let k = 0; k < 3; k++) out[at + k] = basis[k]!.sign * m[basis[k]!.index]!;
  };
  const wheels = recipe.model.frontWheels.map((name) => {
    const origin = model.origins.get(name);
    if (!origin) throw new RangeError(`The model has no node ${name}`);
    return origin;
  });
  const axle: number[] = [0, 0, 0];
  turn(
    wheels.reduce((sum, w) => sum + w[0], 0) / wheels.length,
    wheels.reduce((sum, w) => sum + w[1], 0) / wheels.length,
    wheels.reduce((sum, w) => sum + w[2], 0) / wheels.length,
    axle,
    0,
  );
  const forwardShift = frontAxle - axle[2]!;

  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const cellArea = spacing * spacing;
  let carry = 0,
    sequence = 0;
  const p = [0, 0, 0],
    n = [0, 0, 0];
  for (const primitive of model.primitives) {
    const { positions: vertices, normals: vertexNormals, uvs, corners, material } = primitive;
    for (let t = 0; t < corners.length; t += 3) {
      const a = corners[t]!,
        b = corners[t + 1]!,
        c = corners[t + 2]!;
      const ax = vertices[a * 3]!,
        ay = vertices[a * 3 + 1]!,
        az = vertices[a * 3 + 2]!;
      const e1x = vertices[b * 3]! - ax,
        e1y = vertices[b * 3 + 1]! - ay,
        e1z = vertices[b * 3 + 2]! - az;
      const e2x = vertices[c * 3]! - ax,
        e2y = vertices[c * 3 + 1]! - ay,
        e2z = vertices[c * 3 + 2]! - az;
      // The face's normal by its winding, counter-clockwise in front as glTF has it.
      const nx = e1y * e2z - e1z * e2y,
        ny = e1z * e2x - e1x * e2z,
        nz = e1x * e2y - e1y * e2x;
      const twice = Math.hypot(nx, ny, nz);
      if (!(twice > 0)) continue;
      carry += twice / 2 / cellArea;
      const count = Math.floor(carry);
      carry -= count;
      if (!count) continue;
      turn(nx / twice, ny / twice, nz / twice, n, 0);
      for (let k = 0; k < count; k++, sequence++) {
        let s = (0.5 + R2_U * sequence) % 1,
          q = (0.5 + R2_V * sequence) % 1;
        if (s + q > 1) {
          s = 1 - s;
          q = 1 - q;
        }
        turn(ax + e1x * s + e2x * q, ay + e1y * s + e2y * q, az + e1z * s + e2z * q, p, 0);
        if (vertexNormals) {
          const w = 1 - s - q;
          const mx = vertexNormals[a * 3]! * w + vertexNormals[b * 3]! * s + vertexNormals[c * 3]! * q,
            my = vertexNormals[a * 3 + 1]! * w + vertexNormals[b * 3 + 1]! * s + vertexNormals[c * 3 + 1]! * q,
            mz = vertexNormals[a * 3 + 2]! * w + vertexNormals[b * 3 + 2]! * s + vertexNormals[c * 3 + 2]! * q;
          const length = Math.hypot(mx, my, mz);
          if (length > 0) turn(mx / length, my / length, mz / length, n, 0);
          else turn(nx / twice, ny / twice, nz / twice, n, 0);
        }
        const u = uvs[a * 2]! * (1 - s - q) + uvs[b * 2]! * s + uvs[c * 2]! * q,
          v = uvs[a * 2 + 1]! * (1 - s - q) + uvs[b * 2 + 1]! * s + uvs[c * 2 + 1]! * q;
        const [r, g, bl] = baseColorAt(material, u, v);
        positions.push(p[0]!, p[1]!, p[2]! + forwardShift);
        normals.push(n[0]!, n[1]!, n[2]!);
        colors.push(r, g, bl);
      }
    }
  }
  const count = positions.length / 3;
  if (!count) throw new RangeError('The model gives no surface to sample');
  let lowest = Infinity;
  for (let i = 1; i < positions.length; i += 3) lowest = Math.min(lowest, positions[i]!);
  let reach = 0,
    height = 0;
  const columns = new Map<string, readonly [number, number]>();
  const placed = new Float32Array(positions.length);
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]!,
      y = positions[i * 3 + 1]! - lowest,
      z = positions[i * 3 + 2]!;
    placed[i * 3] = x;
    placed[i * 3 + 1] = y;
    placed[i * 3 + 2] = z;
    reach = Math.max(reach, Math.hypot(x, z));
    height = Math.max(height, y);
    columns.set(`${Math.round(x / spacing)},${Math.round(z / spacing)}`, [x, z]);
  }
  return {
    count,
    positions: placed,
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    edge: new Float32Array(count),
    paint: new Uint8Array(count),
    glass: new Uint8Array(count),
    lamp: new Uint8Array(count),
    footprint: Float32Array.from([...columns.values()].flat()),
    reach,
    height,
  };
}
