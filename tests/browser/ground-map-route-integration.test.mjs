import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GroundMapPageAsset, decodeGroundMapPageManifest } from '../../dist/groundmap/ground-map-pages.js';
import { GroundMapPayloadStore } from '../../dist/groundmap/ground-map-payload-store.js';
import { BakedGroundMapAsset } from '../../dist/groundmap/baked-ground-map.js';
import { ReadyFrameController } from '../../dist/browser/ready-frame.js';
import { createFrameLoop } from '../../dist/browser/frame-loop.js';
import { createBranchingGroundMapFixture } from '../../dist/dev/fixtures/branching-ground-map.js';
import { compileDeclarativeLiveRoute } from '../../dist/runtime/declarative-live-route.js';
import { createLiveRouteTravelerState, resyncLiveRouteTraveler } from '../../dist/runtime/live-route-traveler.js';
import { advanceLiveRouteMultiActorTick } from '../../dist/runtime/live-route-multi-actor-tick.js';
import { createSharedRouteChoiceState } from '../../dist/gameplay/shared-route-choice-authority.js';
import { createTsukubaCourse2000Runtime } from '../../dist/dev/courses/tsukuba-circuit.js';
import { circuitWindowToLapSourceChainage } from '../../dist/runtime/circuit-runtime-window.js';

const directory = new URL('../../.test-assets/ground-pages/', import.meta.url);
async function open(digest) {
  return new GroundMapPageAsset(
    await decodeGroundMapPageManifest(await readFile(new URL(`${digest}.json`, directory)), digest),
  );
}
function delivery() {
  let pause = Promise.resolve();
  let loads = 0;
  const store = new GroundMapPayloadStore(
    async ({ sha256 }) => {
      loads++;
      await pause;
      return Uint8Array.from(await readFile(new URL(`${sha256}.bin`, directory))).buffer;
    },
    { maxResidentBytes: 1024 * 1024, maxLoadingBytes: 1024 * 1024 },
  );
  return {
    store,
    get loads() {
      return loads;
    },
    delay() {
      let resolve;
      pause = new Promise((r) => {
        resolve = r;
      });
      return resolve;
    },
  };
}
const along = (boundary, d) => ({
  x: boundary.center.x + boundary.tangent.x * d,
  z: boundary.center.z + boundary.tangent.z * d,
});

test('real branching gate and COMMIT survive delayed color delivery without rollback or catch-up for either actor', async () => {
  const live = compileDeclarativeLiveRoute(createBranchingGroundMapFixture());
  const gate = live.gates.gates.find((g) => g.kind === 'TRANSITION' && g.choiceId === 'S1_RIGHT');
  const seam = live.handoffs.seams.find((s) => s.choiceId === 'S1_RIGHT');
  const actors = ['PLAYER', 'RIVAL'].map((actorId) => ({
    actorId,
    state: createLiveRouteTravelerState(live, along(gate, -1)),
    currentWorldPoint: along(gate, 1),
  }));
  const shared = createSharedRouteChoiceState('INDEPENDENT');
  advanceLiveRouteMultiActorTick(live, shared, actors);
  for (const actor of actors) {
    assert.equal(actor.state.handoffState.pending.choiceId, 'S1_RIGHT');
    assert.equal(actor.state.handoffState.activeStageId, 'STAGE_1');
    resyncLiveRouteTraveler(live, actor.state, along(seam, -1));
    actor.currentWorldPoint = along(seam, 1);
  }
  const tick = advanceLiveRouteMultiActorTick(live, shared, actors);
  assert.ok(Object.values(tick.actors).every((a) => a.committed));
  const committed = structuredClone(actors);
  const bindings = JSON.parse(await readFile(new URL('bindings.json', directory)));
  const parent = await open(bindings.STAGE_1);
  const child = await open(bindings.STAGE_2_R);
  const transport = delivery();
  let now = 0,
    callback,
    ticks = 0,
    visible;
  const loop = createFrameLoop(
    () => {
      ticks++;
      advanceLiveRouteMultiActorTick(live, shared, actors);
    },
    () => {},
    {
      now: () => now,
      request: (cb) => {
        callback = cb;
        return 1;
      },
      cancel: () => {
        callback = undefined;
      },
    },
  );
  const controller = new ReadyFrameController(
    loop,
    (frame) => {
      visible = frame.reader;
    },
    () => {},
  );
  try {
    assert.equal(
      await controller.replace((signal) =>
        parent.acquire(transport.store, parent.rowDemand([{ s: 5, deltaSEffective: 1 }]), signal),
      ),
      true,
    );
    const old = visible;
    const resume = transport.delay();
    const pending = controller.replace((signal) =>
      child.acquire(transport.store, child.rowDemand([{ s: 5, deltaSEffective: 1 }]), signal),
    );
    now = 100000;
    assert.equal(callback, undefined);
    assert.equal(visible, old);
    assert.deepEqual(actors, committed, 'waiting cannot roll back a completed physical transaction');
    resume();
    assert.equal(await pending, true);
    assert.notEqual(visible, old);
    callback(now);
    assert.equal(ticks, 0, 'resume drops elapsed loading time');
    assert.deepEqual(actors, committed);
    // Reverse/recovery resynchronization stays a geometry operation and needs no image lease.
    const loads = transport.loads;
    for (const actor of actors) resyncLiveRouteTraveler(live, actor.state, along(seam, -2));
    assert.equal(transport.loads, loads);
    assert.ok(actors.every((a) => a.state.handoffState.activeStageId === 'STAGE_2_R'));
  } finally {
    controller.dispose();
    transport.store.dispose();
  }
});

test('real circuit window seams and repeated laps reuse one immutable directory and payload set', async () => {
  const { window } = createTsukubaCourse2000Runtime();
  const asset = await open(JSON.parse(await readFile(new URL('circuit-binding.json', directory))));
  const reference = new BakedGroundMapAsset(
    JSON.parse(await readFile(new URL('../../.test-assets/tsukuba-lap.json', import.meta.url))),
    await readFile(new URL('../../.test-assets/tsukuba-lap.bin', import.meta.url)),
  );
  const lap = window.topology.lapLength;
  const samples = [-0.1, 0, 0.1].map((offset) => ({
    s: circuitWindowToLapSourceChainage(window, lap + offset),
    deltaSEffective: 1,
  }));
  const transport = delivery();
  const a = await asset.acquire(transport.store, asset.rowDemand(samples));
  const loads = transport.loads;
  const bytes = transport.store.accounting.residentBytes;
  const repeated = samples.map((_, i) => ({
    s: circuitWindowToLapSourceChainage(window, 2 * lap + [-0.1, 0, 0.1][i]),
    deltaSEffective: 1,
  }));
  const b = await asset.acquire(transport.store, asset.rowDemand(repeated));
  try {
    assert.equal(transport.loads, loads);
    assert.equal(transport.store.accounting.residentBytes, bytes);
    for (const sample of [...samples, ...repeated]) {
      for (const l of [-7.5, -6, 0, 6, 7.5])
        assert.deepEqual(b.reader.sample(sample.s, l, 1), reference.sample(sample.s, l, 1));
    }
    a.release();
    assert.ok(transport.store.accounting.pinnedBytes > 0, 'second virtual window retains shared payloads');
  } finally {
    a.release();
    b.release();
    transport.store.dispose();
  }
});
