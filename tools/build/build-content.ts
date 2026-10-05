import { compileContent } from '../authoring/compile-content.js';
import { createContentWriter } from './content-manifest.js';
import { createNodeContentStore } from './node-content-store.js';

/**
 * The content build: the authoring core compiles `content/` into every delivered file, the saved measured products'
 * included, which this script writes to `dist/delivery` with the manifest. It runs no driving.
 */
const writer = createContentWriter(new URL('../../dist/delivery/', import.meta.url));
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
for (const file of content.files) await writer.stage(file.kind, file.id, null, file.bytes);
for (const course of content.courses) console.log(`${course.id}.course.json: Strip ground compiled`);
await writer.save();
console.log('Validated and staged manifest content');
