import { admit } from '../core/admission.js';
import { compileTextTiles, type TextTiles } from '../image/text-tiles.js';
import type { ContentDelivery } from './content-delivery.js';
import { missingContent, requireLoaded } from './content-load-error.js';

/** The text tiles' manifest image ID. */
export const TEXT_TILES_ID = 'text-tiles';

/** Transport verifies the saved bytes before admission; each composition loads the text tiles once. */
export async function loadTextTiles(content: ContentDelivery): Promise<TextTiles> {
  const file = content.manifest.files.find((file) => file.kind === 'image' && file.id === TEXT_TILES_ID);
  if (!file) throw missingContent('image', TEXT_TILES_ID);
  const value = await content.json('image', TEXT_TILES_ID);
  return requireLoaded(admit(file.path, () => compileTextTiles(value)));
}
