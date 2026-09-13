import assert from 'node:assert/strict';
import test from 'node:test';
import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { ACOUSTICS } from '../dist/audio/exhaust-acoustics.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { harmonicResidual, measureExhaust } from '../tools/exhaust-quality.mjs';

// Independent RK4 integration of the defining ODE, including the emitted area.
function integrate(state, riseRate, decayRate, duration) {
  let { p, r, area } = state;
  const h = duration / 2048;
  for (let i = 0; i < 2048; i++) {
    const p1 = -decayRate * p,
      r1 = riseRate * (p - r);
    const p2 = -decayRate * (p + (h * p1) / 2),
      r2 = riseRate * (p + (h * p1) / 2 - r - (h * r1) / 2);
    const p3 = -decayRate * (p + (h * p2) / 2),
      r3 = riseRate * (p + (h * p2) / 2 - r - (h * r2) / 2);
    const p4 = -decayRate * (p + h * p3),
      r4 = riseRate * (p + h * p3 - r - h * r3);
    area += h * (r + (h * (r1 + r2 + r3)) / 6);
    p += (h * (p1 + 2 * p2 + 2 * p3 + p4)) / 6;
    r += (h * (r1 + 2 * r2 + 2 * r3 + r4)) / 6;
  }
  return { p, r, area };
}

test('fractional and wrapped firings preserve continuous rise and the independently integrated pulse area', () => {
  for (const rate of [44100, 48000])
    for (const load of [0, 1])
      for (const offset of [0, 0.375])
        for (const before of [1 / 4096, 0.125, 0.5, 0.875, 1]) {
          const excitation = 0.22 + 0.78 * load;
          for (const [pulseRiseMs, pulseDecayMs] of [
            [0.01, 0.1],
            [0.2, 5],
            [2, 30],
            [0.2, 0.2 / excitation],
            [0.2, (0.2 / excitation) * (1 + 1e-8)],
          ]) {
            const sound = {
              cycleRevolutions: 2,
              firingPhases: [offset],
              exhaust: { banks: [0], lengths: [0.5], outlet: 1 },
            };
            const synth = new ExhaustWaveguide(sound, rate, { pulseVariation: 0, pulseRiseMs, pulseDecayMs });
            const rpm = (rate * 120) / 512;
            synth.rpm = rpm;
            synth.load = load;
            synth.phase = (offset - before / 512 + 1) % 1;
            synth.pulse[0] = 0.2;
            synth.rise[0] = 0.25;
            const a = excitation / ((pulseRiseMs * rate) / 1000),
              b = 1 / ((pulseDecayMs * rate) / 1000);
            let expected = integrate({ p: 0.2, r: 0.25, area: 0 }, a, b, before);
            expected.p = excitation;
            expected = integrate(expected, a, b, 1 - before);
            synth.sample(rpm, load);
            assert.ok(Math.abs(synth.pulse[0] - expected.p) < 1e-10);
            assert.ok(Math.abs(synth.rise[0] - expected.r) < 1e-10);
            assert.ok(Math.abs(synth.emission[0] - expected.area) < 1e-10);
          }
        }
});

test('source reflection closes with continuous value and slope while retaining endpoint impedances', () => {
  const sound = { cycleRevolutions: 2, firingPhases: [0], exhaust: { banks: [0], lengths: [0.5], outlet: 1 } };
  function reflection(position) {
    const synth = new ExhaustWaveguide(sound, 48000, { pulseVariation: 0 });
    synth.rpm = 0;
    synth.phase = position * ACOUSTICS.sourceWindowCycles;
    synth.wall[0] = 1;
    synth.backward[0].data.fill(1);
    synth.sample(0, 0);
    return synth.forward[0].data[0] / synth.forward[0].transmission;
  }
  for (const endpoint of [0, 1]) assert.ok(Math.abs(reflection(endpoint) - ACOUSTICS.sourceClosedReflection) < 1e-7);
  assert.ok(Math.abs(reflection(0.5) - ACOUSTICS.sourceOpenReflection) < 1e-7);
  const epsilon = 1e-3;
  // A half-sine has a finite endpoint slope; the new aperture's slope approaches zero.
  for (const [edge, inside] of [
    [0, epsilon],
    [1, 1 - epsilon],
  ])
    assert.ok(Math.abs(reflection(inside) - reflection(edge)) / epsilon < 0.025);
  for (let i = 0; i <= 100; i++) {
    const r = reflection(i / 100);
    assert.ok(r >= ACOUSTICS.sourceOpenReflection - 1e-7 && r <= ACOUSTICS.sourceClosedReflection + 1e-7);
  }
});

test('coherent spectrum separates a folded overtone from valid harmonics without window leakage', () => {
  const n = 4096,
    cycles = 31,
    rate = 48000;
  const pure = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * cycles * i) / n));
  assert.ok(harmonicResidual(pure, cycles, rate).db < -200);
  const folded = pure.map((x, i) => x + 0.1 * Math.sin((2 * Math.PI * cycles * 91 * i) / n));
  assert.ok(Math.abs(harmonicResidual(folded, cycles, rate).db - 10 * Math.log10(0.01 / 1.01)) < 1e-9);
});

test('native engine output suppresses inharmonic aliases at default and shortest pulse times', () => {
  for (const { profile, sound } of VEHICLE_CATALOG)
    for (const rate of [44100, 48000])
      for (const load of [0, 1])
        for (const sharp of [false, true]) {
          const result = measureExhaust(
            ExhaustWaveguide,
            sound,
            rate,
            profile.powertrain.redlineRpm,
            load,
            sharp ? { pulseRiseMs: 0.01, pulseDecayMs: 0.1 } : {},
          );
          assert.ok(result.output.rms > 0.001, 'suppressing the entire signal is not an aliasing fix');
          assert.ok(
            result.output.db < (sharp ? -35 : -66),
            `${profile.id} ${rate} Hz load ${load} sharp ${sharp}: ${result.output.db} dB`,
          );
        }
});
