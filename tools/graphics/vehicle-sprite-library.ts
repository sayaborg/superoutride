import { admit, readEmbedded } from '../../src/core/admission.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { readSpriteAssets, type SpriteAssets } from '../../src/image/sprite-assets.js';
import { compileSpriteLod } from './sprite-lod-compiler.js';

interface VehicleSpriteMasters {
  readonly sprites: readonly SpriteLodDocument[];
  readonly sets: Readonly<
    Record<string, { readonly assets: number[][]; readonly brakeLamp: { off: number; on: number } }>
  >;
}

/**
 * Compile the authored vehicle sprite masters into the delivered library. The library reader admits
 * the masters and their set bindings; each image compiles with its set's lamp colors, and the completed
 * library is admitted again so vehicle admission can use it directly.
 */
export function compileVehicleSpriteLibrary(value: unknown, document: string) {
  const masters = value as VehicleSpriteMasters;
  const compiled = admit(document, () => {
    readSpriteAssets(masters, false);
    return {
      ...masters,
      sprites: masters.sprites.map((image, index) => {
        const lamp = Object.values(masters.sets).find((set) => set.assets.flat().includes(index))!.brakeLamp;
        return readEmbedded(`/sprites/${index}`, () => compileSpriteLod(image, [[lamp.off], [lamp.on]]));
      }),
    };
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const product = compiled.value;
  const admitted = admit(document, () => readSpriteAssets(product));
  if (!admitted.ok) throw new Error(JSON.stringify(admitted.diagnostics));
  return { masters, product, sprites: admitted.value satisfies SpriteAssets };
}
