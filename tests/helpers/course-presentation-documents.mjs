import { masterDocument, backgroundDocument } from './indexed-images.mjs';
import { readFile } from 'node:fs/promises';
import { imageInput, savedImageInput } from './course-image-input.mjs';

/** Explicit saved diagnostic presentation; no production art/filter or seam readiness claim. */
export async function presentationDocument(name = 'linked-linear') {
  const document = JSON.parse(await readFile(new URL(`../fixtures/${name}.course.json`, import.meta.url), 'utf8'));
  const tile = imageInput('tile'),
    scenery = imageInput('tree');
  const background = savedImageInput('sky', backgroundDocument());
  const stamp = savedImageInput('stamp', {
    ...masterDocument(2, 2, [0x7fff, 0], [1, 0, 0, 2], 'stamp'),
    anchorX: -0.5,
    anchorY: -0.5,
  });
  const images = [tile, scenery, background, stamp];
  document.assets = images.map((image) => image.reference);
  document.sceneryInstances = [{ id: 'shared-tree', assetId: 'tree', paletteRgb555: null }];
  for (const section of document.sections) {
    section.assetIds = document.assets.map((asset) => asset.id);
    section.presentation = {
      ground: {
        left: 12,
        right: 12,
        baseRgb555: 0x1111,
        bands: section.bands.map((band) => ({
          bandId: band.id,
          sections: [
            { anchor: structuredClone(band.start), paint: { assetId: 'tile', phaseS: 0, phaseL: 0, alternate: null } },
          ],
        })),
        stamps: [],
      },
      environments: [
        {
          anchor: { kind: 'absolute', s: 0 },
          name: 'coast',
          groundBaseLeft: 0x1234,
          groundBaseRight: null,
          background: { assetId: 'sky', horizonY: 320, yawOrigin: section.start.heading },
        },
      ],
      sceneryRows: [],
      scenery: [
        {
          id: 'near-tree',
          instanceId: 'shared-tree',
          unselectedCarriagewayId: null,
          anchor: { kind: 'absolute', s: 50 },
          l: 8,
          groundOffset: 1.5,
        },
      ],
    };
  }
  return { document, images, inputs: images.map((image) => image.input) };
}
