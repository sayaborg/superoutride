import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export async function writeSpriteArtifact(outputPath: string, inputs: readonly string[], product: SpriteLodDocument) {
  if (inputs.some((path) => resolve(path) === resolve(outputPath)))
    throw new Error('Sprite output must not overwrite source or recipe');
  const bytes = JSON.stringify(product) + '\n';
  await writeFile(outputPath, bytes, { flag: 'wx' });
  console.log(
    JSON.stringify({
      output: outputPath,
      width: product.width,
      height: product.height,
      levels: product.levels.length,
      bytes: Buffer.byteLength(bytes),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
}
