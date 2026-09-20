import assert from 'node:assert/strict';
import test from 'node:test';
import { hypot2, hypot3 } from '../../dist/core/norm.js';

test('fixed-arity norms match the supported runtime bits across zeros, extremes and independent magnitudes', () => {
  const edges = [
    -Infinity,
    -Number.MAX_VALUE,
    -1,
    -Number.MIN_VALUE,
    -0,
    0,
    Number.MIN_VALUE,
    1,
    Number.MAX_VALUE,
    Infinity,
    NaN,
  ];
  for (const a of edges)
    for (const b of edges) {
      assert.ok(Object.is(hypot2(a, b), Math.hypot(a, b)));
      for (const c of edges) assert.ok(Object.is(hypot3(a, b, c), Math.hypot(a, b, c)));
    }
  let seed = 123456789;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const number = () => (random() * 2 - 1) * 2 ** Math.floor(random() * 2100 - 1074);
  for (let i = 0; i < 100000; i++) {
    const a = number(),
      b = number(),
      c = number();
    assert.ok(Object.is(hypot2(a, b), Math.hypot(a, b)));
    assert.ok(Object.is(hypot3(a, b, c), Math.hypot(a, b, c)));
  }
});
