import assert from 'node:assert/strict';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { arcadeBodyKinematics, createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation, sampleSurfaceGeometryAtCoordinate } from '../dist/physics/vehicle-dynamics.js';
import { dot3 } from '../dist/physics/vehicle-math3.js';
import { setEngineTorqueMultiplier } from '../dist/physics/automatic-powertrain.js';
import { createM5RecoveryState, updateM5Recovery } from '../dist/gameplay/recovery.js';
import { HONDA_VFR750R_VEHICLE_PROFILE as profile } from '../dist/physics/vehicle-profiles.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM93TsukubaCourse2000Runtime } from '../dist/dev/m9-3-tsukuba-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';

const DEG = Math.PI / 180;
const guide = compileGuidePath(compileRasterPath([{ x: 0, z: 0 }, { x: 0, z: 4000 }]),
  { lMax: 1000, mMin: 0.25, dCam: 5 });
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surfaces = new SurfaceMap(guide.length, [{ sStart: 0, name: 'wheel-lift fixture',
  bands: [{ lMin: -1000, lMax: 1000, type: 'ASPHALT' }] }]);

function observe(v, station) {
  return deriveContactObservation(guide, height, surfaces, arcadeBodyKinematics(v), station, 0, v.course.segmentIndex);
}

function assertFinite(v) {
  for (const key of ['x', 'y', 'z', 'velocityX', 'velocityY', 'velocityZ',
    'yaw', 'pitch', 'yawRate', 'pitchRate', 'frontSteerAngle', 'frontWheelOmega', 'rearWheelOmega']) {
    assert.ok(Number.isFinite(v[key]), key);
  }
}

test('M9.18 wheelie and stoppie single-contact poses retain ordinary forces without recovery', () => {
  for (const degrees of [-80, -45, -15, 15, 45, 80]) {
    const v = createArcadeVehicle(profile, guide, height, surfaces, 800, 0, 15);
    v.pitch = degrees * DEG;
    const loadedStation = degrees > 0 ? profile.rearStation : profile.frontStation;
    // Seed one ordinary compressed station once, with the other station geometrically separated.
    v.y = loadedStation.freeReachDown * Math.cos(v.pitch)
      - loadedStation.forwardOffset * Math.sin(v.pitch) - 0.03;
    const front = observe(v, profile.frontStation), rear = observe(v, profile.rearStation);
    const loaded = degrees > 0 ? rear : front, lifted = degrees > 0 ? front : rear;
    assert.equal(loaded.withinReach, true);
    assert.ok(loaded.normalLoad > 0);
    assert.ok(Math.abs(loaded.normalLoad - loadedStation.suspension.springRate * 0.03) < 1e-7);
    assert.equal(lifted.withinReach, false);
    assert.equal(lifted.normalLoad, 0);
    assert.ok(lifted.gap > 0);
    v.frontNormalLoad = front.normalLoad;
    v.rearNormalLoad = rear.normalLoad;
    const before = [v.pitch, v.pitchRate, v.velocityX, v.velocityY, v.velocityZ];
    const state = createM5RecoveryState(v);
    assert.equal(updateM5Recovery(state, guide, height, surfaces, v, 1 / 60), null);
    assert.equal(state.recoveries, 0);
    assert.deepEqual([v.pitch, v.pitchRate, v.velocityX, v.velocityY, v.velocityZ], before);
  }
});

test('M9.18 upside-down suspension cannot supply false wheel contact on either station', () => {
  for (const station of [profile.frontStation, profile.rearStation]) {
    const v = createArcadeVehicle(profile, guide, height, surfaces, 800, 0, 0);
    v.pitch = Math.PI;
    v.y = -station.freeReachDown - 0.03;
    const c = observe(v, station);
    assert.ok(c.gap < 0, 'reproduce the former inverted penetration with supported geography');
    assert.equal(c.supportAvailable, true);
    assert.equal(c.withinReach, false);
    assert.equal(c.forceTransmitting, false);
    assert.equal(c.normalLoad, 0);
    assert.equal(c.q, 0);
  }
});

test('M9.18 overturned recovery precedes stale support and preserves calibration and explicit target', () => {
  for (const target of [null, { s: 750, l: 1 }]) {
    const v = createArcadeVehicle(profile, guide, height, surfaces, 800, 0, 25,
      { maxRoadWheelSteer: 60 * DEG, steeringOffsetMax: 12 * DEG },
      { referenceFrictionMultiplier: 2, linearStiffnessMultiplier: 1.4, slidingFrictionRatio: 0.5 });
    setEngineTorqueMultiplier(v.powertrain, 3);
    const before = structuredClone({ steering: v.steeringCalibration, tire: v.tireFrictionCalibration });
    const state = createM5RecoveryState(v);
    v.pitch = Math.PI;
    v.pitchRate = 2;
    v.frontNormalLoad = 1000;
    v.rearNormalLoad = 1000;
    assert.equal(v.supported, true, 'stale contact telemetry must not veto an overturned pose');
    assert.equal(updateM5Recovery(state, guide, height, surfaces, v, 1 / 60, undefined, target), 'overturned');
    assert.equal(state.recoveries, 1);
    assert.equal(state.lastReason, 'overturned');
    assert.equal(v.pitch, 0);
    assert.equal(v.pitchRate, 0);
    assert.deepEqual(v.actuator, { steering: 0, throttle: 0, brake: 0 });
    assert.equal(v.powertrain.engineTorqueMultiplier, 3);
    assert.deepEqual(v.steeringCalibration, before.steering);
    assert.deepEqual(v.tireFrictionCalibration, before.tire);
    assert.ok(Math.abs(v.course.s - (target?.s ?? 792)) < 1e-8);
    assert.ok(Math.abs(v.course.l - (target?.l ?? 0)) < 1e-8);
    assert.equal(updateM5Recovery(state, guide, height, surfaces, v, 1 / 60), null);
    assertFinite(v);
  }
});

