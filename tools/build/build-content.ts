import { requireLoaded } from '../../src/content/content-load-error.js';
import { compileContent } from '../authoring/compile-content.js';
import { buildCourseReferences } from './build-course-reference.js';
import { createContentWriter } from './content-manifest.js';
import { createNodeContentStore } from './node-content-store.js';

/**
 * The content build: the authoring core compiles `content/` into every delivered file, which this script writes to
 * `dist/delivery` with the manifest, then reference runs. Reference workers run in separate threads and read this
 * build's saved content until 15-2.
 */
const writer = createContentWriter(new URL('../../dist/delivery/', import.meta.url));
const content = requireLoaded(await compileContent(createNodeContentStore()));
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
// Reference workers run in separate threads and read this build's saved content.
await writer.save();
// Every catalog vehicle receives an envelope; only series courses × series candidate vehicles receive reference runs
// and budgets.
await buildCourseReferences(content.seriesCourses, content.definitions, writer.stage);
await writer.save();
console.log('Validated and staged manifest content');
