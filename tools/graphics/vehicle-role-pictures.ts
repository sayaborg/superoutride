import { rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { VEHICLE_PICTURE_SIZES, type VehicleSpriteSetDocument } from '../../src/vehicle/vehicle-sprite-library.js';
import type { CameraDefinition } from '../../src/view/camera.js';
import { modelRoleOf, type ModelRoleRecipe } from './vehicle-model-recipe.js';
import { drawSize, framePicture, type DrawnSize, type TexelRoles } from './vehicle-pictures.js';
import type { Rgb } from './vehicle-picture-recipe.js';
import type { VehicleSolid } from './vehicle-solid.js';

/**
 * A model's sprite set by roles: the pictures of the [picture contract](../../docs/image-assets.md#picture-contract),
 * drawn by the shared baker's cameras, sizes and shadows, whose texels take colors by role instead of the baker's
 * palette quantization and are lit by a brightness of their own (`TexelRoles`). Each surface point takes the first role
 * its base color passes; a texel takes the role most of its points have, and the role's color, or the shade color where
 * its brightness (that of its role's points) is below the role's `dark` share of the role's bright texels (the recipe's
 * quantile of that role's texels over every direction at size 0). On the steps' sizes a texel whose role's points lie
 * in step cells for at least the steps' share of them is drawn in the shade color too. On the recipe's isolated sizes a
 * texel none of whose eight neighbours shares its color then takes the color most of them have. Up to the kept role's
 * last size, a picture showing that role in no texel, while one texel's points are at least `shows` of that role, draws
 * its fullest such texel in the role's color. No color between two is made.
 */
export function drawModelSpriteSet(
  solid: VehicleSolid,
  recipe: ModelRoleRecipe,
  camera: Pick<CameraDefinition, 'focalLength' | 'height'>,
  progress: (done: number) => void = () => {},
): VehicleSpriteSetDocument {
  const roles = modelTexelRoles(solid, recipe),
    { kept } = roles;
  const slotOf = (entry: string) => recipe.colors.indexOf(entry) + 1;
  const roleSlots = recipe.roles.map((role) => slotOf(role.color)),
    shadeSlot = slotOf(recipe.shade);

  const drawn: DrawnSize[][] = [];
  for (let i = 0; i < recipe.yawVariants; i++)
    drawn.push(
      Array.from({ length: VEHICLE_PICTURE_SIZES }, (_, size) =>
        drawSize(solid, roles, camera, (i * 2 * Math.PI) / recipe.yawVariants, size),
      ),
    );

  // Each role's bright texels, over every direction at size 0.
  const byRole = recipe.roles.map(() => [] as number[]);
  for (const sizes of drawn) {
    const { indices, brightness } = sizes[0]!;
    for (let k = 0; k < indices.length; k++) if (indices[k]) byRole[indices[k]! - 1]!.push(brightness[k]!);
  }
  const bright = byRole.map((values) => {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.floor(recipe.bright * values.length))]!;
  });

  const pictures = drawn.map((sizes, i) => {
    const colored = sizes.map((size, level) => {
      const { width, height, indices, brightness, keptShare, stepShare } = size;
      const slots = new Uint8Array(indices.length);
      for (let k = 0; k < indices.length; k++) {
        const role = indices[k]! - 1;
        if (role < 0) continue;
        const shaded =
          brightness[k]! < recipe.roles[role]!.dark * bright[role]! ||
          (recipe.steps.sizes.includes(level) && stepShare[k]! >= recipe.steps.share);
        slots[k] = shaded ? shadeSlot : roleSlots[role]!;
      }
      const cells = recipe.isolatedSizes.includes(level) ? isolatedTaken(slots, width, height) : slots;
      if (level <= recipe.keep.toSize && !cells.includes(roleSlots[kept]!)) {
        let fullest = -1;
        for (let k = 0; k < cells.length; k++)
          if (cells[k] && keptShare[k]! >= recipe.keep.shows && (fullest < 0 || keptShare[k]! > keptShare[fullest]!))
            fullest = k;
        if (fullest >= 0) cells[fullest] = roleSlots[kept]!;
      }
      return { ...size, indices: cells };
    });
    progress(i + 1);
    return framePicture(colored);
  });

  const rgb555 = ([r, g, b]: Rgb) => rgbaToRgb555(rgba(r, g, b));
  const palette = (entries: Readonly<Record<string, Rgb>>) =>
    Array.from({ length: 14 }, (_, k) => rgb555(entries[recipe.colors[k] ?? recipe.rest]!));
  const first = Object.values(recipe.palettes)[0]!;
  return {
    yawVariants: recipe.yawVariants,
    bankVariants: 1,
    palettes: Object.fromEntries(Object.entries(recipe.palettes).map(([name, entries]) => [name, palette(entries)])),
    brakeLamp: { off: rgb555(first[recipe.shade]!), on: rgb555(first[recipe.shade]!) },
    assets: pictures.map((_, i) => [i]),
    pictures,
  };
}

/**
 * Each opaque texel none of whose eight neighbours has its slot takes the slot most of them have (the lowest of
 * equals); one without an opaque neighbour keeps its own. Every texel is judged on the slots before any change.
 */
function isolatedTaken(slots: Uint8Array, width: number, height: number): Uint8Array {
  const out = Uint8Array.from(slots);
  const counts = new Uint8Array(16);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const own = slots[y * width + x]!;
      if (!own) continue;
      counts.fill(0);
      let same = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const neighbour = slots[(y + dy) * width + x + dx]!;
          if (neighbour === own) same = true;
          if (neighbour) counts[neighbour]!++;
        }
      if (same) continue;
      let best = 0;
      for (let s = 1; s < 16; s++) if (counts[s]! > counts[best]!) best = s;
      if (best) out[y * width + x] = best;
    }
  return out;
}

/** The roles of a model's solid as the baker reads them: each point's role, and the albedo and gloss it gives it. */
export function modelTexelRoles(solid: VehicleSolid, recipe: ModelRoleRecipe): TexelRoles {
  // Each point's role, and the albedo and gloss its role gives it.
  const points = new Uint8Array(solid.count),
    albedo = new Float32Array(solid.count * 3),
    gloss = new Float32Array(solid.count);
  const [lr, lg, lb] = recipe.luma;
  for (let n = 0; n < solid.count; n++) {
    const r = solid.colors[n * 3]! / 255,
      g = solid.colors[n * 3 + 1]! / 255,
      b = solid.colors[n * 3 + 2]! / 255;
    const role = recipe.roles[(points[n] = modelRoleOf(recipe, r * 255, g * 255, b * 255))]!;
    const { of, times } = role.albedo;
    const luma = Math.min(1, (lr * r + lg * g + lb * b) * times);
    const channels = of === 'luma' ? [luma, luma, luma] : [r * times, g * times, b * times];
    for (let c = 0; c < 3; c++) albedo[n * 3 + c] = channels[c]!;
    gloss[n] = role.gloss;
  }
  const kept = recipe.roles.findIndex((role) => role.name === recipe.keep.role);
  return {
    points,
    count: recipe.roles.length,
    kept,
    albedo,
    gloss,
    light: recipe.light,
    hollows: recipe.hollows,
    steps: recipe.steps,
  };
}
