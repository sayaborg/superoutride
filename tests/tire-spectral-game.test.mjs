import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { TireSpectralSynthesis } from '../dist/audio/tire-spectral-model.js';
import { TIRE_SOUND_INPUTS, TIRE_SOUND_INPUT_KEYS } from '../dist/audio/tire-sound-observation.js';
import { SPECTRAL_SETTINGS, SPECTRAL_TEXTURES } from '../dist/audio/tire-spectral-acoustics.js';
import { tireSoundParameters } from '../dist/audio/tire-sound-controls.js';
import { createVehicleAudioObservation, readVehicleAudio } from '../dist/browser/vehicle-audio.js';
import {
  observeVehicleTires,
  publishVehicleTireObservation,
  resetVehicleTireObservation,
} from '../dist/physics/vehicle-tire-observation.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createLinearHighwayRuntime } from '../dist/dev/courses/linear-highway.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { SPECTRAL_SCENARIOS, spectralScenarioAt } from '../tools/tire-spectral-scenarios.mjs';

const input = (values = {}) => ({
  longitudinalVelocity: 25,
  lateralVelocity: 4,
  wheelSpeed: 25,
  wheelAngularSpeed: (values.wheelSpeed ?? 25) / 0.3,
  load: 4000,
  longitudinalPower: 0,
  lateralPower: 12000,
  demand: 1.5,
  ...values,
});
const rms = (values) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
function taps(kernel, count) {
  const result = Array.from({ length: 4 }, () => new Float64Array(count));
  for (let i = 0; i < count; i++) {
    result[0][i] = kernel.sample();
    result[1][i] = kernel.roadOutput;
    result[2][i] = kernel.scrubOutput;
    result[3][i] = kernel.squealOutput;
  }
  return result;
}

// Captured from the approved isolated implementation at 32310e18, not generated from the new kernel.
// The user-requested dynamic Q supersedes its old PCM contract. Unchanged S stays pinned alone.
test('asphalt scrub replays retain their prior PCM independently of revised rolling and squeal', () => {
  const expected = {
    44100: '90ce8640df5c0e799174a31f74e6e473b04644155cd081f52ae05541721de283',
    48000: '817071543e8dd8a232759f31d0c3048189f32f5190758804ee83f7215ca91994',
  };
  for (const rate of [44100, 48000]) {
    const hash = createHash('sha256');
    for (const scene of SPECTRAL_SCENARIOS) {
      const kernel = new TireSpectralSynthesis(rate);
      const pcm = new Float32Array(Math.round(scene.seconds * rate));
      let frame = -1;
      for (let i = 0; i < pcm.length; i++) {
        const next = Math.floor((i * 60) / rate);
        if (next !== frame) {
          frame = next;
          kernel.update(spectralScenarioAt(scene, frame / 60));
        }
        kernel.sample();
        pcm[i] = kernel.scrubOutput;
      }
      hash.update(Buffer.from(pcm.buffer));
    }
    assert.equal(hash.digest('hex'), expected[rate]);
  }
});

test('rotation-driven R stops at locked/sideways translation and remains during supported stationary spin', () => {
  for (const [vx, vy, wheel] of [
    [25, 0, 25],
    [20, 0, 0],
    [0, 20, 0],
    [0, 0, 30],
  ]) {
    const kernel = new TireSpectralSynthesis(48000);
    kernel.update(
      input({
        longitudinalVelocity: vx,
        lateralVelocity: vy,
        wheelSpeed: wheel,
        longitudinalPower: 0,
        lateralPower: 0,
        demand: 0,
      }),
    );
    taps(kernel, 4800);
    const [, road, scrub, squeal] = taps(kernel, 4800);
    if (wheel === 0) assert.ok(road.every((v) => v === 0));
    else assert.ok(rms(road) > 0.001);
    assert.ok(scrub.every((v) => v === 0));
    assert.ok(squeal.every((v) => v === 0));
    if (wheel === 0) assert.equal(kernel.bands[7].squaredNorm, 0);
    if (wheel === 0) assert.equal(kernel.bands[6].squaredNorm, 0);
  }
  const rest = new TireSpectralSynthesis(48000);
  rest.update(
    input({ longitudinalVelocity: 0, lateralVelocity: 0, wheelSpeed: 0, longitudinalPower: 0, lateralPower: 0 }),
  );
  assert.ok(taps(rest, 4800)[0].every((v) => v === 0));
});

