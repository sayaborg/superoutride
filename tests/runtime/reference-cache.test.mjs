import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { cachedReference, referenceCacheKey, digest } from '../../tools/course/reference-cache.mjs';

test('cache reuses each vehicle independently and rejects corrupt results without a manual regeneration', async (t) => {
  const directory = await mkdtemp(`${tmpdir()}/course-reference-`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(directory + '/');
  let calls = 0;
  const compute = async (vehicle) =>
    cachedReference(
      'runs',
      referenceCacheKey('course', digest(vehicle), 1, 'physics'),
      () => ({ measured: ++calls }),
      root,
    );
  const a = { id: 'a', authoredValue: 1 },
    b = { id: 'b', authoredValue: 1 };
  assert.equal((await compute(a)).hit, false);
  assert.equal((await compute(b)).hit, false);
  assert.equal((await compute(a)).hit, true);
  assert.equal((await compute(b)).hit, true);
  a.authoredValue = 2;
  assert.equal((await compute(a)).hit, false);
  assert.equal((await compute(b)).hit, true);
  assert.equal(calls, 3);
  for (const args of [
    ['changed', 'v', 1, 'p'],
    ['c', 'changed', 1, 'p'],
    ['c', 'v', 2, 'p'],
    ['c', 'v', 1, 'changed'],
  ])
    assert.notEqual(referenceCacheKey(...args), referenceCacheKey('c', 'v', 1, 'p'));
  const key = referenceCacheKey('course', digest(b), 1, 'physics');
  await writeFile(new URL(`runs/${key}.json`, root), JSON.stringify({ key, sha256: 'corrupt', value: {} }));
  assert.equal((await compute(b)).hit, false);
  assert.equal(calls, 4);
});
