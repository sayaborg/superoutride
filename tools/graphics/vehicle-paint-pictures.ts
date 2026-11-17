import { rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { VEHICLE_PICTURE_SIZES, type VehicleSpriteSetDocument } from '../../src/vehicle/vehicle-sprite-library.js';
import type { CameraDefinition } from '../../src/view/camera.js';
import type { ModelPaintRecipe } from './vehicle-model-recipe.js';
import { drawSize, framePicture, type DrawnSize, type TexelRoles } from './vehicle-pictures.js';
import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';

/** The brightness of a color by which its steps are told apart. */
const LUMA = [0.3, 0.59, 0.11] as const;
/** The farthest size whose pictures keep a brake lamp texel, and the share of a texel that keeps it. */
const LAMP_KEPT_TO_SIZE = 4;
const LAMP_SHOWS = 0.02;
/** No step lines. */
const NO_STEPS = Object.freeze({ sizes: [], reach: 0, depth: 0, share: 1 });

/**
 * A model's sprite set colored by paints: the pictures of the [picture contract](../../docs/image-assets.md#picture-contract)
 * drawn by the shared baker's cameras, sizes and shadows, every bank image of every direction. Each sample is of a
 * paint (its base color within the recipe's reach of that paint's), of the brake lamp, or grey; it is lit by the
 * recipe's light, fixed to the picture, with its base color as albedo and the recipe's gloss. A texel takes the group
 * most of its samples have and, of a paint or the greys, the mean lit color of that group's samples alone, so no color
 * is mixed across two groups. Each group's steps are measured from the pictures: at size 0, of every `sampleYaws`th
 * direction and every bank, the texels of the group are split by brightness into its number of steps (one-dimensional
 * k-means from even quantiles), each step the mean color of its texels. A texel takes the step of its group nearest
 * its brightness; a lamp texel slot 15, and up to size 4 a picture showing no lamp draws its fullest lamp texel so.
 * Slots run each paint's steps, then the greys', each from dark to light. The first livery is the model's own paints
 * in the measured steps; another livery's paint steps keep the measured steps' relation to the paint (each step `a`
 * times the paint plus `b` of white, fitted to the measured step) about its own color.
 */
export function drawPaintedSpriteSet(
  banks: readonly VehicleSolid[],
  recipe: ModelPaintRecipe,
  camera: Pick<CameraDefinition, 'focalLength' | 'height'>,
  progress: (done: number) => void = () => {},
): VehicleSpriteSetDocument {
  const paints = recipe.paints.colors.length,
    grey = paints,
    lamp = paints + 1;
  const roles = banks.map((solid) => paintRoles(solid, recipe));
  const drawn: DrawnSize[][][] = [];
  for (let i = 0; i < recipe.yawVariants; i++) {
    const yaw = (i * 2 * Math.PI) / recipe.yawVariants;
    drawn.push(
      banks.map((solid, bank) =>
        Array.from({ length: VEHICLE_PICTURE_SIZES }, (_, size) => drawSize(solid, roles[bank]!, camera, yaw, size)),
      ),
    );
    progress(i + 1);
  }

  // Each group's texels at size 0 in the sampled directions, as brightness and color.
  const stride = recipe.yawVariants / recipe.ramps.sampleYaws;
  const samples = Array.from({ length: paints + 1 }, () => ({ luma: [] as number[], rgb: [] as number[] }));
  for (let i = 0; i < recipe.yawVariants; i += stride)
    for (const sizes of drawn[i]!) {
      const { indices, color } = sizes[0]!;
      for (let k = 0; k < indices.length; k++) {
        const group = indices[k]! - 1;
        if (group < 0 || group === lamp) continue;
        const r = color[k * 3]! * 255,
          g = color[k * 3 + 1]! * 255,
          b = color[k * 3 + 2]! * 255;
        samples[group]!.luma.push(LUMA[0] * r + LUMA[1] * g + LUMA[2] * b);
        samples[group]!.rgb.push(r, g, b);
      }
    }
  const counts = [...recipe.ramps.paints, recipe.ramps.grey];
  const steps = samples.map(({ luma, rgb }, group) => measureSteps(luma, rgb, counts[group]!));
  const firstSlot = counts.map((_, group) => 1 + counts.slice(0, group).reduce((sum, n) => sum + n, 0));

  const pictures = [];
  const assets: number[][] = [];
  for (const row of drawn) {
    const cells: number[] = [];
    for (const sizes of row) {
      const colored = sizes.map((size, level) => {
        const { indices, color, keptShare } = size;
        const slots = new Uint8Array(indices.length);
        let lampShown = false;
        for (let k = 0; k < indices.length; k++) {
          const group = indices[k]! - 1;
          if (group < 0) continue;
          if (group === lamp) {
            slots[k] = 15;
            lampShown = true;
            continue;
          }
          const luma = (LUMA[0] * color[k * 3]! + LUMA[1] * color[k * 3 + 1]! + LUMA[2] * color[k * 3 + 2]!) * 255;
          slots[k] = firstSlot[group]! + nearest(steps[group]!.centres, luma);
        }
        if (level <= LAMP_KEPT_TO_SIZE && !lampShown) {
          let fullest = -1;
          for (let k = 0; k < slots.length; k++)
            if (slots[k] && keptShare[k]! >= LAMP_SHOWS && (fullest < 0 || keptShare[k]! > keptShare[fullest]!))
              fullest = k;
          if (fullest >= 0) slots[fullest] = 15;
        }
        return { ...size, indices: slots };
      });
      cells.push(pictures.length);
      pictures.push(framePicture(colored));
    }
    assets.push(cells);
  }

  const rgb555 = ([r, g, b]: Rgb) => rgbaToRgb555(rgba(r, g, b));
  const greys = steps[grey]!.colors;
  const [own, ...others] = Object.keys(recipe.liveries);
  const palette = (livery: readonly Rgb[], measured: boolean) =>
    [
      ...livery.flatMap((color, paint) =>
        measured
          ? steps[paint]!.colors
          : steps[paint]!.colors.map((step) => recolored(step, recipe.paints.colors[paint]!, color)),
      ),
      ...greys,
    ].map(rgb555);
  return {
    yawVariants: recipe.yawVariants,
    bankVariants: banks.length,
    ...(banks.length > 1 ? { bankDegrees: recipe.banks!.degrees } : {}),
    palettes: Object.fromEntries([
      [own!, palette(recipe.liveries[own!]!, true)],
      ...others.map((name) => [name, palette(recipe.liveries[name]!, false)]),
    ]),
    brakeLamp: { off: rgb555(recipe.brakeLamp.off), on: rgb555(recipe.brakeLamp.on) },
    assets,
    pictures,
  };
}

/** A solid's samples as the baker reads them: each sample's group (a paint, grey, the lamp), its albedo and gloss. */
function paintRoles(solid: VehicleSolid, recipe: ModelPaintRecipe): TexelRoles {
  const { colors, within, lamp } = recipe.paints;
  const near = (color: Rgb, n: number) =>
    Math.abs(solid.colors[n * 3]! - color[0]) <= within &&
    Math.abs(solid.colors[n * 3 + 1]! - color[1]) <= within &&
    Math.abs(solid.colors[n * 3 + 2]! - color[2]) <= within;
  const points = new Uint8Array(solid.count),
    albedo = new Float32Array(solid.count * 3),
    gloss = new Float32Array(solid.count).fill(recipe.gloss);
  for (let n = 0; n < solid.count; n++) {
    const paint = colors.findIndex((color) => near(color, n));
    points[n] = paint >= 0 ? paint : near(lamp, n) ? colors.length + 1 : colors.length;
    for (let c = 0; c < 3; c++) albedo[n * 3 + c] = solid.colors[n * 3 + c]! / 255;
  }
  return {
    points,
    count: colors.length + 2,
    kept: colors.length + 1,
    albedo,
    gloss,
    light: recipe.light,
    hollows: null,
    steps: NO_STEPS,
  };
}

/**
 * Split brightness values into `count` steps by one-dimensional k-means, started from even quantiles and run until no
 * value moves; each step's centre is its values' mean brightness and its color their mean color, rounded. A step no
 * value reaches keeps its starting centre and takes the color of the value nearest it.
 */
export function measureSteps(luma: readonly number[], rgb: readonly number[], count: number) {
  if (!luma.length) throw new RangeError('A group has no texel to measure its steps from');
  const order = Array.from(luma.keys()).sort((a, b) => luma[a]! - luma[b]! || a - b);
  const sorted = order.map((i) => luma[i]!);
  let centres = Array.from({ length: count }, (_, j) => sorted[Math.floor(((j + 0.5) / count) * sorted.length)]!);
  const assigned = new Int32Array(sorted.length).fill(-1);
  for (let round = 0; round < 1000; round++) {
    let moved = false;
    for (let i = 0; i < sorted.length; i++) {
      const step = nearest(centres, sorted[i]!);
      if (step !== assigned[i]) {
        assigned[i] = step;
        moved = true;
      }
    }
    if (!moved) break;
    const sums = new Float64Array(count),
      sizes = new Float64Array(count);
    for (let i = 0; i < sorted.length; i++) {
      sums[assigned[i]!]! += sorted[i]!;
      sizes[assigned[i]!]!++;
    }
    centres = centres.map((centre, j) => (sizes[j] ? sums[j]! / sizes[j]! : centre));
  }
  const colors = centres.map((centre, j): Rgb => {
    const members = order.filter((_, i) => assigned[i] === j);
    const chosen = members.length
      ? members
      : [
          order[
            sorted.reduce((best, v, i) => (Math.abs(v - centre) < Math.abs(sorted[best]! - centre) ? i : best), 0)
          ]!,
        ];
    const mean = (c: number) => Math.round(chosen.reduce((sum, i) => sum + rgb[i * 3 + c]!, 0) / chosen.length);
    return [mean(0), mean(1), mean(2)];
  });
  return { centres, colors };
}

/** The index of the centre nearest `value` (the first of equals); centres rise. */
function nearest(centres: readonly number[], value: number) {
  let best = 0;
  for (let j = 1; j < centres.length; j++)
    if (Math.abs(centres[j]! - value) < Math.abs(centres[best]! - value)) best = j;
  return best;
}

/**
 * A measured step of `paint` carried to another color: the step as `a` times the paint plus `b` of white, fitted by
 * least squares over the channels, applied to `color` and rounded into 0–255.
 */
export function recolored(step: Rgb, paint: Rgb, color: Rgb): Rgb {
  // Normal equations of step ≈ a·paint + b·255 over three channels.
  let pp = 0,
    p1 = 0,
    ps = 0,
    s1 = 0;
  for (let c = 0; c < 3; c++) {
    pp += paint[c]! * paint[c]!;
    p1 += paint[c]! * 255;
    ps += paint[c]! * step[c]!;
    s1 += step[c]! * 255;
  }
  const oo = 3 * 255 * 255;
  const det = pp * oo - p1 * p1;
  const a = det ? (ps * oo - p1 * s1) / det : 0,
    b = det ? (pp * s1 - p1 * ps) / det : s1 / oo;
  const channel = (c: number) => Math.min(255, Math.max(0, Math.round(a * color[c]! + b * 255)));
  return [channel(0), channel(1), channel(2)];
}
