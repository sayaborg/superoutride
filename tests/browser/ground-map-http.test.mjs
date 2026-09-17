import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GroundMapHttpSession } from '../../dist/browser/ground-map-http.js';
import { GroundMapPageAsset } from '../../dist/groundmap/ground-map-pages.js';

const directory = new URL('../../.test-assets/ground-pages/', import.meta.url);
const bindings = JSON.parse(await readFile(new URL('bindings.json', directory), 'utf8'));
const hash = bindings.STAGE_4_L_FORK;
const manifestBytes = await readFile(new URL(`${hash}.json`, directory));
const manifest = JSON.parse(manifestBytes);
const sha = 'a'.repeat(40);
const root = `https://game.example/game/build/${sha}/`;
const options = {
  buildRoot: root,
  buildSha: sha,
  maxManifestBytes: 1024 * 1024,
  requestTimeoutMs: 1000,
  maxResidentBytes: 1024 * 1024,
  maxLoadingBytes: 1024 * 1024,
};
const demand = [{ level: 0, rowStart: 0, rowCount: 1 }];
function response(url, body, init) {
  const result = new Response(body, init);
  Object.defineProperty(result, 'url', { value: url });
  return result;
}
async function fileFetch(url, init) {
  assert.equal(init.redirect, 'error');
  assert.ok(url.startsWith(`${root}ground-pages/`));
  return response(url, await readFile(new URL(url.split('/').at(-1), directory)), {
    headers: { 'Content-Encoding': 'gzip', 'Content-Length': '1' },
  });
}

test('HTTP session binds manifests and all payloads to one immutable build, independent of compressed Content-Length', async () => {
  const calls = [];
  const session = new GroundMapHttpSession(options, async (url, init) => {
    calls.push(url);
    return fileFetch(url, init);
  });
  const asset = await session.open(hash);
  const samples = [
    { s: 0, deltaSEffective: 1 },
    { s: asset.manifest.layout.courseLength, deltaSEffective: 100 },
  ];
  const ranges = asset.rowDemand(samples);
  const [a, b] = await Promise.all([session.acquire(asset, ranges), session.acquire(asset, ranges)]);
  for (const sample of samples)
    assert.equal(
      a.reader.sample(sample.s, 0, sample.deltaSEffective).color,
      b.reader.sample(sample.s, 0, sample.deltaSEffective).color,
    );
  assert.equal(calls.length, new Set(calls).size, 'concurrent payload requests coalesce');
  assert.ok(session.accounting.pinnedBytes > 0);
  a.release();
  b.release();
  const other = new GroundMapHttpSession(options, fileFetch);
  await assert.rejects(other.acquire(asset, ranges), /not bound/);
  await assert.rejects(session.acquire(new GroundMapPageAsset(manifest), ranges), /not bound/);
  other.dispose();
  session.dispose();
  assert.equal(session.accounting.residentBytes, 0);
  await assert.rejects(session.acquire(asset, ranges), { name: 'AbortError' });
});

test('mutable roots, mismatched commits and invalid resource digests cannot issue HTTP requests', async () => {
  for (const buildRoot of [
    'https://game.example/dist/',
    root.replace(sha, 'b'.repeat(40)),
    `${root}?v=1`,
    `${root}#x`,
    root.replace('https://', 'https://user:pass@'),
  ])
    assert.throws(() => new GroundMapHttpSession({ ...options, buildRoot }), /immutable build/);
  for (const field of ['requestTimeoutMs', 'maxManifestBytes', 'maxLoadingBytes', 'maxResidentBytes'])
    assert.throws(() => new GroundMapHttpSession({ ...options, [field]: 0 }), RangeError);
  let calls = 0;
  const session = new GroundMapHttpSession(options, async () => {
    calls++;
    throw new Error('unexpected');
  });
  await assert.rejects(session.open('../escape'), /digest invalid/);
  assert.equal(calls, 0);
  session.dispose();
});

for (const kind of ['redirect', 'partial', 'missing', 'wrong-url', 'empty']) {
  test(`HTTP ${kind} responses are rejected before manifest parsing`, async () => {
    const session = new GroundMapHttpSession(options, async (url) => {
      const result = response(
        kind === 'wrong-url' ? `${root}other.json` : url,
        kind === 'empty' ? null : manifestBytes,
        { status: kind === 'partial' ? 206 : kind === 'missing' ? 404 : 200 },
      );
      if (kind === 'redirect') Object.defineProperty(result, 'redirected', { value: true });
      return result;
    });
    await assert.rejects(session.open(hash), /complete asset/);
    session.dispose();
  });
}

test('oversized manifests cancel their decoded body before parsing; wrong digests fail explicitly', async () => {
  let cancelled = 0;
  const session = new GroundMapHttpSession({ ...options, maxManifestBytes: 16 }, async (url) =>
    response(
      url,
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(17));
        },
        cancel() {
          cancelled++;
        },
      }),
    ),
  );
  await assert.rejects(session.open(hash), /exceeds byte limit/);
  assert.equal(cancelled, 1);
  session.dispose();
  const corrupted = new GroundMapHttpSession(options, async (url) => response(url, '{}'));
  await assert.rejects(corrupted.open(hash), /manifest digest mismatch/);
  corrupted.dispose();
});

