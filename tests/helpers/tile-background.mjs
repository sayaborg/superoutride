import { readFile } from 'node:fs/promises';
import { TileBackgroundImage } from '../../dist/graphics/tile-background-image.js';

const document = JSON.parse(
  await readFile(new URL('../../content/courses/linear.course.json', import.meta.url), 'utf8'),
);
const background = document.sections[0].presentation.environments[0].background;
const reference = document.assets.find((asset) => asset.id === background.assetId);
const source = JSON.parse(
  await readFile(new URL(`../../content/images/${reference.sha256}.json`, import.meta.url), 'utf8'),
);
export function createTestBackground() {
  return Object.freeze({
    image: new TileBackgroundImage(source),
    sourceHorizonY: background.horizonY,
    yawOriginRadians: 0,
  });
}