test('M9.18 overturned criterion is relative to surface normal rather than a world-pitch clamp', () => {
  const slope = 0.2;
  const uphill = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: slope * guide.length }]);
  const v = createArcadeVehicle(profile, guide, uphill, surfaces, 800, 0, 15);
  const state = createM5RecoveryState(v);
  v.pitch = Math.atan(slope) + 80 * DEG;
  v.frontNormalLoad = 0;
  v.rearNormalLoad = 1000;
  const surface = sampleSurfaceGeometryAtCoordinate(guide, uphill, surfaces, v.course);
  assert.ok(v.pitch > Math.PI / 2);
  assert.ok(dot3(arcadeBodyKinematics(v).up, surface.normal) > 0);
  assert.equal(updateM5Recovery(state, guide, uphill, surfaces, v, 1 / 60), null);
  v.pitch = Math.atan(slope) + 100 * DEG;
  assert.equal(updateM5Recovery(state, guide, uphill, surfaces, v, 1 / 60), 'overturned');
});

test('M9.18 upright suspension travel guard is retained rather than clipped or disabled', () => {
  const v = createArcadeVehicle(profile, guide, height, surfaces, 800, 0, 0);
  v.y = profile.frontStation.freeReachDown - profile.frontStation.suspension.qTravel - 0.001;
  assert.throws(() => observe(v, profile.frontStation),
    (e) => e.name === 'VehicleOutsideModelError' && e.compression >= e.travel);
});

test('M9.18 VFR loop-out remains possible but ordinary recovery prevents inverted driving at refined steps', () => {
  const highway = createM72DefaultBranchingParent();
  const flat = new HeightProfile(highway.guide.length, [{ s: 0, y: 0 }, { s: highway.guide.length, y: 0 }]);
  const wide = new SurfaceMap(highway.guide.length, [{ sStart: 0, name: 'M9.11 retained envelope',
    bands: [{ lMin: -1000, lMax: 1000, type: 'ASPHALT' }] }]);
  const rows = [];
  for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
    for (const kind of ['reversal', 'tsukuba']) {
      const live = kind === 'tsukuba' ? createM93TsukubaCourse2000Runtime().window : null;
      const g = live?.guide ?? highway.guide, h = live?.height ?? flat, s = live?.surface ?? wide;
      const v = createArcadeVehicle(profile, g, h, s, live ? 45 : 800, 0, live ? 15 : 25,
        live ? {} : { maxRoadWheelSteer: 50 * DEG, steeringOffsetMax: 20 * DEG,
          steeringActuatorResponse: { applyRate: 1 / 0.3, releaseRate: 1 / 0.3 } });
      const state = createM5RecoveryState(v);
      let oneWheelTime = 0;
      const events = [];
      for (let tick = 0; tick < Math.round(3 / dt); tick++) {
        const input = live ? sampleRivalDrivingInput(g, v, 0)
          : { steering: tick * dt < 1.5 ? 1 : -1, throttle: true, brake: false };
        updateArcadeVehicle(g, h, s, v, input, dt);
        assertFinite(v);
        if ((v.frontNormalLoad > 0) !== (v.rearNormalLoad > 0)) oneWheelTime += dt;
        const before = dot3(arcadeBodyKinematics(v).up,
          sampleSurfaceGeometryAtCoordinate(g, h, s, v.course).normal);
        const reason = updateM5Recovery(state, g, h, s, v, dt);
        if (reason !== null) {
          assert.equal(reason, 'overturned');
          assert.ok(before <= 0, 'no early anti-wheelie recovery');
          events.push((tick + 1) * dt);
        }
        assert.ok(dot3(arcadeBodyKinematics(v).up,
          sampleSurfaceGeometryAtCoordinate(g, h, s, v.course).normal) > 0);
      }
      assert.ok(oneWheelTime > 0.5, 'wheel lift was preserved, not suppressed');
      assert.equal(events.length, 1, 'no repeated recovery loop');
      assert.ok(events[0] > 2 && events[0] < 2.2);
      assert.ok(v.course.s > (live ? 100 : 800));
      rows.push({ kind, dt, oneWheelTime, events, finalPitchDegrees: v.pitch / DEG });
    }
  }
  console.log('M9.18 PERMITTED WHEEL LIFT', JSON.stringify(rows));
});
