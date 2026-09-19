import assert from 'node:assert/strict';
import test from 'node:test';

import { detectPhysicalRaceGateCrossing } from '../../dist/gameplay/physical-race-gate.js';

import { compileWorldCrossingGate, observeWorldCrossingGate } from '../../dist/gameplay/world-crossing-gate.js';

const gate = compileWorldCrossingGate({ id: 'gate', center: { x: 0, z: 0 }, heading: 0, halfWidth: 2 });

for (const observe of [observeWorldCrossingGate, detectPhysicalRaceGateCrossing]) {
  test(`${observe.name}: a sub-nanometre approach cannot swallow a later physical crossing`, () => {
    for (const sign of [-1, 1]) {
      const points = [-1, -5e-10, 5e-10, 1].map((z) => ({ x: 0, z: sign * z }));
      const crossings = points
        .slice(1)
        .map((p, i) => observe(gate, points[i], p))
        .filter(Boolean);
      assert.equal(crossings.length, 1);
      assert.equal(crossings[0].direction, sign === 1 ? 'FORWARD' : 'REVERSE');
      assert.equal(crossings[0].u, 0.5);
      assert.ok(observe(gate, points[0], { x: 0, z: 0 }));
      assert.equal(observe(gate, { x: 0, z: 0 }, points.at(-1)), null);
      assert.equal(observe(gate, { x: 3, z: -1 }, { x: 3, z: 1 }), null);
    }
  });
}

test('compiled world gates keep immutable geometry independent of authoring', () => {
  const source = { id: 'gate', center: { x: 0, z: 0 }, heading: 0, halfWidth: 2 };
  const world = compileWorldCrossingGate(source);
  source.center.z = 100;
  assert.ok(observeWorldCrossingGate(world, { x: 0, z: -1 }, { x: 0, z: 1 }));
  for (const gate of [world]) {
    for (const vector of [gate.center, gate.tangent, gate.normal]) {
      assert.throws(() => {
        vector.x = 999;
      }, TypeError);
    }
  }
});
