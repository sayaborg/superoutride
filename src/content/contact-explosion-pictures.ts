import { admit } from '../core/admission.js';
import { readSpriteLodAsset, type SpriteLodAsset } from '../image/sprite.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';

/** The game effect's eight frames, in playback order; built and loaded by this one list. */
export const CONTACT_EXPLOSION_PICTURES = Object.freeze(
  Array.from({ length: 8 }, (_, frame) => `contact-explosion-${frame}`),
);

export async function loadContactExplosionPictures(content: ContentDelivery): Promise<readonly SpriteLodAsset[]> {
  return Object.freeze(
    await Promise.all(
      CONTACT_EXPLOSION_PICTURES.map(async (name) => {
        const value = await content.json('image', name);
        return requireLoaded(admit(`images/${name}.json`, () => readSpriteLodAsset(value)));
      }),
    ),
  );
}
