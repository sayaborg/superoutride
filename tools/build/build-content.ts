import { compileContent } from '../authoring/compile-content.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { layoutDelivery } from '../authoring/delivery-layout.js';
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
const { sets } = content.library.library;
const sizes = Object.values(sets).flatMap((set) => set.pictures.flatMap((picture) => picture.sizes));
console.log(
  JSON.stringify({
    vehiclePictures: Object.values(sets).reduce((n, set) => n + set.pictures.length, 0),
    vehiclePictureSizes: sizes.length,
    deliveredJsonBytes: Buffer.byteLength(JSON.stringify(content.library.library) + '\n'),
    patternBytes: sizes.reduce((n, size) => n + Math.ceil((size.width * size.height) / 2), 0),
    shadowPatternBytes: sizes.reduce((n, size) => n + Math.ceil((size.shadow.width * size.shadow.height) / 2), 0),
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
