import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GroundMapPayloadStore } from '../../dist/groundmap/ground-map-payload-store.js';
import { contentDigest } from '../../dist/core/content-digest.js';
import {
  createGroundMapPageManifest,
  decodeGroundMapPageManifest,
  GroundMapPageAsset,
} from '../../dist/groundmap/ground-map-pages.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { publishGroundMapPages } from '../../tools/build/ground-map-pages.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
async function payload(values) {
  const bytes = Uint8Array.from(values);
  return { bytes, identity: { sha256: await contentDigest(bytes), byteLength: bytes.length } };
}
const limits = { maxResidentBytes: 8, maxLoadingBytes: 8 };

test('concurrent demand shares a single load, detaches transport aliases and pins bytes until both leases release', async () => {
  const item = await payload([1, 2, 3, 4]);
  const gate = deferred();
  let loads = 0;
  const incoming = item.bytes.slice().buffer;
  const alias = new Uint8Array(incoming);
  const store = new GroundMapPayloadStore(async () => {
    loads++;
    await gate.promise;
    return incoming;
  }, limits);
  const first = store.acquire([item.identity, item.identity]);
  const second = store.acquire([item.identity]);
  assert.equal(loads, 1);
  assert.deepEqual(store.accounting, { residentBytes: 0, pinnedBytes: 4, reservedBytes: 4, loadingBytes: 8 });
  gate.resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(alias.byteLength, 0, 'ownership transfer prevents transport mutation after validation');
  assert.equal(a.readByte(item.identity.sha256, 2), 3);
  a.release();
  a.release();
  assert.equal(store.accounting.pinnedBytes, 4);
  assert.throws(() => a.readByte(item.identity.sha256, 0), /not pinned/);
  assert.equal(b.readByte(item.identity.sha256, 0), 1);
  b.release();
  assert.equal(store.accounting.pinnedBytes, 0);
  assert.equal(store.accounting.residentBytes, 4);
});

test('pending consumer cancellation never publishes a stale lease or interrupts another consumer', async () => {
  const item = await payload([5, 6, 7, 8]);
  const gate = deferred();
  let loads = 0;
  const store = new GroundMapPayloadStore(async () => {
    loads++;
    await gate.promise;
    return item.bytes.slice().buffer;
  }, limits);
  const controller = new AbortController();
  const reason = new Error('old course selection');
  const obsolete = store.acquire([item.identity], controller.signal);
  const current = store.acquire([item.identity]);
  const rejected = assert.rejects(obsolete, (error) => error === reason);
  controller.abort(reason);
  await rejected;
  assert.equal(store.accounting.pinnedBytes, 4);
  gate.resolve();
  const lease = await current;
  assert.equal(loads, 1);
  assert.equal(lease.readByte(item.identity.sha256, 3), 8);
  lease.release();
  await assert.rejects(store.acquire([item.identity], controller.signal), (error) => error === reason);
  assert.equal(store.accounting.pinnedBytes, 0);
});

test('all cancelled demand keeps admitted in-flight bytes budgeted until shared loading settles', async () => {
  const a = await payload([1, 1, 1, 1]);
  const b = await payload([2, 2, 2, 2]);
  const gate = deferred();
  const store = new GroundMapPayloadStore(
    async (id) => {
      await gate.promise;
      return (id.sha256 === a.identity.sha256 ? a : b).bytes.slice().buffer;
    },
    { maxResidentBytes: 4, maxLoadingBytes: 8 },
  );
  const controller = new AbortController();
  const request = store.acquire([a.identity], controller.signal);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(store.accounting.reservedBytes, 4);
  assert.equal(store.accounting.pinnedBytes, 0);
  await assert.rejects(store.acquire([b.identity]), /resident capacity/);
  gate.resolve();
  const settled = await store.acquire([a.identity]);
  settled.release();
  const next = await store.acquire([b.identity]);
  next.release();
  assert.equal(store.accounting.residentBytes, 4);
});

