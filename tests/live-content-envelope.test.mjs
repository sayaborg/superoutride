import assert from 'node:assert/strict';
import test from 'node:test';
import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  guideCoordinateToWorld,
  locateWorldOnGuideCoordinateGlobal,
} from '../dist/core/guide-coordinate-frame.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/core/height-profile.js';
import { compileRasterPath } from '../dist/core/raster-path.js';
import { createM638DeclarativeForkGrowthRuntime } from '../dist/dev/m6-38-declarative-fork-growth-plan.js';
import {
  createM72DefaultBranchingParent,
  M7_2_DEFAULT_BRANCHING_FORK,
} from '../dist/dev/m7-2-default-branching-highway.js';
import { createM83LinearHighwayRuntime } from '../dist/dev/m8-3-linear-highway.js';
import { createM93TsukubaCourse2000Runtime } from '../dist/dev/m9-3-tsukuba-circuit.js';
import { createM96FiscoRuntime } from '../dist/dev/m9-6-fisco-circuit.js';
import { validateSurfaceGuideEnvelope } from '../dist/physics/surface-guide-envelope.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { compileCircuitRuntimeWindow } from '../dist/runtime/circuit-runtime-window.js';
import {
  compileAuthoredStageRuntimePackage,
  compileStageEnvironment,
} from '../dist/runtime/stage-authoring-compiler.js';
import { compileStageRuntimeContentRegistry } from '../dist/runtime/stage-runtime-content.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

const environment = {
  terrain: { groundLeft: 12, groundRight: 12, roadLeft: 3.5, roadRight: 3.5 },
  heightNodes: [{ s: 0, y: 0 }],
  visualSections: [
    { sStart: 0, name: 'fixture', groundBaseLeft: { kind: 'transparent' }, groundBaseRight: { kind: 'transparent' } },
  ],
  farBackground: null,
};
const guide = compileGuidePath(
  compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 100 },
  ]),
  { lMax: 12, mMin: 0.25, dCam: 5 },
);
const surface = (width) =>
  new SurfaceMap(guide.length, [
    { sStart: 0, name: 'support', bands: [{ lMin: -width, lMax: width, type: 'ASPHALT' }] },
  ]);

test('live authored and registry compilation reject equality, overflow and missing envelope metadata', () => {
  const source = {
    packageId: 'course',
    worldFrameId: 'world',
    coordinateFrame: guide,
    roadView: null,
    groundProfile: {},
    surfaceMap: surface(11),
  };
  const valid = compileAuthoredStageRuntimePackage(source, environment);
  const manifest = { worldFrameId: 'world', packages: [{ packageId: 'course' }] };
  for (const bad of [surface(12), surface(13), { sample: () => null }]) {
    assert.throws(() => compileAuthoredStageRuntimePackage({ ...source, surfaceMap: bad }, environment), /envelope/);
    assert.throws(() => compileStageRuntimeContentRegistry(manifest, [{ ...valid, surfaceMap: bad }]), /envelope/);
  }
  for (const dMax of [100, 200])
    compileStageEnvironment(guide, { ...environment, terrain: { ...environment.terrain, dMax } });
  for (const dMax of [0, -1, NaN, Infinity, 1]) {
    assert.throws(
      () => compileStageEnvironment(guide, { ...environment, terrain: { ...environment.terrain, dMax } }),
      /draw distance/,
    );
  }
});

test('shifted chart validation and explicit clamping use the underlying Guide lateral basis', () => {
  const frame = { guide, lateralOrigin: 8 };
  validateSurfaceGuideEnvelope(frame, surface(3));
  assert.throws(() => validateSurfaceGuideEnvelope(frame, surface(4)), /envelope/);
  const world = guideCoordinateToWorld(frame, 50, 20);
  assert.equal(locateWorldOnGuideCoordinateGlobal(frame, world, true).l, 4);
  assert.equal(locateWorldOnGuideCoordinateGlobal(frame, world, false).l, 20);
});

test('all shipped courses and every branching successor have strict supported chart margins', () => {
  const linear = createM83LinearHighwayRuntime();
  assert.equal(linear.guide.lMax, 13);
  validateSurfaceGuideEnvelope(linear.guide, linear.surfaceMap);
  const parent = createM72DefaultBranchingParent();
  const live = createM638DeclarativeForkGrowthRuntime(
    parent.guide,
    { ...parent, selectFarBackground: () => createFarBackground(), worldSprites: [] },
    createSpriteAssets(),
    M7_2_DEFAULT_BRANCHING_FORK,
  );
  let largest = 0;
  for (const content of live.registry.packages) {
    const extent =
      content.surfaceMap.maxSupportedAbsL + Math.abs(guideCoordinateLateralOrigin(content.coordinateFrame));
    largest = Math.max(largest, extent);
    assert.ok(extent < guideCoordinateCurve(content.coordinateFrame).lMax, content.packageId);
  }
  assert.ok(largest > 19.5 && largest < 20, 'second-fork translated support must be included');
  for (const [create, limit] of [
    [createM93TsukubaCourse2000Runtime, 13],
    [createM96FiscoRuntime, 18],
  ]) {
    const { window: w } = create();
    assert.equal(w.guide.lMax, limit);
    validateSurfaceGuideEnvelope(w.guide, w.surface);
    const length = w.topology.lapLength;
    const width = w.surface.maxSupportedAbsL;
    const sources = {
      height: new HeightProfile(length, [
        { s: 0, y: 0 },
        { s: length, y: 0 },
      ]),
      visual: new VisualProfile(length, environment.visualSections),
      surface: new SurfaceMap(length, [
        { sStart: 0, name: 'boundary', bands: [{ lMin: -width, lMax: width, type: 'GRASS' }] },
      ]),
    };
    assert.throws(
      () => compileCircuitRuntimeWindow(w.topology, 0, 1, { lMax: width, mMin: 0.25, dCam: 5 }, sources),
      /envelope/,
    );
  }
});

test('physical material validation rejects VOID and inherited object property names', () => {
  for (const type of ['VOID', 'toString', 'NOT_A_MATERIAL']) {
    assert.throws(
      () => new SurfaceMap(100, [{ sStart: 0, name: 'bad', bands: [{ lMin: -1, lMax: 1, type }] }]),
      /supported material/,
    );
  }
});
