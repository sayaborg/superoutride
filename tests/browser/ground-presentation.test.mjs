import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { GroundPresentation } from '../../dist/browser/ground-presentation.js';
import { GroundMapHttpSession } from '../../dist/browser/ground-map-http.js';
import { createFrameLoop } from '../../dist/browser/frame-loop.js';
import { InputManager } from '../../dist/input/input-manager.js';
import { installBrowserDom } from '../helpers/browser-dom.mjs';

const directory = new URL('../../.test-assets/ground-pages/', import.meta.url);
const hash = JSON.parse(await readFile(new URL('bindings.json', directory))).STAGE_4_L_FORK;
const root = `https://example.test/build/${'b'.repeat(40)}/`;
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate());
}

test('product presentation loads gzip pages, keeps a running clock on resident frames and resumes a retry without catch-up', async () => {
  let fail = true,
    now = 0,
    sequence = 0,
    ticks = 0,
    draws = 0;
  const callbacks = new Map();
  const events = [];
  const session = new GroundMapHttpSession(
    {
      buildRoot: root,
      buildSha: 'b'.repeat(40),
      payloadEncoding: 'gzip',
      maxManifestBytes: 1024 * 1024,
      maxResidentBytes: 1024 * 1024,
      maxLoadingBytes: 1024 * 1024,
      requestTimeoutMs: 1000,
    },
    async (url) => {
      const file = url.split('/').at(-1);
      if (file.endsWith('.gz') && fail) throw new Error('offline');
      const body =
        file === 'catalog.json'
          ? JSON.stringify({ kind: 'ground-map-catalog', version: 1, encoding: 'gzip', bindings: { stage: hash } })
          : await readFile(new URL(file.replace(/\.gz$/, ''), directory));
      const result = new Response(file.endsWith('.gz') ? gzipSync(body) : body);
      Object.defineProperty(result, 'url', { value: url });
      return result;
    },
  );
  const loop = createFrameLoop(
    () => ticks++,
    () => {},
    {
      now: () => now,
      request: (cb) => {
        callbacks.set(++sequence, cb);
        return sequence;
      },
      cancel: (id) => callbacks.delete(id),
    },
  );
  const presentation = new GroundPresentation(
    loop,
    (suspend) => events.push(['suspend', suspend]),
    (state) => events.push(['state', state]),
    session,
  );
  const request = { sourceId: 'stage', samples: [{ s: 5, deltaSEffective: 1 }] };
  const draw = (reader) => {
    assert.equal(reader.kind, 'baked');
    reader.sampleAtLevel(5, 0, 0);
    draws++;
  };
  try {
    presentation.draw(request, draw);
    await until(() => events.some((e) => e[1] === 'failed'));
    assert.equal(draws, 0);
    assert.equal(callbacks.size, 0);
    fail = false;
    now = 100000;
    presentation.retry();
    await until(() => draws === 1);
    const suspended = events.filter((e) => e[0] === 'suspend').length;
    const scheduled = sequence;
    presentation.draw(request, draw);
    assert.equal(draws, 2, 'cached data draws synchronously');
    assert.equal(sequence, scheduled, 'cached frames never restart the scheduler');
    assert.equal(events.filter((e) => e[0] === 'suspend').length, suspended);
    const [id, callback] = callbacks.entries().next().value;
    callbacks.delete(id);
    callback(now);
    assert.equal(ticks, 0);
    // Window mapping applies to both demand and reads without copying a lap directory.
    presentation.draw({ ...request, samples: [{ s: 105, deltaSEffective: 1 }], sourceS: (s) => s - 100 }, (reader) => {
      reader.sampleAtLevel(105, 0, 0);
      draws++;
    });
    assert.equal(draws, 3);
  } finally {
    presentation.dispose();
  }
  assert.equal(session.accounting.residentBytes, 0);
});

test('loading clears keyboard and touch ownership and does not revive a held or repeated key', (t) => {
  const { win } = installBrowserDom(t);
  const input = new InputManager();
  const key = (type, code, repeat = false) => win.emit(type, { code, repeat, preventDefault() {} });
  key('keydown', 'ArrowUp');
  key('keydown', 'ArrowRight');
  assert.equal(input.sample().throttle, true);
  input.setSuspended(true);
  key('keydown', 'ArrowUp');
  assert.deepEqual(input.sample(), { steering: 0, throttle: false, brake: false });
  input.setSuspended(false);
  key('keydown', 'ArrowUp', true);
  assert.equal(input.sample().throttle, false);
  key('keyup', 'ArrowUp');
  key('keydown', 'ArrowUp');
  assert.equal(input.sample().throttle, true);
  key('keyup', 'ArrowUp');
  const pointer = (type, y) => win.emit(type, { pointerType: 'touch', pointerId: 1, clientX: 900, clientY: y });
  pointer('pointerdown', 400);
  pointer('pointermove', 336);
  assert.equal(input.sample().throttle, 1);
  input.setSuspended(true);
  input.setSuspended(false);
  pointer('pointermove', 320);
  assert.equal(input.sample().throttle, false, 'old touch ownership cannot resume after loading');
  pointer('pointerup', 320);
  pointer('pointerdown', 400);
  pointer('pointermove', 368);
  assert.equal(input.sample().throttle, 0.5);
});
