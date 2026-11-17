import { baseColorAt, type GlbModel } from './glb-model.js';
import type { ModelPaintRecipe, VehicleModelRecipe } from './vehicle-model-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';

/** The plastic constant of the R2 sequence: its two strides spread the samples of a triangle evenly and alike. */
const R2 = 1.324717957244746;
const R2_U = 1 / R2,
  R2_V = 1 / (R2 * R2);

/**
 * A vehicle's solid from its model, the third source beside four views and procedural shapes: the model's triangles
 * sampled evenly by area at the recipe's spacing, each sample carrying its texture's base color and its normal (the
 * model's vertex normals interpolated across the triangle, else the face's), in vehicle coordinates. The recipe's axes
 * turn the model to the vehicle's right, up and forward; the model then stands with its front axle (its front wheels'
 * mean origin, or its front hub) `frontAxle` ahead of the base point, turned by `bankRadians` about the line where it
 * meets the road (positive leaning it to its right, as a procedural solid's bank), and its lowest sample on the road. A
 * recipe colored by roles leaves its samples neither paint nor glass: its pictures are lit by their roles ([vehicle
 * role pictures](./vehicle-role-pictures.ts)). A recipe colored by paints makes each sample within reach of a paint's
 * color paint of that ramp, lit as its one color, and one within reach of the lamp's the brake lamp. The same model
 * and recipe make the same solid: the samples follow the triangles' order, each triangle taking its share of one
 * running count.
 */
export function buildModelVehicleSolid(
  model: GlbModel,
  recipe: VehicleModelRecipe,
  frontAxle: number,
  bankRadians = 0,
): VehicleSolid {
  const { spacing } = recipe;
  const axis = (signed: string) => ({ index: 'xyz'.indexOf(signed[1]!), sign: signed[0] === '-' ? -1 : 1 });
  const basis = [recipe.model.right, recipe.model.up, recipe.model.forward].map(axis);
  /** A model point or direction in vehicle axes (before the base point's offsets). */
  const turn = (x: number, y: number, z: number, out: number[], at: number) => {
    const m = [x, y, z];
    for (let k = 0; k < 3; k++) out[at + k] = basis[k]!.sign * m[basis[k]!.index]!;
  };
  const hub = recipe.model.frontHub ?? meanOrigin(model, recipe.model.frontWheels!);
  const axle: number[] = [0, 0, 0];
  turn(hub[0], hub[1], hub[2], axle, 0);
  const forwardShift = frontAxle - axle[2]!;
  const paints = 'paints' in recipe ? recipe.paints : null;
  const cos = Math.cos(bankRadians),
    sin = Math.sin(bankRadians);

  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    painted: number[] = [],
    lamps: number[] = [];
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
        if (bankRadians) {
          positions.push(p[0]! * cos + p[1]! * sin, p[1]! * cos - p[0]! * sin, p[2]! + forwardShift);
          normals.push(n[0]! * cos + n[1]! * sin, n[1]! * cos - n[0]! * sin, n[2]!);
        } else {
          positions.push(p[0]!, p[1]!, p[2]! + forwardShift);
          normals.push(n[0]!, n[1]!, n[2]!);
        }
        const ramp = paints ? paintOf(paints, r, g, bl) : 0;
        const lamp = paints && !ramp && near(paints.lamp, paints.within, r, g, bl) ? 1 : 0;
        painted.push(ramp);
        lamps.push(lamp);
        if (ramp) colors.push(...paints!.litAs);
        else colors.push(r, g, bl);
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
    paint: Uint8Array.from(painted),
    glass: new Uint8Array(count),
    lamp: Uint8Array.from(lamps),
    footprint: Float32Array.from([...columns.values()].flat()),
    reach,
    height,
  };
}

/** The mean origin of the model's nodes `names`. */
function meanOrigin(model: GlbModel, names: readonly string[]): readonly [number, number, number] {
  const wheels = names.map((name) => {
    const origin = model.origins.get(name);
    if (!origin) throw new RangeError(`The model has no node ${name}`);
    return origin;
  });
  const mean = (k: number) => wheels.reduce((sum, w) => sum + w[k]!, 0) / wheels.length;
  return [mean(0), mean(1), mean(2)];
}

/** Whether a base color lies within `within` of `color` in every channel. */
function near(color: readonly number[], within: number, r: number, g: number, b: number) {
  return Math.abs(r - color[0]!) <= within && Math.abs(g - color[1]!) <= within && Math.abs(b - color[2]!) <= within;
}

/** The ramp (from 1) of the first paint a base color lies within reach of, else 0. */
function paintOf(paints: ModelPaintRecipe['paints'], r: number, g: number, b: number) {
  return paints.colors.findIndex((color) => near(color, paints.within, r, g, b)) + 1;
}
