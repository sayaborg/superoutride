import assert from 'node:assert/strict';
import test from 'node:test';
import { combustionCoefficients } from '../dist/audio/combustion-pulse.js';
import { engineParameters } from '../dist/audio/engine-voice.js';
import { tireParameters } from '../dist/audio/tire-voice.js';
import { compileVehicleAudioProfile } from '../dist/audio/vehicle-audio-profile.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createVehicleAudioObservation, readVehicleAudio, nearestAudibleRival } from '../dist/browser/vehicle-audio.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { createRecoveryState, recoverVehicleToGuideCoordinate } from '../dist/gameplay/recovery.js';

const base = VEHICLE_CATALOG[0];
const observation = () => ({ ...createVehicleAudioObservation(), rpm: 3000, throttle: 0.5, drive: 0.5 });

test('authored pulse trains are finite, DC-free, bounded and preserve firing periodicity', () => {
  const spectra = [];
  for (const { sound } of VEHICLE_CATALOG) {
    const { real, imag } = combustionCoefficients(sound);
    assert.equal(real[0], 0);
    assert.equal(imag[0], 0);
    assert.ok([...real, ...imag].every(Number.isFinite));
    const bound = real.reduce((sum, re, i) => sum + Math.hypot(re, imag[i]), 0);
    assert.ok(bound <= 1.000001 && bound > 0.99);
    spectra.push(JSON.stringify([...real, ...imag]));
  }
  assert.equal(new Set(spectra).size, 9);
  const { real, imag } = combustionCoefficients(base.sound);
  for (let i = 1; i < 12; i++) assert.ok(Math.hypot(real[i], imag[i]) < 1e-6);
  assert.ok(Math.hypot(real[12], imag[12]) > 0.1);
});

test('acoustic authoring rejects invalid parameters and copies phase arrays', () => {
  const phases = [0, 0.5];
  const profile = compileVehicleAudioProfile({ ...base.sound, firingPhases: phases });
  phases[1] = 0;
  assert.deepEqual(profile.firingPhases, [0, 0.5]);
  for (const changes of [
    { cycleRevolutions: 0 },
    { pulseWidth: NaN },
    { resonanceHz: Infinity },
    { resonanceQ: 9 },
    { gain: 2 },
    { firingPhases: [] },
    { firingPhases: [0, 0] },
    { firingPhases: [1] },
  ]) {
    assert.throws(() => compileVehicleAudioProfile({ ...base.sound, ...changes }), RangeError);
  }
});

test('RPM and load control pitch and timbre independently without changing observations', () => {
  const state = observation(),
    before = structuredClone(state);
  const first = engineParameters(state, base.sound);
  const faster = engineParameters({ ...state, rpm: state.rpm * 2 }, base.sound);
  assert.equal(faster.frequency, first.frequency * 2);
  const loaded = engineParameters({ ...state, throttle: 1, drive: 1 }, base.sound);
  assert.equal(loaded.frequency, first.frequency);
  assert.ok(loaded.gain > first.gain && loaded.cutoff > first.cutoff);
  assert.ok(engineParameters({ ...state, rpm: 0 }, base.sound).frequency > 0);
  assert.deepEqual(state, before);
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
  vehicle.frontWheelOmega = 0;
  vehicle.rearWheelOmega = 0;
  updateArcadeVehicle(world, vehicle, { steering: 0, throttle: false, brake: true }, 1 / 60);
  const before = structuredClone(vehicle.control),
    state = createVehicleAudioObservation();
  readVehicleAudio(vehicle, state);
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
