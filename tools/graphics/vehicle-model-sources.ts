import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { VEHICLE_SPRITE_SET_FORMAT, VEHICLE_SPRITE_SET_VERSION } from '../../src/vehicle/vehicle-sprite-library.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import type { ContentStore } from '../authoring/content-store.js';
import { readGlbModel } from './glb-model.js';
import { buildModelVehicleSolid } from './model-vehicle-solid.js';
import { VEHICLE_PICTURE_SOURCES_DIRECTORY } from './vehicle-picture-recipe.js';
import { readVehicleModelRecipe, type VehicleModelRecipe } from './vehicle-model-recipe.js';
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
 * point.
 */
export function drawModelSet(
  recipe: VehicleModelRecipe,
  model: Uint8Array,
  frontAxle: number,
  PNG: typeof PngDecoder,
  set: string,
  progress: (done: number, of: number) => void = () => {},
) {
  const solid = buildModelVehicleSolid(readGlbModel(model, PNG), recipe, frontAxle);
  const document = drawModelSpriteSet(solid, recipe, CAMERA_DEFINITION, (done) => progress(done, recipe.yawVariants));
  return {
    document,
    solid,
    path: `sprites/${set}.json`,
    bytes: new TextEncoder().encode(
      formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document }),
    ),
  };
}
