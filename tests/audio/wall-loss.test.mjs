import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { wallLossNepers, wallLossPoles, wallLossSections, wallLossWeights } from '../../src/audio/exhaust-acoustics.js';

const sounds = await loadEngineSounds(await readDeliveredContent());
const tubes = Object.entries(sounds).flatMap(([id, { exhaust }]) =>
  [...exhaust.primaries, ...exhaust.pipes].map(({ length, diameter }, index) => ({ id, index, length, diameter })),
);

/** `1/(1 + a w)` and `b0 + b1 w` at `w = e^{-j omega}`, as [re, im]. */
const multiply = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const divide = ([a, b], [c, d]) => {
  const norm = c * c + d * d;
  return [(a * c + b * d) / norm, (b * c - a * d) / norm];
};

function responses(length, diameter, rate, hz) {
  const omega = (2 * Math.PI * hz) / rate;
  const w = [Math.cos(omega), -Math.sin(omega)];
  const poles = wallLossPoles(rate);
  const weights = wallLossWeights(length, diameter, rate);
  const sections = wallLossSections(length, diameter, rate);
  let parallel = [weights[0], 0];
  let series = [1, 0];
  for (let k = 0; k < poles.length; k++) {
    const denominator = [1 + poles[k] * w[0], poles[k] * w[1]];
    const term = divide([weights[k + 1], 0], denominator);
    parallel = [parallel[0] + term[0], parallel[1] + term[1]];
    const numerator = [sections[3 * k] + sections[3 * k + 1] * w[0], sections[3 * k + 1] * w[1]];
    assert.equal(sections[3 * k + 2], poles[k]);
    series = multiply(series, divide(numerator, denominator));
  }
  return { parallel, series };
}

for (const rate of [44100, 48000])
  test(`every catalog tube's wall loss follows Kirchhoff from 50 Hz to 8 kHz at ${rate} Hz`, () => {
    for (const { id, index, length, diameter } of tubes) {
      const at = `${id} tube ${index}`;
      const dc = responses(length, diameter, rate, 0).parallel;
      assert.ok(Math.abs(dc[0] - 1) <= 1e-12 && Math.abs(dc[1]) <= 1e-12, `${at}: DC gain ${dc}`);
      for (let n = 0; n <= 120; n++) {
        const hz = 50 * (8000 / 50) ** (n / 120);
        const { parallel } = responses(length, diameter, rate, hz);
        const ratio = -Math.log(Math.hypot(...parallel)) / wallLossNepers(length, diameter, hz);
        assert.ok(ratio >= 0.89 && ratio <= 1.1, `${at}: loss/Kirchhoff ${ratio} at ${hz.toFixed(0)} Hz`);
      }
      for (let n = 0; n <= 200; n++) {
        const { parallel, series } = responses(length, diameter, rate, ((rate / 2) * n) / 200);
        const difference = Math.hypot(parallel[0] - series[0], parallel[1] - series[1]);
        assert.ok(difference <= 1e-12, `${at}: parallel and series differ by ${difference}`);
      }
    }
  });