test('surface data changes texture continuously without resetting state or removing loose-ground sound', () => {
  for (const rate of [44100, 48000, 96000]) {
    const kernel = new TireSpectralSynthesis(rate);
    const states = [...kernel.bands],
      roadRandom = kernel.roadTexture;
    for (const index of [0, 4, 2, 1, 3, 0]) {
      kernel.update(input(), index);
      taps(kernel, Math.round(rate * 0.5));
      const values = taps(kernel, Math.round(rate * 0.2));
      assert.ok(rms(values[1]) > 0.0005);
      assert.ok(rms(values[2]) > 0.0005);
      assert.ok(values[0].every((v) => Number.isFinite(v) && Math.abs(v) < 1));
      if (SPECTRAL_TEXTURES[index].squeal === 0) assert.ok(rms(values[3]) < 1e-8);
      states.forEach((state, i) => assert.equal(state, kernel.bands[i]));
      assert.equal(kernel.roadTexture, roadRandom);
    }
    kernel.update(input({ load: 0 }), 4);
    assert.ok(rms(taps(kernel, Math.round(rate * 0.01))[0]) > 1e-6, 'retain the tail');
    taps(kernel, Math.round(rate * 0.25));
    assert.ok(rms(taps(kernel, 128)[0]) < 1e-10);
    for (const index of [-1, 0.5, NaN, Infinity, SPECTRAL_TEXTURES.length])
      assert.throws(() => kernel.update(input(), index), RangeError);
    kernel.update(input(), 0);
    assert.ok(rms(taps(kernel, 4800)[0]) > 0.01);
  }
});

test('signed acoustic telemetry uses accepted effective radius and wheel result, including reset/unsupported contacts', () => {
  const vehicle = {},
    observed = observeVehicleTires(vehicle);
  const contact = {
    forceTransmitting: true,
    tireFrameValid: true,
    longitudinalVelocity: -20,
    lateralVelocity: 7,
    effectiveRollingRadius: 0.27,
    surface: { surfaceType: 'ASPHALT' },
  };
  const wheel = { omega: -80, tire: { fx: -100, fy: -40, sx: -0.1, sy: -0.35, referenceSpeed: 20 } };
  publishVehicleTireObservation(vehicle, contact, wheel, { ...contact, tireFrameValid: false }, wheel);
  assert.equal(observed.front.longitudinalVelocity, -20);
  assert.equal(observed.front.lateralVelocity, 7);
  assert.equal(observed.front.wheelSpeed, -21.6);
  assert.equal(observed.front.wheelAngularSpeed, -80);
  assert.equal(observed.front.longitudinalPower, 200);
  for (const key of ['longitudinalVelocity', 'lateralVelocity', 'wheelSpeed', 'wheelAngularSpeed'])
    assert.equal(observed.rear[key], 0);
  resetVehicleTireObservation(vehicle);
  for (const tire of [observed.front, observed.rear]) {
    assert.equal(tire.surface, 'VOID');
    for (const key of ['longitudinalVelocity', 'lateralVelocity', 'wheelSpeed', 'wheelAngularSpeed'])
      assert.equal(tire[key], 0);
  }
  assert.deepEqual(vehicle, {}, 'observations never add authoritative state');
});

