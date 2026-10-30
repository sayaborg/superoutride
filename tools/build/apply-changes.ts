import { readFile, rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { readChangeArchive } from '../browser-shared/change-archive.js';
import { imagePath, inOriginalsPlace, readContentPlaces } from '../authoring/content-places.js';
import { compileContent } from '../authoring/compile-content.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { staleMeasurements } from '../authoring/measure.js';
import { importedImageFiles, importSpriteSource, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import { reportError } from '../course/authoring-io.js';
import { requireInput } from '../authoring/authoring-error.js';
import { CONTENT_ROOT, createNodeContentStore } from './node-content-store.js';

/**
 * Apply an editing page's archive of changes to `content/` ([Development](../../docs/development.md#applying-changes)).
 * Everything is checked before anything is written, on the checkout seen through the archive: each changed file's
 * digest in the checkout is the one the archive names (an added file must not exist), no file in the originals' place
 * changes, every sprite source the archive adds or changes imports again here to course images whose names lie outside
 * the originals' place, and the content compiles. Those images are this import's, never the archive's: `<name>` and,
 * with `mirror`, `<name>-mirrored`, a `-mirrored` the import no longer makes being deleted. Then it writes, prints what
 * it wrote, deleted and imported and each picture whose bytes differ from the archive's, and last the courses whose
 * measured products are stale, found without solving or running anything.
 */
const USAGE = 'Usage: npm run apply-changes -- <archive.zip>';
const store = createNodeContentStore();

const [file, ...args] = process.argv.slice(2);
try {
  requireInput(file && !args.length, '/arguments', USAGE);
  const read = readChangeArchive(new Uint8Array(await readFile(file!)));
  requireInput(read.ok, '/archive', read.ok ? '' : read.diagnostics.map((d) => d.message).join('; '));
  const { commit, changes } = read.value;

  const originals = changes.filter((change) => inOriginalsPlace(change.path)).map((change) => change.path);
  requireInput(!originals.length, '/archive', `The archive changes originals, which nothing applies: ${originals}`);
  const moved: string[] = [];
  for (const change of changes) {
    const found = await digestInCheckout(change.path);
    if (found !== change.base)
      moved.push(`${change.path} (${change.base === null ? 'added, but it exists' : 'changed in the checkout since'})`);
  }
  requireInput(!moved.length, '/archive', `The checkout differs from build ${commit}: ${moved.join('; ')}`);

  // The sprite sources the archive adds or changes; their course images are this checkout's import, not the archive's.
  const sources = [
    ...new Set(
      changes
        .filter((change) => change.bytes && change.path.startsWith(`${SPRITE_SOURCES_DIRECTORY}/`))
        .map((change) => change.path.slice(SPRITE_SOURCES_DIRECTORY.length + 1).replace(/\.(png|json)$/, '')),
    ),
  ];
  const imagesOf = (name: string) => [`images/${name}.json`, `images/${name}-mirrored.json`];
  const ownImages = new Set(sources.flatMap(imagesOf));
  const places = await readContentPlaces(store);
  const taken = sources
    .flatMap((name) => [name, `${name}-mirrored`])
    .filter((name) => inOriginalsPlace(imagePath(places, name)));
  requireInput(
    !taken.length,
    '/archive',
    `Sprite sources would write pictures the originals hold: ${taken.join(', ')}`,
  );

  // The checkout seen through the archive's files (its images of those sources aside), then through this import.
  const overlay = new Map<string, Uint8Array<ArrayBuffer> | null>(
    changes.filter((change) => !ownImages.has(change.path)).map((change) => [change.path, change.bytes]),
  );
  const seen = createLayeredStore(store, overlay);
  const archived = new Map(changes.map((change) => [change.path, change.bytes]));
  const imported: string[] = [],
    differing: string[] = [];
  for (const name of sources) {
    const { recipe, master } = await importSpriteSource(seen, name, PNG);
    const files = importedImageFiles(recipe, master);
    for (const image of files) {
      overlay.set(image.path, image.bytes);
      imported.push(image.path);
      const theirs = archived.get(image.path);
      if (theirs && !equalBytes(theirs, image.bytes)) differing.push(image.path);
    }
    // A reflection the import no longer makes goes.
    const mirrored = imagesOf(name)[1]!;
    if (!files.some((image) => image.path === mirrored)) {
      overlay.delete(mirrored);
      if ((await digestInCheckout(mirrored)) !== null) overlay.set(mirrored, null);
    }
  }
  const compiled = await compileContent(seen, { measured: false });
  requireInput(
    compiled.ok,
    '/archive',
    compiled.ok ? '' : `The content would not compile; nothing is written: ${JSON.stringify(compiled.diagnostics)}`,
  );

  const written: string[] = [],
    deleted: string[] = [];
  for (const [path, bytes] of overlay) {
    if (bytes) {
      await store.write(path, bytes);
      if (!imported.includes(path)) written.push(path);
    } else {
      await rm(new URL(path, CONTENT_ROOT));
      deleted.push(path);
    }
  }
  // Pictures this checkout's import makes otherwise than the archive's: name each in the PR.
  console.log(JSON.stringify({ ok: true, build: commit, written, deleted, imported, differing }));
  const stale = await staleMeasurements(store, compiled.value);
  console.log(JSON.stringify({ measure: stale.courses, engineLoudness: stale.loudness }));
} catch (error) {
  reportError(error);
}

/** The digest of `path` in the checkout, or null without the file. */
async function digestInCheckout(path: string): Promise<string | null> {
  try {
    return await contentDigest(await store.read(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
