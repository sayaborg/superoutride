import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.mjs';
import { createProjectionSpriteAssets } from '../../dist/dev/fixtures/projection-sprite-assets.js';

const assets = Object.freeze({ ...(await readVehicleSprites()), ...createProjectionSpriteAssets() });
export function createTestSpriteAssets() {
  return assets;
}
