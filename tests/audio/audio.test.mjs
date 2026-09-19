import assert from 'node:assert/strict';
import test from 'node:test';
import { observeVehicleTires } from '../../dist/physics/vehicle-tire-observation.js';
import { tireParameters } from '../../dist/audio/tire-synthesis.js';
import { compileVehicleAudioProfile } from '../../dist/audio/vehicle-audio-profile.js';
import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import {
  createVehicleAudioObservation,
  readVehicleAudio,
  nearestAudibleRival,
} from '../../dist/browser/vehicle-audio.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { createStraightReferenceWorld } from '../../dist/dev/fixtures/straight-world.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../../dist/gameplay/recovery.js';

const base = VEHICLE_CATALOG[0];
const observation = () => ({ ...createVehicleAudioObservation(), rpm: 3000, drive: 0.5 });

test('acoustic authoring copies and freezes firing and pipe data', () => {
  const input = structuredClone(base.sound);
  const compiled = compileVehicleAudioProfile(input);
  input.firingPhases[1] = 0;
  input.exhaust.lengths[0] = 2;
  assert.deepEqual(compiled, base.sound);
  assert.ok(Object.isFrozen(compiled.exhaust));
  for (const change of [
    { cycleRevolutions: 3 },
    { firingPhases: [] },
    { firingPhases: [0, 0] },
    { firingPhases: [NaN] },
    { firingPhases: [1] },
    { exhaust: undefined },
  ])
    assert.throws(() => compileVehicleAudioProfile({ ...base.sound, ...change }), RangeError);
});

test('tire rolling, slip and support produce distinct acoustic responses', () => {
  const state = observation();
  state.front = {
    load: 4000,
    slipSpeed: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    utilization: 0.2,
    surface: 'ASPHALT',
  };
  const rolling = tireParameters(state.front);
  assert.equal(rolling.squeal, 0);
  state.front.slipSpeed = 10;
  state.front.longitudinalPower = 20000;
  state.front.utilization = 1.1;
  const skid = tireParameters(state.front);
  assert.ok(skid.squeal > 0);
  state.front.surface = 'DIRT';
  const dirt = tireParameters(state.front);
  assert.ok(dirt.squeal < skid.squeal);
  state.front.load = 0;
  const airborne = tireParameters(state.front);
  assert.equal(airborne.squeal, 0);
  state.front.load = 4000;
  state.front.slipSpeed = 0;
  const stopped = tireParameters(state.front);
  assert.equal(stopped.squeal, 0);
});

test('completed wheel slip observations drive sound and recovery clears stale tire sound', () => {
  const runtime = createStraightReferenceWorld();
  const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
  const vehicle = createArcadeVehicle(base.profile, world, { s: 45, initialSpeed: 25 });
  const tires = observeVehicleTires(vehicle);
  const keys = Object.keys(vehicle.control);
  vehicle.frontWheelOmega = 0;
  vehicle.rearWheelOmega = 0;
  updateArcadeVehicle(world, vehicle, { steering: 0, throttle: false, brake: true }, 1 / 60);
  const before = structuredClone(vehicle.control),
    state = createVehicleAudioObservation();
  readVehicleAudio(vehicle, state);
  assert.equal(observeVehicleTires(vehicle), tires);
  assert.deepEqual(Object.keys(vehicle.control), keys);
  assert.ok(state.front.slipSpeed > 1);
  assert.ok(state.front.longitudinalPower > 0);
  assert.equal(state.front.lateralPower, 0);
  assert.ok(tireParameters(state.front).squeal > 0);
  assert.deepEqual(vehicle.control, before);
  recoverVehicleToGuideCoordinate(world, vehicle, {
    state: createRecoveryState(vehicle),
    target: { s: 45, l: 0 },
    reason: 'manual',
  });
  readVehicleAudio(vehicle, state);
  assert.equal(tireParameters(state.front).squeal, 0);
  assert.equal(state.front.surface, 'VOID');
  assert.equal(tires.front.slipSpeed, 0);
  assert.equal(tires.front.longitudinalPower + tires.front.lateralPower, 0);
});

test('rival selection uses 3D world distance, bounds range, ignores local chainage and self', () => {
  const player = { x: 0, y: 0, z: 0 };
  const far = { x: 20, y: 0, z: 0, course: { s: 0 } };
  const near = { x: -5, y: 0, z: 0, course: { s: 10000 } };
  assert.equal(nearestAudibleRival(player, [{ vehicle: player }, { vehicle: far }, { vehicle: near }]), near);
  assert.equal(nearestAudibleRival(player, [{ vehicle: { x: 0, y: 101, z: 0 } }]), null);
  assert.equal(nearestAudibleRival(player, []), null);
});

test('subscribing tire presentation preserves the complete physical snapshot across all nine vehicles', () => {
  const runtime = createStraightReferenceWorld();
  const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
  for (const { profile } of VEHICLE_CATALOG) {
    const observed = createArcadeVehicle(profile, world, { s: 45, initialSpeed: 20 });
    const silent = createArcadeVehicle(profile, world, { s: 45, initialSpeed: 20 });
    observeVehicleTires(observed);
    for (let tick = 0; tick < 20; tick++) {
      const input = { steering: 0.3, throttle: tick < 10, brake: tick >= 10 };
      updateArcadeVehicle(world, observed, input, 1 / 60);
      updateArcadeVehicle(world, silent, input, 1 / 60);
      assert.deepEqual(observed, silent);
    }
  }
});
