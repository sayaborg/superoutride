import assert from 'node:assert/strict';
import test from 'node:test';

import { HeightProfile } from '../../dist/core/height-profile.js';

import { VisualProfile } from '../../dist/visual/visual-profile.js';

const visualSections = [
  {
    sStart: 0,
    name: 'START',
    groundBaseLeft: { kind: 'color', color: 0x111111ff },
    groundBaseRight: { kind: 'color', color: 0x222222ff },
  },
  {
    sStart: 60,
    name: 'LATE',
    groundBaseLeft: { kind: 'color', color: 0x333333ff },
    groundBaseRight: { kind: 'color', color: 0x444444ff },
  },
];

test('HeightProfile is open, explicit at both endpoints and never wraps', () => {
  assert.throws(
    () =>
      new HeightProfile(100, [
        { s: 0, y: 0 },
        { s: 80, y: 5 },
      ]),
    /must end at courseLength/,
  );
  const profile = new HeightProfile(100, [
    { s: 0, y: 0 },
    { s: 50, y: 5 },
    { s: 100, y: 2 },
  ]);
  assert.equal(profile.sampleRender(0).y, 0);
  assert.equal(profile.sampleRender(100).y, 2);
  assert.equal(profile.distanceToNextRenderNode(100), 0);
  assert.throws(() => profile.sampleRender(-0.001), RangeError);
  assert.throws(() => profile.sampleRender(100.001), RangeError);
});

test('VisualProfile owns an open interval', () => {
  const open = new VisualProfile(100, visualSections);
  assert.equal(open.sample(0).name, 'START');
  assert.equal(open.sample(100).name, 'LATE');
  assert.equal(open.distanceToNextSection(100), 0);
  assert.throws(() => open.sample(-0.001), RangeError);
  assert.throws(() => open.sample(100.001), RangeError);
});
