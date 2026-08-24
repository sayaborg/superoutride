import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CyclicGroundMapLogicalProfile,
  GroundMapLogicalProfile,
} from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { compileStageEnvironment } from '../dist/runtime/stage-authoring-compiler.js';
import { CyclicHeightProfile, HeightProfile } from '../dist/visual/height-profile.js';
import { CyclicVisualProfile, VisualProfile } from '../dist/visual/visual-profile.js';

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

const logicalSections = [
  { sStart: 0, name: 'START', left: 'GRASS', right: 'GRASS' },
  { sStart: 60, name: 'LATE', left: 'ROCK', right: 'GRASS' },
];

test('M6.45 HeightProfile is open, explicit at both endpoints and never wraps', () => {
  assert.throws(
    () => new HeightProfile(100, [{ s: 0, y: 0 }, { s: 80, y: 5 }]),
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

test('M6.45 cyclic height addressing exists only through CyclicHeightProfile', () => {
  const profile = new CyclicHeightProfile(100, [
    { s: 0, y: 0 },
    { s: 50, y: 5 },
  ]);
  assert.equal(profile.sampleRender(25).y, profile.sampleRender(125).y);
  assert.equal(profile.samplePhysics(75), profile.samplePhysics(-25));
});

test('M6.45 VisualProfile is open while CyclicVisualProfile is an explicit adapter primitive', () => {
  const open = new VisualProfile(100, visualSections);
  assert.equal(open.sample(0).name, 'START');
  assert.equal(open.sample(100).name, 'LATE');
  assert.equal(open.distanceToNextSection(100), 0);
  assert.throws(() => open.sample(-0.001), RangeError);
  assert.throws(() => open.sample(100.001), RangeError);

  const cyclic = new CyclicVisualProfile(100, visualSections);
  assert.equal(cyclic.sample(125).name, open.sample(25).name);
  assert.equal(cyclic.sample(-25).name, open.sample(75).name);
});

test('M6.45 logical GroundMap is open while cyclic logical addressing is explicit', () => {
  const open = new GroundMapLogicalProfile(100, logicalSections);
  assert.equal(open.sample(0).name, 'START');
  assert.equal(open.sample(100).name, 'LATE');
  assert.throws(() => open.sample(-0.001), RangeError);
  assert.throws(() => open.sample(100.001), RangeError);

  const cyclic = new CyclicGroundMapLogicalProfile(100, logicalSections);
  assert.equal(cyclic.sample(125).name, open.sample(25).name);
  assert.equal(cyclic.sample(-25).name, open.sample(75).name);
});

test('M6.45 stage compiler explicitly extends authored final height to the open Guide endpoint', () => {
  const guide = createM2StadiumGuide();
  const environment = compileStageEnvironment(guide, {
    heightNodes: [
      { s: 0, y: 0 },
      { s: 60, y: 3 },
    ],
    visualSections: [visualSections[0]],
    farBackground: null,
  });

  const endpoint = environment.heightProfile.nodes.at(-1);
  assert.equal(endpoint.s, guide.length);
  assert.equal(endpoint.y, 3);
  assert.equal(environment.heightProfile.sampleRender(guide.length).y, 3);
  assert.throws(() => environment.heightProfile.sampleRender(guide.length + 0.001), RangeError);
});
