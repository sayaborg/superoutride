import { readDeliveredContent } from './read-content.js';
import { readSpriteAssets } from '../../src/image/sprite-assets.js';

/** A headless composition root loads the same completed library as the browser, before measurement. */
export async function readVehicleSprites() {
  return readSpriteAssets(await (await readDeliveredContent()).json('image', 'vehicles'));
}