test('complete working-set admission preserves old pins and evicts only released payloads', async () => {
  const a = await payload([10, 11, 12, 13]);
  const b = await payload([20, 21, 22, 23]);
  let loads = 0;
  const store = new GroundMapPayloadStore(
    async (id) => {
      loads++;
      return (id.sha256 === a.identity.sha256 ? a : b).bytes.slice().buffer;
    },
    { maxResidentBytes: 4, maxLoadingBytes: 8 },
  );
  await assert.rejects(store.acquire([a.identity, b.identity]), /resident capacity/);
  assert.equal(loads, 0, 'oversized sets fail before any I/O');
  const old = await store.acquire([a.identity]);
  await assert.rejects(store.acquire([b.identity]), /resident capacity/);
  assert.equal(old.readByte(a.identity.sha256, 0), 10);
  old.release();
  const next = await store.acquire([b.identity]);
  assert.equal(store.accounting.residentBytes, 4);
  assert.throws(() => old.readByte(a.identity.sha256, 0), /not pinned/);
  assert.equal(next.readByte(b.identity.sha256, 0), 20);
  next.release();
  const reload = await store.acquire([a.identity]);
  reload.release();
  assert.equal(loads, 3);
});

test(
  'loading budget serializes validation buffers without changing the admitted row set',
  { timeout: 10000 },
  async () => {
    const a = await payload([1, 2, 1, 2]);
    const b = await payload([3, 4, 3, 4]);
    const gates = [deferred(), deferred()];
    const secondStarted = deferred();
    let started = 0;
    const store = new GroundMapPayloadStore(async (id) => {
      const gate = gates[started++];
      if (started === 2) secondStarted.resolve();
      await gate.promise;
      return (id.sha256 === a.identity.sha256 ? a : b).bytes.slice().buffer;
    }, limits);
    const request = store.acquire([a.identity, b.identity]);
    assert.equal(started, 1);
    assert.equal(store.accounting.reservedBytes, 8);
    assert.equal(store.accounting.loadingBytes, 8);
    gates[0].resolve();
    await secondStarted.promise;
    assert.equal(started, 2);
    assert.equal(store.accounting.loadingBytes, 8);
    gates[1].resolve();
    const lease = await request;
    assert.equal(lease.readByte(a.identity.sha256, 0), 1);
    assert.equal(lease.readByte(b.identity.sha256, 0), 3);
    lease.release();
  },
);

for (const failure of ['digest', 'length', 'transport']) {
  test(`${failure} failure publishes no bytes, releases admission and allows retry`, async () => {
    const item = await payload([8, 7, 6, 5]);
    let fail = true;
    const store = new GroundMapPayloadStore(async () => {
      if (!fail) return item.bytes.slice().buffer;
      if (failure === 'transport') throw new Error('transport failure');
      return Uint8Array.from(failure === 'length' ? [1] : [1, 2, 3, 4]).buffer;
    }, limits);
    await assert.rejects(store.acquire([item.identity]), /mismatch|transport failure/);
    await turn();
    assert.deepEqual(store.accounting, { residentBytes: 0, reservedBytes: 0, pinnedBytes: 0, loadingBytes: 0 });
    fail = false;
    const lease = await store.acquire([item.identity]);
    assert.equal(lease.readByte(item.identity.sha256, 0), 8);
    lease.release();
  });
}

test('invalid identities and conflicting lengths cannot alter cache admission', async () => {
  const item = await payload([1, 2, 3, 4]);
  const store = new GroundMapPayloadStore(async () => item.bytes.slice().buffer, limits);
  for (const identity of [
    { ...item.identity, sha256: '../bad' },
    { ...item.identity, byteLength: -1 },
    { ...item.identity, byteLength: 9 },
  ])
    await assert.rejects(store.acquire([identity]), RangeError);
  const lease = await store.acquire([item.identity]);
  await assert.rejects(store.acquire([{ ...item.identity, byteLength: 3 }]), /conflicting/);
  assert.throws(() => lease.readByte(item.identity.sha256, 4), RangeError);
  assert.throws(() => lease.readByte('0'.repeat(64), 0), /not pinned/);
  lease.release();
});

