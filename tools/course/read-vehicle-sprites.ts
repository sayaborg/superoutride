import { readFile } from 'node:fs/promises';
import { readSpriteAssets } from '../../src/image/sprite-assets.js';

/** A headless composition root loads the same completed library as the browser, before measurement. */
export async function readVehicleSprites() {
  return readSpriteAssets(
    JSON.parse(await readFile(new URL('../../dist/content/sprites/vehicles.json', import.meta.url), 'utf8')),
  );
}