for (const kind of ['short', 'long', 'corrupt', 'stream-error']) {
  test(`payload ${kind} response cannot publish a ready reader and a subsequent request can retry`, async () => {
    let fail = true;
    const session = new GroundMapHttpSession(options, async (url, init) => {
      if (!fail || url.endsWith('.json')) return fileFetch(url, init);
      const good = await readFile(new URL(url.split('/').at(-1), directory));
      if (kind === 'stream-error')
        return response(
          url,
          new ReadableStream({
            start(c) {
              c.error(new Error('broken stream'));
            },
          }),
        );
      const bytes =
        kind === 'short'
          ? good.subarray(0, good.length - 1)
          : kind === 'long'
            ? Buffer.concat([good, Buffer.from([1])])
            : Buffer.from(good);
      if (kind === 'corrupt') bytes[0] ^= 1;
      return response(url, bytes);
    });
    const asset = await session.open(hash);
    await assert.rejects(session.acquire(asset, demand), /mismatch|exceeds byte limit|broken stream/);
    assert.equal(session.accounting.pinnedBytes, 0);
    fail = false;
    const ready = await session.acquire(asset, demand);
    ready.reader.sampleAtLevel(0, 0, 0);
    ready.release();
    session.dispose();
  });
}

test('timeout cancels a stalled response body; session disposal cancels queued manifests without issuing new fetches', async () => {
  let cancelled = 0;
  const timeout = new GroundMapHttpSession({ ...options, requestTimeoutMs: 20 }, async (url) =>
    response(
      url,
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
    ),
  );
  await assert.rejects(timeout.open(hash), { name: 'TimeoutError' });
  assert.equal(cancelled, 1);
  timeout.dispose();
  let calls = 0;
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  const session = new GroundMapHttpSession(options, async (url) => {
    calls++;
    started();
    return response(
      url,
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
    );
  });
  const first = session.open(hash);
  await start;
  const abort = new AbortController();
  const queued = session.open(hash, abort.signal);
  const rejected = assert.rejects(queued, { name: 'AbortError' });
  abort.abort();
  await rejected;
  assert.equal(calls, 1);
  const closed = assert.rejects(first, { name: 'AbortError' });
  session.dispose();
  await closed;
  assert.equal(calls, 1);
});

test('disposing a session invalidates pinned readers and rejects pending payload loads', async () => {
  const session = new GroundMapHttpSession(options, fileFetch);
  const asset = await session.open(hash);
  const frame = await session.acquire(asset, demand);
  session.dispose();
  assert.throws(() => frame.reader.sampleAtLevel(0, 0, 0), /not pinned/);
  frame.release();
  assert.equal(session.accounting.residentBytes, 0);
  let started;
  const start = new Promise((resolve) => {
    started = resolve;
  });
  const delayed = new GroundMapHttpSession(options, async (url, init) => {
    if (url.endsWith('.json')) return fileFetch(url, init);
    started();
    return response(url, new ReadableStream());
  });
  const other = await delayed.open(hash);
  const load = delayed.acquire(other, demand);
  await start;
  const rejected = assert.rejects(load, { name: 'AbortError' });
  delayed.dispose();
  await rejected;
});

test('product gzip transport is decoded once, bounded and hash-checked; catalog binds its manifest', async () => {
  const { gzipSync } = await import('node:zlib');
  const calls = [];
  let corrupt = false;
  const session = new GroundMapHttpSession({ ...options, payloadEncoding: 'gzip' }, async (url) => {
    calls.push(url);
    const file = url.split('/').at(-1);
    if (file === 'catalog.json')
      return response(
        url,
        JSON.stringify({ kind: 'ground-map-catalog', version: 1, encoding: 'gzip', bindings: { stage: hash } }),
      );
    const body = await readFile(new URL(file.replace(/\.gz$/, ''), directory));
    return response(url, file.endsWith('.gz') ? gzipSync(corrupt ? new Uint8Array(body.length + 1) : body) : body);
  });
  assert.equal((await session.catalog()).stage, hash);
  const asset = await session.open(hash);
  const before = calls.length;
  assert.equal(session.tryAcquire(asset, demand), null);
  assert.equal(calls.length, before, 'a synchronous miss performs no I/O');
  corrupt = true;
  await assert.rejects(session.acquire(asset, demand), /exceeds byte limit/);
  corrupt = false;
  const a = await session.acquire(asset, demand);
  const loaded = calls.length;
  const b = session.tryAcquire(asset, demand);
  assert.ok(b);
  assert.equal(calls.length, loaded, 'a resident frame needs no network or microtask');
  a.release();
  b.reader.sampleAtLevel(0, 0, 0);
  b.release();
  session.dispose();
});
