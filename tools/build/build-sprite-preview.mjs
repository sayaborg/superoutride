import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Stage the same diagnostic under the coherent build root; no unversioned module import remains.
const output = new URL('../../dist/tools/graphics/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['sprite-lod.html', 'sprite-lod.mjs']) {
  const source = await readFile(new URL(`../graphics/${name}`, import.meta.url), 'utf8');
  await writeFile(new URL(name, output), source.replaceAll('../../dist/', '../../'));
}
