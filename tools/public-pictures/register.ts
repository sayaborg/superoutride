import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { LinearSample } from '../graphics/sprite-colors.js';
import { REGISTRATION_IOU_LIMIT, registerSpriteSource } from '../graphics/sprite-registration.js';
import type { SpriteRaster } from '../graphics/sprite-layers.js';

/** The trial's registration: the shared fit, then the trial's two-texel clip; diagnostics are measured before it. */
export function registerPublicSource(image: SourceImage, reference: SpriteRaster) {
  const { transform, iou, edges, measured } = registerSpriteSource(image, reference);
  const passed = iou >= REGISTRATION_IOU_LIMIT && Object.values(edges).every((v) => Math.abs(v) <= 2);
  const referenceAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < reference.width && y < reference.height && reference.indices[y * reference.width + x]! > 0;
  const samples: LinearSample[] = [];
  for (let y = 0; y < reference.height; y++)
    for (let x = 0; x < reference.width; x++) {
      let keep = false;
      for (let dy = -2; dy <= 2 && !keep; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (dx * dx + dy * dy <= 4 && referenceAt(x + dx, y + dy)) {
            keep = true;
            break;
          }
      const sample = measured.samples[(y - measured.top) * measured.width + x - measured.left]!;
      samples.push(keep ? sample : { coverage: 0, red: 0, green: 0, blue: 0 });
    }
  return {
    transform,
    diagnostics: {
      iou,
      edges,
      passed,
      thresholds: { iou: REGISTRATION_IOU_LIMIT, edgeTexels: 2 },
      clipTexels: 2,
    },
    samples,
  };
}
