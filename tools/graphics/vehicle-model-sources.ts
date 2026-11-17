import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { VEHICLE_SPRITE_SET_FORMAT, VEHICLE_SPRITE_SET_VERSION } from '../../src/vehicle/vehicle-sprite-library.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import type { ContentStore } from '../authoring/content-store.js';
import { readGlbModel, type GlbModel } from './glb-model.js';
import { buildModelVehicleSolid } from './model-vehicle-solid.js';
import { VEHICLE_PICTURE_SOURCES_DIRECTORY } from './vehicle-picture-recipe.js';
import { readVehicleModelRecipe, type ModelPaintRecipe, type VehicleModelRecipe } from './vehicle-model-recipe.js';
import { drawVehicleSpriteSet, type VehiclePictureStyle } from './vehicle-pictures.js';
import { drawModelSpriteSet } from './vehicle-role-pictures.js';

/**
 * Generate vehicle sprite set `set` from its model recipe, `vehicle-picture-sources/<set>.json`, and `model`, the GLB
 * the recipe names by its SHA-256, which is given from outside the repository; a model of another SHA-256 is refused
 * before anything is drawn. Returns the set as its saved file, `sprites/<set>.json`.
 */
export async function generateModelSpriteSet(
  store: ContentStore,
  set: string,
  recipeValue: unknown,
  model: Uint8Array<ArrayBuffer>,
  PNG: typeof PngDecoder,
  progress: (done: number, of: number) => void = () => {},
) {
  const recipe = requireLoaded(
    admit(`content/${VEHICLE_PICTURE_SOURCES_DIRECTORY}/${set}.json`, () => readVehicleModelRecipe(recipeValue)),
  );
  const digest = await contentDigest(model);
  if (digest !== recipe.model.sha256)
    throw new RangeError(`The model's SHA-256 is ${digest}; the recipe is for ${recipe.model.sha256}`);
  const mechanicsPath = `vehicles/${recipe.vehicle}.json`;
  const mechanicsBytes = await store.read(mechanicsPath);
  const { source } = requireLoaded(
    compileVehicleMechanicsDocument(
      JSON.parse(new TextDecoder().decode(mechanicsBytes)),
      recipe.vehicle,
      `content/${mechanicsPath}`,
      await contentDigest(mechanicsBytes),
    ),
  );
  return drawModelSet(recipe, model, source.frontAxle, PNG, set, progress);
}

/**
 * The set a model recipe makes of a model whose identity is checked, its front axle `frontAxle` ahead of the base
 * point: by roles, one bank image; by paints, the recipe's bank images through the shared baker.
 */
export function drawModelSet(
  recipe: VehicleModelRecipe,
  model: Uint8Array,
  frontAxle: number,
  PNG: typeof PngDecoder,
  set: string,
  progress: (done: number, of: number) => void = () => {},
) {
  const glb = readGlbModel(model, PNG);
  const done = (directions: number) => progress(directions, recipe.yawVariants);
  const document =
    'paints' in recipe
      ? drawPaintedSet(glb, recipe, frontAxle, done)
      : drawModelSpriteSet(buildModelVehicleSolid(glb, recipe, frontAxle), recipe, CAMERA_DEFINITION, done);
  return {
    document,
    path: `sprites/${set}.json`,
    bytes: new TextEncoder().encode(
      formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document }),
    ),
  };
}

/** A model colored by paints, drawn by the shared baker in its bank images, from leaning left to leaning right. */
function drawPaintedSet(glb: GlbModel, recipe: ModelPaintRecipe, frontAxle: number, progress: (done: number) => void) {
  const { count, degrees } = recipe.banks ?? { count: 1, degrees: 0 };
  const solids = Array.from({ length: count }, (_, k) =>
    buildModelVehicleSolid(
      glb,
      recipe,
      frontAxle,
      count > 1 ? (((2 * k) / (count - 1) - 1) * degrees * Math.PI) / 180 : 0,
    ),
  );
  const style: VehiclePictureStyle = {
    yawVariants: recipe.yawVariants,
    slots: {
      body: recipe.slots.body,
      ramps: recipe.paints.colors.length,
      neutral: recipe.slots.neutral,
      glass: 0,
      accent: 0,
    },
    bodyKeys: recipe.bodyKeys,
    palettes: recipe.palettes,
    brakeLamp: recipe.brakeLamp,
    paint: { exposure: recipe.exposure },
    // No sample is glass.
    glass: { glint: 255 },
  };
  return drawVehicleSpriteSet(
    count > 1 ? solids : solids[0]!,
    style,
    CAMERA_DEFINITION,
    progress,
    count > 1 ? degrees : 0,
  );
}
