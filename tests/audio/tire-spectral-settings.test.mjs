import assert from 'node:assert/strict';
import test from 'node:test';
import { SPECTRAL_SETTINGS } from '../../dist/audio/tire-spectral-acoustics.js';
import { SPECTRAL_BAND_DOMAIN } from '../../dist/audio/spectral-noise.js';
import { TIRE_SOUND_INPUTS } from '../../dist/audio/tire-sound-observation.js';
import { SPECTRAL_RESPONSE_SCENARIOS } from '../../tools/audio/tire-spectral-scenarios.mjs';

// Named settings must keep the fixed-band architecture inside its independently defined domain.
test('authored spectral bands are immutable and fit the declared numerical domain', () => {
  const s = SPECTRAL_SETTINGS,
    d = SPECTRAL_BAND_DOMAIN;
  assert.ok(Object.isFrozen(s) && Object.isFrozen(d) && Object.isFrozen(s.scrubBands));
  assert.equal(s.scrubBands.length, 2);
  assert.equal(s.harmonicWeights.length, 4);
  const ceiling = d.maximumFrequencyRateFraction * s.minRate;
  for (const band of s.scrubBands) {
    assert.ok(Object.isFrozen(band));
    assert.ok(band.baseHz > 0 && band.slipHz >= 0 && band.slipHalfSpeed > 0);
    assert.ok(band.baseHz + band.slipHz < ceiling);
    assert.ok(band.bandwidthHz >= d.minimumBandwidthHz && band.bandwidthHz <= d.maximumBandwidthHz);
  }
  assert.ok(s.squealBaseBandwidthHz >= d.minimumBandwidthHz);
  const widestQ = 4 * (s.squealBaseBandwidthHz + s.squealSlipBandwidthHz + s.squealWheelBandwidthHz);
  assert.ok(widestQ <= d.maximumBandwidthHz);
  assert.ok(4 * (s.squealBaseHz + s.squealSlipHz + s.squealLongitudinalHz) * (1 + s.wanderDepth) < ceiling);
  for (const order of [s.roadLowOrder, s.roadHighOrder]) {
    const frequency = Math.max(s.roadMinimumHz, (order * TIRE_SOUND_INPUTS.wheelAngularSpeed.max) / (2 * Math.PI));
    assert.ok(frequency > 0 && frequency < ceiling);
    assert.ok(Math.max(d.minimumBandwidthHz, frequency * s.roadBandwidthRatio) <= d.maximumBandwidthHz);
  }
});

test('shared R/S/Q response scenarios retain complete SI inputs and their explicit audition radius', () => {
  assert.deepEqual(
    SPECTRAL_RESPONSE_SCENARIOS.map((s) => s.id),
    ['rolling-rpm-sweep', 'grip-recovery'],
  );
  for (const scene of SPECTRAL_RESPONSE_SCENARIOS) {
    for (let frame = 0; frame <= scene.seconds * 60; frame++) {
      const value = scene.observe(frame / 60);
      assert.deepEqual(Object.keys(value).sort(), Object.keys(TIRE_SOUND_INPUTS).sort());
      for (const [key, range] of Object.entries(TIRE_SOUND_INPUTS))
        assert.ok(Number.isFinite(value[key]) && value[key] >= range.min && value[key] <= range.max, key);
      assert.equal(value.wheelAngularSpeed, value.wheelSpeed / 0.3);
    }
  }
  const rolling = SPECTRAL_RESPONSE_SCENARIOS[0];
  assert.equal(rolling.observe(0).wheelSpeed, 0);
  assert.equal(rolling.observe(5).wheelSpeed, 60);
  assert.equal(rolling.observe(10).wheelSpeed, 0);
});
