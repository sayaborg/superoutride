import { createTestSpriteAssets } from '../helpers/sprite-assets.mjs';
import { createPlanarCoordinateSample } from '../../dist/core/planar-sample.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { guidePathToWorld } from '../../dist/core/guide-curve.js';
import { createHillDipHeightProfile } from '../../dist/dev/fixtures/hill-dip-height.js';
import { createMaterialTransitionSurfaceMap } from '../../dist/dev/fixtures/material-transitions.js';
import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../dist/gameplay/envelope-driver.js';
import { createDynamicVehicleCourseSprite } from '../../dist/render/dynamic-vehicle-sprite.js';
import { deriveVehicleNormalizedBank, deriveVehicleSpriteFamily } from '../../dist/render/vehicle-presentation.js';
import { selectVehicleSprite } from '../../dist/visual/sprite-assets.js';
import { createTestCar, updateTestVehicle } from '../helpers/vehicle-fixture.mjs';
import { driveMeasuredVehicle, testEnvelope } from '../helpers/envelope-driving.mjs';
test('rival presentation uses supplied metadata and the same presentation-only bank primitive', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const assets = createTestSpriteAssets();
  const vehicle = { ...fakeCar(guide, 50), longitudinalSpeed: 30, yawRate: 0.2 };
  const before = structuredClone(vehicle);
  for (const presentationFamily of ['CAR', 'BIKE']) {
    const family = deriveVehicleSpriteFamily({ presentationFamily });
    const sprite = createDynamicVehicleCourseSprite('TEST', vehicle, vehicle.yaw, assets[family], height);
    assert.equal(sprite.asset, selectVehicleSprite(assets[family], 0, deriveVehicleNormalizedBank(vehicle)).asset);
  }
  assert.deepEqual(vehicle, before);
});

function fakeCar(guide, s, l = 0, speed = 45) {
  const sample = guidePathToWorld(guide, s, l, createPlanarCoordinateSample());
  return {
    x: sample.x,
    y: 0,
    z: sample.z,
    yaw: sample.heading,
    course: {
      s: sample.s,
      l,
      segmentIndex: sample.segmentIndex,
      distanceSquared: 0,
    },
    longitudinalSpeed: speed,
    lateralSpeed: 0,
  };
}

test('dynamic rival render adapter preserves road-relative physical height in ordinary CourseSprite', () => {
  const guide = createStadiumGuide();
  const assets = createTestSpriteAssets();
  const height = createHillDipHeightProfile(guide.length);
  const car = fakeCar(guide, 123, 2, 50);
  car.y = 1.25;
  const sprite = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw, assets.car, height);

  assert.equal(sprite.name, 'RIVAL');
  assert.equal(sprite.x, car.x);
  assert.equal(sprite.y, height.sampleRender(car.course.s).y + car.y - height.samplePhysics(car.course.s));
  assert.equal(sprite.z, car.z);
  assert.equal(sprite.sRender, car.course.s);
  assert.equal(sprite.asset.worldWidthMeters, 2.0);
});

test('dynamic rival orientation chooses a discrete existing yaw asset rather than runtime bitmap rotation', () => {
  const guide = createStadiumGuide();
  const assets = createTestSpriteAssets();
  const height = createHillDipHeightProfile(guide.length);
  const car = fakeCar(guide, 123, 0, 50);
  const rear = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw, assets.car, height);
  const side = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw - Math.PI / 2, assets.car, height);

  assert.notEqual(rear.asset.name, side.asset.name);
  assert.ok(assets.car.assets.flat().includes(rear.asset));
  assert.ok(assets.car.assets.flat().includes(side.asset));
});
test('rival controller drives through the first crest/bend with causal release and recontact', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const surfaces = createMaterialTransitionSurfaceMap(guide.length);
  const rival = createTestCar(guide, height, surfaces, 95);
  const start = { x: rival.x, z: rival.z, s: rival.course.s };
  let maxAbsL = 0;
  let observedAirborne = false;
  let observedRecontact = false;

  // Three seconds crosses the authored crest and first bend transition. derives contact
  // causally, so the crest releases the car before it recontacts; no recovery helper is used.
  for (let i = 0; i < 180; i += 1) {
    const input = driveMeasuredVehicle(guide, rival);
    updateTestVehicle(guide, height, surfaces, rival, input, 1 / 60);
    maxAbsL = Math.max(maxAbsL, Math.abs(rival.course.l));
    assert.ok(Number.isFinite(rival.x) && Number.isFinite(rival.z) && Number.isFinite(rival.yaw));
    if (!rival.supported) observedAirborne = true;
    else if (observedAirborne) observedRecontact = true;
  }

  assert.ok(Math.hypot(rival.x - start.x, rival.z - start.z) > 100);
  assert.ok(rival.course.s !== start.s);
  assert.equal(observedAirborne, true);
  assert.equal(observedRecontact, true);
  assert.ok(maxAbsL < 10.5, `max |l|=${maxAbsL}`);
});

