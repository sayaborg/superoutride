import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadyFrameController } from '../../dist/browser/ready-frame.js';
import { createFrameLoop } from '../../dist/browser/frame-loop.js';

function fixture() {
  let time = 0,
    sequence = 0,
    ticks = 0,
    renders = 0;
  const callbacks = new Map();
  const clock = {
    now: () => time,
    request: (cb) => {
      callbacks.set(++sequence, cb);
      return sequence;
    },
    cancel: (id) => callbacks.delete(id),
  };
  const loop = createFrameLoop(
    () => ticks++,
    () => renders++,
    clock,
  );
  let visible = null;
  const suspended = [];
  const controller = new ReadyFrameController(
    loop,
    (frame) => {
      visible = frame.id;
    },
    (value) => suspended.push(value),
  );
  return {
    loop,
    controller,
    callbacks,
    suspended,
    get visible() {
      return visible;
    },
    get ticks() {
      return ticks;
    },
    get renders() {
      return renders;
    },
    advance(ms) {
      time = ms;
      const entry = callbacks.entries().next().value;
      if (entry) {
        callbacks.delete(entry[0]);
        entry[1](time);
      }
    },
  };
}
function frame(id) {
  return {
    id,
    releases: 0,
    release() {
      this.releases++;
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test('loading preserves the completed frame and suspends ticks, then resumes without wall-clock catch-up', async () => {
  const f = fixture();
  const old = frame('old');
  await f.controller.replace(async () => old);
  f.advance(20);
  assert.equal(f.ticks, 1);
  const late = deferred();
  const pending = f.controller.replace(() => late.promise);
  assert.equal(f.controller.state, 'loading');
  assert.equal(f.callbacks.size, 0);
  f.advance(100000);
  assert.equal(f.ticks, 1);
  assert.equal(f.visible, 'old');
  assert.equal(old.releases, 0);
  late.resolve(frame('new'));
  assert.equal(await pending, true);
  assert.equal(old.releases, 1);
  assert.equal(f.visible, 'new');
  f.advance(100000);
  assert.equal(f.ticks, 1);
  f.advance(100020);
  assert.equal(f.ticks, 2);
  assert.deepEqual(f.suspended, [true, false, true, false]);
  f.controller.dispose();
});

test('failure keeps old pins and a stopped scheduler; retry uses the same request and disposal releases once', async () => {
  const f = fixture();
  const old = frame('old');
  const next = frame('next');
  await f.controller.replace(async () => old);
  let attempt = 0;
  const failure = new Error('offline');
  assert.equal(
    await f.controller.replace(async () => {
      if (attempt++ === 0) throw failure;
      return next;
    }),
    false,
  );
  assert.equal(f.controller.error, failure);
  assert.equal(f.controller.state, 'failed');
  assert.equal(old.releases, 0);
  assert.equal(f.visible, 'old');
  assert.equal(f.callbacks.size, 0);
  assert.equal(await f.controller.retry(), true);
  assert.equal(attempt, 2);
  assert.equal(old.releases, 1);
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(next.releases, 1);
  assert.throws(() => f.controller.retry(), /no failed/);
  await assert.rejects(
    f.controller.replace(async () => frame('bad')),
    /disposed/,
  );
});

test('course replacement and disposal discard late arrivals even when a transport ignores cancellation', async () => {
  const f = fixture();
  const a = deferred();
  const b = deferred();
  const stale = frame('stale');
  const current = frame('current');
  const first = f.controller.replace(() => a.promise);
  const second = f.controller.replace(() => b.promise);
  b.resolve(current);
  await second;
  a.resolve(stale);
  assert.equal(await first, false);
  assert.equal(stale.releases, 1);
  assert.equal(f.visible, 'current');
  const c = deferred();
  const last = frame('late-after-dispose');
  const pending = f.controller.replace(() => c.promise);
  f.controller.dispose();
  c.resolve(last);
  assert.equal(await pending, false);
  assert.equal(last.releases, 1);
  assert.equal(current.releases, 1);
  assert.equal(f.controller.state, 'disposed');
  assert.equal(f.callbacks.size, 0);
});

test('presentation failure releases incoming pages while retaining the previous completed frame', async () => {
  const f = fixture();
  const old = frame('old');
  const bad = frame('bad');
  const controller = new ReadyFrameController(
    f.loop,
    (value) => {
      if (value === bad) throw new Error('present failed');
    },
    () => {},
  );
  await controller.replace(async () => old);
  assert.equal(await controller.replace(async () => bad), false);
  assert.equal(bad.releases, 1);
  assert.equal(old.releases, 0);
  assert.equal(controller.state, 'failed');
  assert.equal(f.callbacks.size, 0);
  controller.dispose();
  assert.equal(old.releases, 1);
});