const pageDirectory = new URL('../../.test-assets/ground-pages/', import.meta.url);
const bindings = JSON.parse(await readFile(new URL('bindings.json', pageDirectory), 'utf8'));
async function loadManifest(id) {
  const sha = bindings[id];
  return decodeGroundMapPageManifest(Uint8Array.from(await readFile(new URL(`${sha}.json`, pageDirectory))), sha);
}
function fileStore(maxResidentBytes, maxLoadingBytes) {
  return new GroundMapPayloadStore(
    async (id) => Uint8Array.from(await readFile(new URL(`${id.sha256}.bin`, pageDirectory))).buffer,
    { maxResidentBytes, maxLoadingBytes },
  );
}

for (const id of ['STAGE_4_L_FORK', 'STAGE_4_R_FORK']) {
  test(`${id}: separately loaded payloads preserve every texel, level, endpoint and page boundary`, async () => {
    const manifest = await loadManifest(id);
    const asset = new GroundMapPageAsset(manifest);
    const reference = new BakedGroundMapAsset(
      manifest.layout,
      await readFile(new URL(`../../.test-assets/${id}-ground-map.bin`, import.meta.url)),
    );
    const maxPayload = Math.max(...manifest.layout.payloads.map((item) => item.byteLength));
    const store = fileStore(maxPayload * 2, maxPayload * 2);
    let sharedMetadata;
    for (const level of manifest.layout.levels) {
      for (const chunk of level.chunks) {
        const frame = await asset.acquire(store, [
          { level: level.level, rowStart: chunk.rowStart, rowCount: chunk.rowCount },
        ]);
        if (sharedMetadata) assert.equal(frame.reader.metadata, sharedMetadata, 'frame readers share one directory');
        sharedMetadata = frame.reader.metadata;
        try {
          for (let row = chunk.rowStart; row < chunk.rowStart + chunk.rowCount; row++)
            for (let col = 0; col < level.lateralTexels; col++) {
              const { s, l } = reference.texelCenter(level.level, row, col);
              assert.equal(frame.reader.sampleAtLevel(s, l, level.level), reference.sampleAtLevel(s, l, level.level));
            }
          const endS = ((chunk.rowStart + chunk.rowCount) * manifest.layout.courseLength) / level.chainageTexels;
          if (endS === manifest.layout.courseLength)
            assert.equal(
              frame.reader.sampleAtLevel(endS, manifest.layout.groundRight, level.level),
              reference.sampleAtLevel(endS, manifest.layout.groundRight, level.level),
            );
          assert.ok(store.accounting.residentBytes <= maxPayload * 2);
        } finally {
          frame.release();
        }
      }
    }
  });
}

