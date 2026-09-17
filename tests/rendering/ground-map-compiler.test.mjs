import { createGroundMapCompileSource } from '../../dist/groundmap/ground-map-compile-source.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { compileGroundMapFiles } from '../../tools/build/ground-map-files.mjs';
import { compileBakedGroundMapAsset } from '../../dist/groundmap/ground-map-asset-compiler.js';
import { GroundMapLogicalProfile } from '../../dist/groundmap/logical-profile.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { sampleGroundMap } from '../../dist/groundmap/ground-map.js';

// Exact outputs captured from the pre-streaming compiler at 71c6dbb, not a second implementation.
const fixtures = JSON.parse(await readFile(new URL('../fixtures/ground-map-compiler.json', import.meta.url), 'utf8'));
const profileFor = (fixture) => ({
  ...fixture.profile,
  logical: new GroundMapLogicalProfile(fixture.length, [{ sStart: 0, name: 'fixture', left: 'GRASS', right: 'ROCK' }]),
});
const hash = (x) => createHash('sha256').update(x).digest('hex');

for (const fixture of fixtures) {
  test(`streamed ${fixture.name} retains exact metadata and bytes across batch sizes`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'ground-compiler-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const profile = profileFor(fixture);
    for (const rowsPerBatch of [4, 12, 256]) {
      const path = join(dir, 'asset.bin');
      const metadata = await compileGroundMapFiles(
        path,
        createGroundMapCompileSource(fixture.length, profile),
        fixture.density,
        fixture.kMax,
        fixture.chunk,
        { rowsPerBatch },
      );
      const bytes = await readFile(path);
      assert.deepEqual(metadata, fixture.metadata);
      assert.deepEqual(bytes, Buffer.from(fixture.binaryBase64, 'base64'));
      const reader = new BakedGroundMapAsset(metadata, bytes);
      const l0 = metadata.levels[0];
      // Every L0 texel independently matches authored color, not only the golden bytes.
      for (let row = 0; row < l0.chainageTexels; row++)
        for (let col = 0; col < l0.lateralTexels; col++) {
          const { s, l } = reader.texelCenter(0, row, col);
          assert.equal(reader.sampleAtLevel(s, l, 0), sampleGroundMap(s, l, profile));
        }
      assert.deepEqual(await readdir(dir), ['asset.bin'], 'scratch levels and payload spool are removed');
      if (fixture.name === 'repeated-chunks')
        assert.ok(metadata.payloads.length < metadata.levels.reduce((n, level) => n + level.chunks.length, 0));
    }
  });
}

test('stadium full asset keeps the pre-streaming binary and complete metadata', async () => {
  const meta = JSON.parse(
    await readFile(new URL('../../.test-assets/stadium-ground-map.json', import.meta.url), 'utf8'),
  );
  const bytes = await readFile(new URL('../../.test-assets/stadium-ground-map.bin', import.meta.url));
  assert.equal(hash(bytes), '9099d498b00071406f049e51a2f68fd51470104a058bbc461799e0bf80a91622');
  assert.equal(hash(JSON.stringify(meta)), 'e64fb3e46f63835a48627f45d0a689515f4dbdf7900eead00a573fc1e7c1686e');
});

test('workspace I/O stays bounded as course length grows; only the final payload file survives', async () => {
  const measurements = [];
  for (const length of [256, 2048]) {
    // Test-only storage double retains bytes to inspect I/O; production uses temporary files.
    const files = new Map();
    let largestRead = 0,
      largestWrite = 0;
    const storage = {
      async append(key, bytes) {
        largestWrite = Math.max(largestWrite, bytes.byteLength);
        files.set(key, Buffer.concat([files.get(key) ?? Buffer.alloc(0), bytes]));
      },
      async read(key, offset, target) {
        largestRead = Math.max(largestRead, target.byteLength);
        const bytes = files.get(key).subarray(offset, offset + target.byteLength);
        assert.equal(bytes.byteLength, target.byteLength);
        target.set(bytes);
      },
      async remove(key) {
        files.delete(key);
      },
    };
    const fixture = { ...fixtures[1], length };
    await compileBakedGroundMapAsset(
      createGroundMapCompileSource(length, profileFor(fixture)),
      { qL: 1, qS: 1 },
      2,
      storage,
      4,
      {
        rowsPerBatch: 8,
        maxWorkingBytes: 4096,
      },
    );
    assert.deepEqual([...files.keys()], ['asset']);
    measurements.push([largestRead, largestWrite]);
  }
  assert.deepEqual(measurements[0], measurements[1]);
  assert.ok(measurements[0].every((bytes) => bytes <= 256));
});

test('capacity and invalid-batch failures clean scratch data without replacing existing output', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ground-failure-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'asset.bin');
  await writeFile(path, 'unchanged');
  const fixture = fixtures[0];
  for (const options of [{ maxWorkingBytes: 1 }, { rowsPerBatch: 3 }, { rowsPerBatch: 4, maxWorkingBytes: 800 }]) {
    await assert.rejects(
      compileGroundMapFiles(
        path,
        createGroundMapCompileSource(fixture.length, profileFor(fixture)),
        fixture.density,
        fixture.kMax,
        fixture.chunk,
        options,
      ),
      RangeError,
    );
    assert.equal(await readFile(path, 'utf8'), 'unchanged');
    assert.deepEqual(await readdir(dir), ['asset.bin']);
  }
});

test('compiler propagates a failed spool read rather than publishing fabricated bytes', async () => {
  const fixture = fixtures[0];
  const failure = new Error('injected I/O failure');
  const storage = {
    async append() {},
    async read() {
      throw failure;
    },
    async remove() {},
  };
  await assert.rejects(
    compileBakedGroundMapAsset(
      createGroundMapCompileSource(fixture.length, profileFor(fixture)),
      fixture.density,
      fixture.kMax,
      storage,
      fixture.chunk,
    ),
    (e) => e === failure,
  );
});
