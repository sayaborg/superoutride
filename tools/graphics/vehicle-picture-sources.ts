import type { PNG as PngDecoder } from 'pngjs';
import { admit } from '../../src/core/admission.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { compileVehicleMechanicsDocument } from '../../src/vehicle/definition-document.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import type { ContentStore } from '../authoring/content-store.js';
import { decodeSpritePng } from './sprite-png.js';
import {
  readVehiclePictureRecipe,
  VEHICLE_PICTURE_SOURCES_DIRECTORY,
  VEHICLE_VIEWS,
  type VehicleView,
} from './vehicle-picture-recipe.js';
import { drawVehicleSpriteSet } from './vehicle-pictures.js';
import { VEHICLE_SPRITE_SET_FORMAT, VEHICLE_SPRITE_SET_VERSION } from './vehicle-sprite-sets.js';
import { buildVehicleSolid, readViewPicture, type ViewPicture } from './vehicle-solid.js';

/**
 * Generate vehicle sprite set `set` from its sources under `vehicle-picture-sources/` (`<set>.json`, the recipe, and
 * the views `<set>-front.png`, `-side`, `-rear` and `-top`), the mechanics document its recipe names and the product
 * camera, and return it as its saved file, `sprites/<set>.json`.
 */
export async function generateVehicleSpriteSet(
  store: ContentStore,
  set: string,
  PNG: typeof PngDecoder,
  progress: (done: number, of: number) => void = () => {},
) {
  const base = `${VEHICLE_PICTURE_SOURCES_DIRECTORY}/${set}`;
  const json = async (path: string) => JSON.parse(new TextDecoder().decode(await store.read(path))) as unknown;
  const recipeValue = await json(`${base}.json`);
  const recipe = requireLoaded(admit(`content/${base}.json`, () => readVehiclePictureRecipe(recipeValue)));
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
  const views = {} as Record<VehicleView, ViewPicture>;
  for (const view of VEHICLE_VIEWS) {
    const { width, height, pixels } = await decodeSpritePng(await store.read(`${base}-${view}.png`), PNG);
    views[view] = readViewPicture(pixels, width, height, recipe.background);
  }
  const solid = buildVehicleSolid(
    recipe,
    {
      length: source.overallLength,
      width: source.overallWidth,
      height: source.overallHeight,
      frontAxle: source.frontAxle,
      rearAxle: source.rearAxle,
      frontWheelRadius: source.frontWheelRadius,
      rearWheelRadius: source.rearWheelRadius,
    },
    views,
  );
  const document = drawVehicleSpriteSet(solid, recipe, CAMERA_DEFINITION, (done) => progress(done, recipe.yawVariants));
  return {
    document,
    path: `sprites/${set}.json`,
    bytes: new TextEncoder().encode(
      formatSavedJson({ format: VEHICLE_SPRITE_SET_FORMAT, version: VEHICLE_SPRITE_SET_VERSION, ...document }),
    ),
  };
}
