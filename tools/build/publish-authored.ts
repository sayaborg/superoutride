import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { contentDigest } from '../../src/core/content-digest.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { AUTHORED_DIRECTORY, AUTHORED_INDEX_FORMAT, readAuthoredIndex } from '../authoring/authored-index.js';

/**
 * Publish the build's authored files beside its delivery: every file under `content/` that belongs to the repository
 * (tracked, or new and not ignored), copied under `dist/authored/` with an index of paths and SHA-256 digests. The game
 * never reads them; the workbench opens them.
 */
const run = promisify(execFile);
const root = new URL('../../', import.meta.url);
const git = async (...args: string[]) => (await run('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout;
const listed = (await git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'content')).split('\0');
const commit = (await git('rev-parse', 'HEAD')).trim();
const output = new URL(`dist/${AUTHORED_DIRECTORY}/`, root);
const files = [];
for (const file of listed.filter((name) => name.startsWith('content/')).sort()) {
  const path = file.slice('content/'.length);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await readFile(new URL(file, root)));
  } catch (error) {
    // A tracked file deleted in the working tree is not part of this build.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    throw error;
  }
  const target = new URL(path, output);
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, bytes);
  files.push({ path, sha256: await contentDigest(bytes) });
}
const index = requireLoaded(readAuthoredIndex({ ...AUTHORED_INDEX_FORMAT, commit, files }));
await writeFile(new URL('index.json', output), JSON.stringify(index) + '\n');
console.log(`Published ${files.length} authored files`);
