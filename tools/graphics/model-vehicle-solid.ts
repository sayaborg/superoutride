import { baseColorAt, type GlbModel } from './glb-model.js';
import type { ModelWheel, VehicleModelRecipe } from './vehicle-model-recipe.js';
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
 * meets the road (positive leaning it to its right, as a procedural solid's bank), and its lowest sample on the road.
 * The wheels a recipe colored by paints names are spun: what lies inside each rim is averaged over a turn. Its samples
 * are neither paint nor glass: a model's pictures take colors from their samples' base colors ([vehicle role
 * pictures](./vehicle-role-pictures.ts)). The same model and recipe make the same solid: the samples follow the
 * triangles' order, each triangle taking its share of one running count, and the spun wheels' rings follow them.
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
  const cos = Math.cos(bankRadians),
    sin = Math.sin(bankRadians);

  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  /** Add a sample at `p` (vehicle axes, before the base point's offsets) with normal `n` and its color. */
  const add = (p: readonly number[], n: readonly number[], r: number, g: number, b: number) => {
    if (bankRadians) {
      positions.push(p[0]! * cos + p[1]! * sin, p[1]! * cos - p[0]! * sin, p[2]! + forwardShift);
      normals.push(n[0]! * cos + n[1]! * sin, n[1]! * cos - n[0]! * sin, n[2]!);
    } else {
      positions.push(p[0]!, p[1]!, p[2]! + forwardShift);
      normals.push(n[0]!, n[1]!, n[2]!);
    }
    colors.push(r, g, b);
  };
  const spun = ('wheels' in recipe ? recipe.wheels : []).map((wheel) => spinning(wheel, turn, spacing));
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
        if (!spun.some((wheel) => wheel.take(p, n, r, g, bl))) add(p, n, r, g, bl);
      }
    }
  }
  for (const wheel of spun) wheel.turned(add);
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

/**
 * A wheel spun over a turn: the samples inside its rim (within half its width of its centre along the axle) are taken
 * from the solid, held in rings of `spacing` across the axle and out from it, and given back as rings of samples a
 * `spacing` apart round the axle, each ring the mean color of its samples and their mean normal turned round with it.
 * The tyre outside the rim is round already and stays as it is. The axle is the vehicle's right axis.
 */
function spinning(
  wheel: ModelWheel,
  turn: (x: number, y: number, z: number, out: number[], at: number) => void,
  spacing: number,
) {
  const centre: number[] = [0, 0, 0];
  turn(wheel.center[0], wheel.center[1], wheel.center[2], centre, 0);
  const half = wheel.width / 2;
  const across = Math.max(1, Math.ceil(wheel.width / spacing)),
    out = Math.max(1, Math.ceil(wheel.rim / spacing));
  // Each ring's sample count, color sums and normal sums along the axle and out from it.
  const rings = new Float64Array(across * out * 6);
  return {
    /** Take a sample (vehicle axes) when it lies inside the rim, adding it to its ring. */
    take(p: readonly number[], n: readonly number[], r: number, g: number, b: number) {
      const ax = p[0]! - centre[0]!,
        dy = p[1]! - centre[1]!,
        dz = p[2]! - centre[2]!;
      const radius = Math.hypot(dy, dz);
      if (Math.abs(ax) > half || radius >= wheel.rim) return false;
      const ring =
        (Math.min(out - 1, Math.floor(radius / spacing)) * across +
          Math.min(across - 1, Math.floor((ax + half) / spacing))) *
        6;
      rings[ring]!++;
      rings[ring + 1]! += r;
      rings[ring + 2]! += g;
      rings[ring + 3]! += b;
      rings[ring + 4]! += n[0]!;
      rings[ring + 5]! += radius > 0 ? (n[1]! * dy + n[2]! * dz) / radius : 0;
      return true;
    },
    /** Give back every ring as samples round the axle. */
    turned(add: (p: readonly number[], n: readonly number[], r: number, g: number, b: number) => void) {
      const p = [0, 0, 0],
        n = [0, 0, 0];
      for (let o = 0; o < out; o++)
        for (let a = 0; a < across; a++) {
          const ring = (o * across + a) * 6,
            count = rings[ring]!;
          if (!count) continue;
          const radius = (o + 0.5) * spacing,
            ax = (a + 0.5) * spacing - half;
          const axial = rings[ring + 4]! / count,
            outward = rings[ring + 5]! / count;
          const length = Math.hypot(axial, outward);
          const steps = Math.max(6, Math.ceil((2 * Math.PI * radius) / spacing));
          for (let k = 0; k < steps; k++) {
            const angle = (2 * Math.PI * k) / steps,
              c = Math.cos(angle),
              s = Math.sin(angle);
            p[0] = centre[0]! + ax;
            p[1] = centre[1]! + radius * c;
            p[2] = centre[2]! + radius * s;
            if (length > 0) {
              n[0] = axial / length;
              n[1] = (outward / length) * c;
              n[2] = (outward / length) * s;
            } else {
              n[0] = Math.sign(ax) || 1;
              n[1] = n[2] = 0;
            }
            add(p, n, rings[ring + 1]! / count, rings[ring + 2]! / count, rings[ring + 3]! / count);
          }
        }
    },
  };
}
