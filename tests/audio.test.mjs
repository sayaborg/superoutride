import assert from 'node:assert/strict';
import test from 'node:test';
import { observeVehicleTires } from '../dist/physics/vehicle-tire-observation.js';
import { tireParameters } from '../dist/audio/tire-voice.js';
import { compileVehicleAudioProfile } from '../dist/audio/vehicle-audio-profile.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createVehicleAudioObservation, readVehicleAudio, nearestAudibleRival } from '../dist/browser/vehicle-audio.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../dist/gameplay/recovery.js';

const base = VEHICLE_CATALOG[0];
const observation = () => ({ ...createVehicleAudioObservation(), rpm: 3000, throttle: 0.5, drive: 0.5 });

test('acoustic authoring copies and freezes firing, pipe and pulse data', () => {
  const input = structuredClone(base.sound);
  const compiled = compileVehicleAudioProfile(input);
  input.firingPhases[1] = 0;
  input.pulse.strength = 3;
  input.exhaust.lengths[0] = 2;
  assert.deepEqual(compiled, base.sound);
  assert.ok(Object.isFrozen(compiled.pulse));
  for (const change of [
    { cycleRevolutions: 3 },
    { firingPhases: [] },
    { firingPhases: [0, 0] },
    { firingPhases: [NaN] },
    { firingPhases: [1] },
    { exhaust: undefined },
    { pulse: undefined },
    ...[
      { strength: NaN },
      { strength: 0 },
      { strength: Infinity },
      { riseSeconds: 0 },
      { riseSeconds: 0.01 },
      { decaySeconds: Infinity },
      { decaySeconds: -1 },
    ].map((pulse) => ({ pulse: { ...base.sound.pulse, ...pulse } })),
  ])
    assert.throws(() => compileVehicleAudioProfile({ ...base.sound, ...change }), RangeError);
});

test('tire rolling, slip and support produce distinct acoustic responses', () => {
  const state = observation();
  state.front = { load: 4000, rollingSpeed: 25, slipSpeed: 0, utilization: 0.2, surface: 'ASPHALT' };
  const rolling = tireParameters(state);
  assert.ok(rolling.rolling > 0);
  assert.equal(rolling.squeal, 0);
  state.front.slipSpeed = 10;
  state.front.utilization = 1.1;
  const skid = tireParameters(state);
  assert.ok(skid.squeal > 0 && skid.friction > 0);
  state.front.surface = 'DIRT';
  const dirt = tireParameters(state);
  assert.ok(dirt.squeal < skid.squeal && dirt.rolling > skid.rolling);
  state.front.load = 0;
  const airborne = tireParameters(state);
  assert.equal(airborne.rolling + airborne.squeal + airborne.friction, 0);
  state.front.load = 4000;
  state.front.slipSpeed = 0;
  state.front.rollingSpeed = 0;
  const stopped = tireParameters(state);
  assert.equal(stopped.rolling + stopped.squeal + stopped.friction, 0);
});

test('completed wheel slip observations drive sound and recovery clears stale tire sound', () => {
  const runtime = createLinearHighwayRuntime();
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
  assert.ok(tireParameters(state).squeal > 0);
  assert.deepEqual(vehicle.control, before);
  recoverVehicleToGuideCoordinate(world, vehicle, {
    state: createRecoveryState(vehicle),
    target: { s: 45, l: 0 },
    reason: 'manual',
  });
  readVehicleAudio(vehicle, state);
  assert.equal(tireParameters(state).squeal, 0);
  assert.equal(state.front.surface, 'VOID');
  assert.equal(tires.front.slipSpeed, 0);
});

test('rival selection uses 3D world distance, bounds range, ignores local chainage and self', () => {
  const player = { x: 0, y: 0, z: 0 };
  const far = { x: 20, y: 0, z: 0, course: { s: 0 } };
  const near = { x: -5, y: 0, z: 0, course: { s: 10000 } };
  assert.equal(nearestAudibleRival(player, [{ vehicle: player }, { vehicle: far }, { vehicle: near }]), near);
  assert.equal(nearestAudibleRival(player, [{ vehicle: { x: 0, y: 101, z: 0 } }]), null);
  assert.equal(nearestAudibleRival(player, []), null);
});

test('noise worklet generates continuous independent streams at arbitrary block lengths and stops', async () => {
  const originalBase = globalThis.AudioWorkletProcessor,
    originalRegister = globalThis.registerProcessor;
  let Processor;
  globalThis.AudioWorkletProcessor = class {
    port = {};
  };
  globalThis.registerProcessor = (_, value) => {
    Processor = value;
  };
  try {
    await import('../dist/audio/noise-processor.js');
    const noise = new Processor();
    const a = Array.from({ length: 3 }, () => [new Float32Array(128)]);
    const b = Array.from({ length: 3 }, () => [new Float32Array(256)]);
    assert.equal(noise.process([], a), true);
    assert.equal(noise.process([], b), true);
    assert.notDeepEqual(a[0], a[1]);
    assert.notDeepEqual(a[0][0], b[0][0].slice(0, 128));
    assert.ok(b.flatMap(([channel]) => [...channel]).every((x) => Number.isFinite(x) && Math.abs(x) <= 1));
    noise.port.onmessage();
    assert.equal(noise.process([], b), false);
  } finally {
    if (originalBase === undefined) delete globalThis.AudioWorkletProcessor;
    else globalThis.AudioWorkletProcessor = originalBase;
    if (originalRegister === undefined) delete globalThis.registerProcessor;
    else globalThis.registerProcessor = originalRegister;
  }
});

test('subscribing tire presentation preserves the complete physical snapshot across all nine vehicles', () => {
  const runtime = createLinearHighwayRuntime();
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