test('envelope inputs are deterministic, bounded and leave the physical read state unchanged', () => {
  const guide = createStadiumGuide(),
    car = Object.freeze(fakeCar(guide, 100, 4, 35));
  const before = structuredClone(car),
    envelope = testEnvelope();
  const driver = compileEnvelopeDriver(envelope, 0.75, envelope.maximumSpeed);
  const workspace = createEnvelopeDriverWorkspace();
  const first = { ...sampleEnvelopeDrivingInput(guide, car, driver, 0, workspace) };
  assert.deepEqual(sampleEnvelopeDrivingInput(guide, car, driver, 0, workspace), first);
  assert.ok(first.steering < 0 && first.steering >= -1);
  assert.equal(typeof first.throttle, 'boolean');
  assert.equal(typeof first.brake, 'boolean');
  assert.deepEqual(car, before);
});

test('utilization and speed cap control the ordinary distance-dependent braking envelope', () => {
  const envelope = {
    maximumSpeed: 80,
    rows: [5, 80].map((speed) => ({ speed, acceleration: 5, braking: 10, lateral: 10, steeringGain: 30 })),
  };
  const guide = {
    domain: { start: 0, end: 1000 },
    toWorld(s, l, out) {
      return Object.assign(out, {
        s,
        l,
        x: l,
        z: s,
        heading: Math.max(0, Math.min(1, (s - 200) / 10)),
        segmentIndex: 0,
      });
    },
  };
  const car = { x: 0, z: 150, yaw: 0, course: { s: 150, l: 0 }, longitudinalSpeed: 20, lateralSpeed: 0 };
  assert.equal(
    sampleEnvelopeDrivingInput(
      guide,
      car,
      compileEnvelopeDriver(envelope, 0.25, 80),
      0,
      createEnvelopeDriverWorkspace(),
    ).brake,
    true,
  );
  assert.equal(
    sampleEnvelopeDrivingInput(guide, car, compileEnvelopeDriver(envelope, 0.9, 80), 0, createEnvelopeDriverWorkspace())
      .throttle,
    true,
  );
  assert.equal(
    sampleEnvelopeDrivingInput(guide, car, compileEnvelopeDriver(envelope, 0.9, 10), 0, createEnvelopeDriverWorkspace())
      .brake,
    true,
  );
  assert.throws(() => compileEnvelopeDriver(envelope, 0, 80), RangeError);
  assert.throws(() => compileEnvelopeDriver(envelope, 1.1, 80), RangeError);
});

test('rolling lookahead reuses adjacent Guide samples and invalidates changed geometry, lane and envelope', () => {
  let calls = 0;
  const guide = {
    domain: { start: 0, end: 1000 },
    toWorld(s, l, out) {
      calls++;
      return Object.assign(out, { s, l, x: l, z: s, heading: 0, segmentIndex: 0 });
    },
  };
  const car = { x: 0, z: 100, yaw: 0, course: { s: 100, l: 0 }, longitudinalSpeed: 20, lateralSpeed: 0 };
  const envelope = testEnvelope(),
    driver = compileEnvelopeDriver(envelope, 0.75, 56),
    workspace = createEnvelopeDriverWorkspace();
  const sample = (source = guide, lane = 0, plan = driver) =>
    sampleEnvelopeDrivingInput(source, car, plan, lane, workspace);
  sample();
  assert.ok(calls <= 99 && calls > 90);
  calls = 0;
  sample();
  assert.equal(calls, 1, 'only the current steering target changes within a planning cell');
  calls = 0;
  car.course.s = car.z = 105;
  sample();
  assert.ok(calls <= 3);
  for (const action of [
    () => sample({ ...guide }),
    () => sample(guide, 2),
    () => sample(guide, 0, compileEnvelopeDriver(envelope, 0.5, 56)),
  ]) {
    calls = 0;
    action();
    assert.ok(calls > 90, 'changed authority invalidates borrowed planning data');
  }
});

test('browser envelope admission owns immutable rows and rejects stale vehicle inputs', async () => {
  const { readVehicleEnvelope } = await import('../../dist/runtime/vehicle-envelope.js');
  const { browserSessionVehicle } = await import('../../dist/browser/session-vehicle.js');
  const { DEFAULT_VEHICLE_CATALOG_ENTRY } = await import('../../dist/vehicle/vehicle-catalog.js');
  const { readFile } = await import('node:fs/promises');
  const source = JSON.parse(await readFile(new URL('../../dist/content/envelopes/TESTAROSSA.json', import.meta.url)));
  const vehicle = browserSessionVehicle(DEFAULT_VEHICLE_CATALOG_ENTRY);
  const admitted = await readVehicleEnvelope(vehicle, source);
  assert.ok(Object.isFrozen(admitted) && Object.isFrozen(admitted.rows) && admitted.rows.every(Object.isFrozen));
  const braking = admitted.rows[0].braking;
  source.envelope.rows[0].braking = 0;
  assert.equal(admitted.rows[0].braking, braking);
  await assert.rejects(readVehicleEnvelope(vehicle, source), RangeError);
  source.envelope.rows[0].braking = braking;
  await assert.rejects(readVehicleEnvelope({ ...vehicle, kind: 'bike' }, source), /identity/);
});
