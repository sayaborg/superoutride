import { compileContent } from '../authoring/compile-content.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { layoutDelivery } from '../authoring/delivery-layout.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { createNodeContentStore } from './node-content-store.js';
import { ORIGINALS_INDEX, originalsRequested, readOriginals } from './originals.js';

/**
 * The content build: the authoring core compiles `content/` into every delivered file, the saved measured products'
 * included, which this script writes to `dist/delivery` in the delivery layout. It runs no driving. A local build with
 * the originals (`npm run build:originals`) compiles them in place of the published files of their paths, and lists
 * them in `dist/originals.json`.
 */
const published = createNodeContentStore();
const originals = originalsRequested() ? await readOriginals(published) : null;
const compiled = await compileContent(originals ? createLayeredStore(published, originals) : published);
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
if (originals) {
  await writeFile(
    new URL(`../../dist/${ORIGINALS_INDEX}`, import.meta.url),
    JSON.stringify({ format: 'superoutride.local-originals', version: 1, files: [...originals.keys()] }) + '\n',
  );
  console.log(`Compiled ${originals.size} local originals in place of the published files`);
}
console.log('Validated and staged manifest content');
