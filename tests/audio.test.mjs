import assert from 'node:assert/strict';
import test from 'node:test';
import { observeVehicleTires } from '../dist/physics/vehicle-tire-observation.js';
import { combustionCoefficients } from '../dist/audio/combustion-pulse.js';
import { engineParameters } from '../dist/audio/periodic-engine-voice.js';
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

test('short crack pulses retain more high harmonics than body pulses for every vehicle', () => {
  const centroid = ({ real, imag }) => {
    let power = 0,
      weighted = 0;
    for (let i = 1; i < real.length; i++) {
      const p = real[i] ** 2 + imag[i] ** 2;
      power += p;
      weighted += i * p;
    }
    return weighted / power;
  };
  for (const { sound } of VEHICLE_CATALOG) {
    const body = centroid(combustionCoefficients(sound));
    const crack = centroid(combustionCoefficients(sound, sound.pulseWidth * 0.12));
    assert.ok(crack > body * 1.5);
    const closed = engineParameters({ ...observation(), throttle: 0, drive: 0 }, sound);
    const open = engineParameters({ ...observation(), throttle: 1, drive: 1 }, sound);
    assert.equal(closed.frequency, open.frequency);
    assert.ok(closed.body > 0 && closed.gain > 0);
    assert.ok(open.crack / open.body > (10 * closed.crack) / closed.body);
  }
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
    { crackHz: Infinity },
    { crackGain: -1 },
    { saturation: 9 },
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
  assert.ok(loaded.crack / loaded.body > first.crack / first.body);
  assert.ok(loaded.drive > first.drive);
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
