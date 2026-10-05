import { compileContent } from '../authoring/compile-content.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { layoutDelivery } from './content-manifest.js';
import { createNodeContentStore } from './node-content-store.js';

/**
 * The content build: the authoring core compiles `content/` into every delivered file, the saved measured products'
 * included, which this script writes to `dist/delivery` in the delivery layout. It runs no driving.
 */
const compiled = await compileContent(createNodeContentStore());
// An expected content error prints its diagnostics alone; internal faults keep their stack.
if (!compiled.ok) {
  console.error(JSON.stringify(compiled.diagnostics));
  process.exit(1);
}
const content = compiled.value;
const { library } = content;
const levels = library.product.sprites.flatMap((sprite) => sprite.levels.slice(1));
console.log(
  JSON.stringify({
    spriteMasters: library.masters.sprites.length,
    spriteLevels: library.product.sprites.reduce((n, s) => n + s.levels.length, 0),
    masterJsonBytes: Buffer.byteLength(JSON.stringify(library.masters) + '\n'),
    deliveredJsonBytes: Buffer.byteLength(JSON.stringify(library.product) + '\n'),
    addedLodPatternBytes: levels.reduce((n, level) => n + Math.ceil(level.indices.length / 2), 0),
    addedLodRgb555PaletteBytes: levels.length * 32,
  }),
);
for (const course of content.courses) console.log(`${course.id}.course.json: Strip ground compiled`);
const root = new URL('../../dist/delivery/', import.meta.url);
// The layout lists the manifest last, so it is written after every file it indexes.
for (const [path, bytes] of await layoutDelivery(content.files)) {
  const target = new URL(path, root);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, bytes);
}
console.log('Validated and staged manifest content');