test('manifests bind source/target/input identity, reject corruption and retain per-asset palettes over shared bytes', async () => {
  const manifest = await loadManifest('STAGE_2_L');
  const changed = structuredClone(manifest);
  changed.identity.sourceId = 'alternate-palette';
  changed.layout.paletteRgba = changed.layout.paletteRgba.map((color) => (color ^ 0x00ffffff) >>> 0);
  const a = new GroundMapPageAsset(manifest);
  const b = new GroundMapPageAsset(changed);
  const payload = manifest.layout.payloads[manifest.layout.levels[0].chunks[0].payloadId];
  let loads = 0;
  const store = new GroundMapPayloadStore(
    async (id) => {
      loads++;
      return Uint8Array.from(await readFile(new URL(`${id.sha256}.bin`, pageDirectory))).buffer;
    },
    { maxResidentBytes: payload.byteLength, maxLoadingBytes: payload.byteLength * 2 },
  );
  const demand = [{ level: 0, rowStart: 0, rowCount: 1 }];
  const [left, right] = await Promise.all([a.acquire(store, demand), b.acquire(store, demand)]);
  const { s, l } = left.reader.texelCenter(0, 0, 0);
  assert.equal(loads, 1);
  assert.equal(right.reader.sampleAtLevel(s, l, 0), (left.reader.sampleAtLevel(s, l, 0) ^ 0x00ffffff) >>> 0);
  left.release();
  right.release();
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const sha = await contentDigest(bytes);
  assert.deepEqual(await decodeGroundMapPageManifest(bytes, sha), manifest);
  await assert.rejects(decodeGroundMapPageManifest(bytes, '0'.repeat(64)), /digest mismatch/);
  for (const mutate of [
    (m) => {
      m.version = 2;
    },
    (m) => {
      m.layout.levels[0].qSActual *= 2;
    },
    (m) => {
      m.layout.levels[0].chunks[0].rowStart = 1;
    },
    (m) => {
      m.layout.payloads[0].sha256 = 'bad';
    },
    (m) => {
      m.identity.inputSha256 = 'bad';
    },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    const data = new TextEncoder().encode(JSON.stringify(invalid));
    await assert.rejects(decodeGroundMapPageManifest(data, await contentDigest(data)));
  }
});

test('missing row demand never loads inside sampling, and released readers cannot use cached bytes', async () => {
  const asset = new GroundMapPageAsset(await loadManifest('STAGE_4_L_FORK'));
  const store = fileStore(1000000, 1000000);
  const empty = await asset.acquire(store, []);
  assert.throws(() => empty.reader.sampleAtLevel(0, 0, 0), /not pinned/);
  assert.equal(store.accounting.reservedBytes, 0);
  empty.release();
  for (const demand of [
    { level: 99, rowStart: 0, rowCount: 1 },
    { level: 0, rowStart: -1, rowCount: 1 },
    { level: 0, rowStart: 0, rowCount: 0 },
  ])
    await assert.rejects(asset.acquire(store, [demand]), RangeError);
  const ready = await asset.acquire(store, [{ level: 0, rowStart: 0, rowCount: 1 }]);
  ready.release();
  assert.throws(() => ready.reader.sampleAtLevel(0, 0, 0), /not pinned/);
});

test('publisher is deterministic and does not publish a manifest for truncated or corrupt compiler output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ground-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await loadManifest('STAGE_2_L');
  const binaryPath = new URL('../../.test-assets/STAGE_2_L-ground-map.bin', import.meta.url);
  const sha = await publishGroundMapPages(directory, binaryPath, manifest.layout, manifest.identity);
  assert.equal(sha, bindings.STAGE_2_L);
  assert.equal(await publishGroundMapPages(directory, binaryPath, manifest.layout, manifest.identity), sha);
  const badDirectory = join(directory, 'bad');
  const badBinary = join(directory, 'bad.bin');
  await writeFile(badBinary, new Uint8Array(1));
  await assert.rejects(
    publishGroundMapPages(badDirectory, badBinary, manifest.layout, manifest.identity),
    /ended inside/,
  );
  assert.deepEqual(await readdir(badDirectory), []);
  const damaged = await readFile(binaryPath);
  damaged[0] ^= 1;
  await writeFile(badBinary, damaged);
  await assert.rejects(
    publishGroundMapPages(badDirectory, badBinary, manifest.layout, manifest.identity),
    /digest mismatch/,
  );
  assert.deepEqual(await readdir(badDirectory), []);
  assert.equal(Object.keys(bindings).length, 11);
  assert.deepEqual(createGroundMapPageManifest(manifest.identity, manifest.layout), manifest);
});

test('a valid digest with invalid palette indices is rejected before a frame reader is published', async () => {
  const manifest = structuredClone(await loadManifest('STAGE_2_L'));
  manifest.layout.paletteRgba = manifest.layout.paletteRgba.slice(0, 1);
  const asset = new GroundMapPageAsset(manifest);
  const store = fileStore(1000000, 1000000);
  await assert.rejects(asset.acquire(store, [{ level: 0, rowStart: 0, rowCount: 1 }]), /outside manifest palette/);
  assert.equal(store.accounting.pinnedBytes, 0);
});
