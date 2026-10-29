import { readFile, rm } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { readChangeArchive, type ArchivedChange } from '../browser-shared/change-archive.js';
import { inOriginalsPlace } from '../authoring/content-places.js';
import { compileContent } from '../authoring/compile-content.js';
import { planMeasurement } from '../authoring/measure.js';
import { importedImageFiles, importSpriteSource, SPRITE_SOURCES_DIRECTORY } from '../graphics/sprite-import.js';
import { reportError } from '../course/authoring-io.js';
import { requireInput } from '../authoring/authoring-error.js';
import { CONTENT_ROOT, createNodeContentStore } from './node-content-store.js';

/**
 * Apply an editing page's archive of changes to `content/` ([Development](../../docs/development.md#applying-changes)).
 * Nothing is written when a changed file's digest in the checkout is not the one the archive names (an added file must
 * not exist), or when the archive changes a file in the originals' place. Every sprite source the archive changes is
 * imported again here and its course images written, never the archive's; a picture whose bytes differ from the
 * archive's is listed. The courses whose measured products are then stale are named.
 */
const USAGE = 'Usage: npm run apply-changes -- <archive.zip>';
const store = createNodeContentStore();

const [file, ...args] = process.argv.slice(2);
try {
  requireInput(file && !args.length, '/arguments', USAGE);
  const read = readChangeArchive(new Uint8Array(await readFile(file!)));
  requireInput(read.ok, '/archive', read.ok ? '' : read.diagnostics.map((d) => d.message).join('; '));
  const { commit, changes } = read.value;

  // Every check comes before any write.
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
  const archived = new Map(changes.map((change) => [change.path, change]));
  const ownImages = new Set(sources.flatMap((name) => [`images/${name}.json`, `images/${name}-mirrored.json`]));
  const written: string[] = [],
    deleted: string[] = [];
  for (const change of changes) if (!ownImages.has(change.path)) await apply(change);
  const imported: string[] = [],
    differing: string[] = [];
  for (const name of sources) {
    const { recipe, master } = await importSpriteSource(store, name, PNG);
    for (const image of importedImageFiles(recipe, master)) {
      await store.write(image.path, image.bytes);
      imported.push(image.path);
      const theirs = archived.get(image.path)?.bytes;
      if (theirs && !equalBytes(theirs, image.bytes)) differing.push(image.path);
    }
  }

  // What the measurement tool must measure again, from the content as it now stands.
  const compiled = await compileContent(store, { measured: false });
  const measure = compiled.ok
    ? await planMeasurement(store, compiled.value, false).then((plan) => [
        ...new Set([...plan.jobs.flatMap((job) => job.courses), ...plan.racingLines]),
      ])
    : null;
  console.log(
    JSON.stringify({
      ok: true,
      build: commit,
      written,
      deleted,
      imported,
      // Pictures this checkout's import makes otherwise than the archive's: name each in the PR.
      differing,
      measure,
      ...(compiled.ok ? {} : { diagnostics: compiled.diagnostics }),
    }),
  );
  // Applied, but the content does not compile: the diagnostics say why.
  if (!compiled.ok) process.exitCode = 1;

  async function apply(change: ArchivedChange) {
    if (change.bytes) {
      await store.write(change.path, change.bytes);
      written.push(change.path);
    } else {
      await rm(new URL(change.path, CONTENT_ROOT));
      deleted.push(change.path);
    }
  }
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
