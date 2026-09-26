import { admit, readEmbedded } from '../../src/core/admission.js';
import { readSpriteAssets, readVehicleSpriteLibrary } from '../../src/image/sprite-assets.js';
import { compileSpriteLod } from './sprite-lod-compiler.js';

/**
 * Compile the authored vehicle sprite masters into the delivered library. The library reader admits
 * the masters and their set bindings; each admitted image compiles with its set's lamp colors, and the
 * completed library is admitted again so vehicle admission can use it directly.
 */
export function compileVehicleSpriteLibrary(value: unknown, document: string) {
  const compiled = admit(document, () => {
    const masters = readVehicleSpriteLibrary(value, false);
    const { sprites } = masters.document;
    const product = {
      ...masters.document,
      sprites: sprites.map((image, index) => {
        const lamp = masters.brakeLamps[index]!;
        return readEmbedded(`/sprites/${index}`, () => compileSpriteLod(image, [[lamp.off], [lamp.on]]));
      }),
    };
    return { masters: masters.document, product };
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const { masters, product } = compiled.value;
  const admitted = admit(document, () => readSpriteAssets(product));
  if (!admitted.ok) throw new Error(JSON.stringify(admitted.diagnostics));
  return { masters, product, sprites: admitted.value };
}
