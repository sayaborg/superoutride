import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceVehicleWithRecovery, createRecoveryState, updateRecovery } from '../dist/gameplay/recovery.js';
import { updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { refreshGuideObservation, VehicleOutsideModelError } from '../dist/physics/vehicle-dynamics.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createTerrainProbe } from '../tools/torque-protection-terrain-probe.mjs';

import { HeightProfile } from '../dist/core/height-profile.js';

const neutral = { steering: 0, throttle: 0, brake: 0 };
for (const entry of VEHICLE_CATALOG.filter((e) => /TESTAROSSA|R80/.test(e.profile.id))) {
  test(`${entry.profile.id}: a real crest domain exit recovers and subsequent ticks continue`, () => {
    const make = () => {
      const fixture = createTerrainProbe(entry, { speed: 30 });
      fixture.height = new HeightProfile(10000, [
        { s: 0, y: 0 },
        { s: 1030, y: 0 },
        { s: 1035, y: 2 },
        { s: 1040, y: 0 },
        { s: 10000, y: 0 },
      ]);
      return fixture;
    };
    const raw = make();
    const rawRecovery = createRecoveryState(raw.vehicle);
    assert.throws(
      () => {
        for (let i = 0; i < 600; i++) {
          updateArcadeVehicle(
            { guide: raw.guide, height: raw.height, surfaces: raw.surface },
            raw.vehicle,
            neutral,
            1 / 120,
          );
          updateRecovery({ guide: raw.guide, height: raw.height, surfaces: raw.surface }, raw.vehicle, {
            state: rawRecovery,
            dt: 1 / 120,
          });
        }
      },
      VehicleOutsideModelError,
      'raw physics must expose its finite suspension domain',
    );
    const { guide, height, surface, vehicle } = make();
    const state = createRecoveryState(vehicle);
    const tire = structuredClone(vehicle.tireFrictionCalibration);
    const steering = structuredClone(vehicle.steeringCalibration);
    let domainRecoveries = 0,
      firstRecoveryTick = null;
    for (let i = 0; i < 600; i++) {
      const reason = advanceVehicleWithRecovery({ guide, height, surfaces: surface }, vehicle, {
        state,
        input: neutral,
        dt: 1 / 120,
      });
      if (reason === 'suspension-travel') {
        domainRecoveries++;
        firstRecoveryTick ??= i;
      }
      assert.ok([vehicle.x, vehicle.y, vehicle.z, vehicle.velocityY, vehicle.pitch].every(Number.isFinite));
    }
    assert.ok(domainRecoveries > 0);
    assert.ok(firstRecoveryTick < 599, 'simulation continued after recovery');
    assert.deepEqual(vehicle.tireFrictionCalibration, tire);
    assert.deepEqual(vehicle.steeringCalibration, steering);
  });
}

test('invalid coordinate seeds and unrelated reader failures remain errors, not global reprojection or recovery', () => {
  const { guide, height, surface, vehicle } = createTerrainProbe(VEHICLE_CATALOG[0]);
  const state = createRecoveryState(vehicle);
  const original = vehicle.course;
  for (const segmentIndex of [-1, NaN, Infinity, 0.5, guide.segments.length]) {
    vehicle.course = { ...original, segmentIndex };
    assert.throws(() => refreshGuideObservation(guide, vehicle), RangeError);
  }
  vehicle.course = original;
  const fault = new Error('broken surface reader');
  assert.throws(
    () =>
      advanceVehicleWithRecovery(
        {
          guide,
          height,
          surfaces: {
            ...surface,
            sample() {
              throw fault;
            },
          },
        },
        vehicle,
        { state, input: neutral, dt: 1 / 120 },
      ),
    (error) => error === fault,
  );
  assert.equal(state.recoveries, 0);
});

test('invalid geometry cannot become a fabricated unit axis or a NaN Guide observation', async () => {
  const { normalize3, rotateAroundAxis } = await import('../dist/core/vector3.js');
  const { locateWorldOnGuideGlobal, locateWorldOnGuideLocal } = await import('../dist/core/guide-curve.js');
  for (const v of [
    { x: 0, y: 0, z: 0 },
    { x: NaN, y: 0, z: 1 },
    { x: 1, y: Infinity, z: 0 },
    { x: Number.MIN_VALUE, y: 0, z: 0 },
  ]) {
    assert.throws(() => normalize3(v), RangeError);
    assert.throws(() => rotateAroundAxis({ x: 0, y: 0, z: 1 }, v, 0.2), RangeError);
  }
  const { guide } = createTerrainProbe(VEHICLE_CATALOG[0]);
  for (const coordinate of ['x', 'z'])
    for (const bad of [NaN, Infinity, -Infinity]) {
      const point = { x: 0, z: 1000, [coordinate]: bad };
      assert.throws(() => locateWorldOnGuideGlobal(guide, point), RangeError);
      assert.throws(() => locateWorldOnGuideLocal(guide, point, 0), RangeError);
    }
});