test('spectral mapping has its own SI transport and does not reuse representative CONTACT load/slip', () => {
  const tire = { ...input(), utilization: 3, surface: 'ASPHALT', referenceLoad: 4000 };
  const original = structuredClone(tire),
    mapped = tireSoundParameters(tire);
  assert.equal(mapped.load, 4000);
  assert.equal(mapped.wheelSpeed, 25);
  assert.equal(mapped.demand, 3);
  for (const [index, texture] of SPECTRAL_TEXTURES.entries()) {
    const value = tireSoundParameters({ ...tire, surface: texture.surface, wheelSpeed: -10000 });
    assert.equal(value.surfaceIndex, index);
    assert.equal(value.wheelSpeed, TIRE_SOUND_INPUTS.wheelSpeed.min);
  }
  for (const unsupported of [{ load: 0 }, { surface: 'VOID' }]) {
    const value = tireSoundParameters({ ...tire, ...unsupported });
    for (const key of TIRE_SOUND_INPUT_KEYS) assert.equal(value[key], 0);
  }
  for (const invalid of [
    { wheelSpeed: NaN },
    { longitudinalPower: -1 },
    { utilization: Infinity },
    { surface: 'UNKNOWN' },
  ])
    assert.throws(() => tireSoundParameters({ ...tire, ...invalid }), RangeError);
  assert.deepEqual(tire, original);
});

test('spectral observation and mapping leave complete nine-vehicle mechanics unchanged', () => {
  const runtime = createLinearHighwayRuntime();
  const world = { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap };
  for (const { profile } of VEHICLE_CATALOG) {
    const a = createArcadeVehicle(profile, world, { s: 45, initialSpeed: 25 });
    const b = createArcadeVehicle(profile, world, { s: 45, initialSpeed: 25 });
    const observation = createVehicleAudioObservation();
    readVehicleAudio(a, observation);
    for (let tick = 0; tick < 180; tick++) {
      const controls = { steering: Math.sin(tick * 0.03) * 0.4, throttle: tick < 90, brake: tick >= 90 };
      updateArcadeVehicle(world, a, controls, 1 / 120);
      updateArcadeVehicle(world, b, controls, 1 / 120);
      readVehicleAudio(a, observation);
      for (const axle of ['front', 'rear']) {
        const tire = observation[axle],
          mapped = tireSoundParameters(tire);
        assert.ok(Object.values(mapped).every(Number.isFinite));
        if (tire.surface !== 'VOID') {
          assert.ok(
            Math.abs(Math.hypot(tire.wheelSpeed - tire.longitudinalVelocity, tire.lateralVelocity) - tire.slipSpeed) <
              1e-10,
          );
          assert.ok(Math.abs(Math.hypot(tire.longitudinalVelocity, tire.lateralVelocity) - tire.travelSpeed) < 1e-10);
          assert.equal(tire.wheelAngularSpeed, a[`${axle}WheelOmega`]);
        }
      }
      assert.deepEqual(a, b);
    }
  }
});

test('independent full spectral axles stay finite with fixed gains across domains and rapid terrain changes', () => {
  for (const rate of [44100, 48000, 192000]) {
    const front = new TireSpectralSynthesis(rate),
      rear = new TireSpectralSynthesis(rate, SPECTRAL_SETTINGS.rearSeed);
    for (const index of [0, 4, 1, 2, 3, 0]) {
      const value = input({
        longitudinalVelocity: 100,
        lateralVelocity: -100,
        wheelSpeed: -200,
        load: 30000,
        longitudinalPower: 1000000,
        lateralPower: 1000000,
        demand: 50,
      });
      front.update(value, index);
      rear.update(value, (index + 1) % SPECTRAL_TEXTURES.length);
      for (let i = 0; i < rate / 3; i++) {
        const mixed = front.sample() + rear.sample();
        assert.ok(Number.isFinite(mixed) && Math.abs(mixed) < 1, 'unclipped fixed-gain axle mix');
      }
    }
    assert.notEqual(front.bands[0], rear.bands[0]);
  }
});
