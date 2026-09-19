import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [site, sha] = process.argv.slice(2);
if (!site || !/^[0-9a-f]{40}$/.test(sha ?? ''))
  throw new Error('Usage: verify-published-course.mjs <Pages URL> <commit>');
const root = new URL(site.endsWith('/') ? site : `${site}/`);
const expected = JSON.parse(await readFile(new URL('../../dist/content/manifest.json', import.meta.url), 'utf8'));
async function bytes(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, String(url));
  return Buffer.from(await response.arrayBuffer());
}
let failure;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    assert.equal((await bytes(new URL(`version.txt?verify=${sha}`, root))).toString().trim(), sha);
    const build = new URL(`build/${sha}/`, root);
    assert.ok((await bytes(new URL('boot.js', build))).length > 0);
    assert.ok((await bytes(new URL('main-course.js', build))).length > 0);
    const manifest = JSON.parse(await bytes(new URL('content/manifest.json', build)));
    assert.deepEqual(manifest, expected);
    for (const entry of manifest.files) {
      const actual = createHash('sha256')
        .update(await bytes(new URL(`content/${entry.path}`, build)))
        .digest('hex');
      assert.equal(actual, entry.sha256, entry.path);
    }
    console.log(JSON.stringify({ publishedCommit: sha, files: manifest.files.length, verified: true }));
    failure = null;
    break;
  } catch (error) {
    failure = error;
    console.error(`Published course attempt ${attempt}: ${error.message}`);
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
if (failure) throw failure;
