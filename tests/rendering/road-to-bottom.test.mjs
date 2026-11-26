import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTerrainLines } from '../../src/view/terrain-line.js';
import { RENDER_FAR_DEPTH_METERS, RENDER_NEAR_DEPTH_METERS } from '../../src/view/camera.js';

// A straight road along +z rising at `grade` from station 0, its drawn height a two-vertex line.
const road = (grade) => ({
  plan: Object.freeze({
    coordinates: Object.freeze({
      toWorld(s, l, out = {}) {
        return Object.assign(out, { x: l, z: s, s, l, heading: 0, segmentIndex: 0 });
      },
      forwardEnd: (start, end) => end,
    }),
  }),
  height: Object.freeze({
    vertices: Object.freeze([
      Object.freeze({ s: -1000, y: -1000 * grade }),
      Object.freeze({ s: 1000, y: 1000 * grade }),
    ]),
    sample(s, out = { y: 0, grade: 0 }) {
      return Object.assign(out, { y: s * grade, grade });
    },
  }),
});
const SCREEN = 240;

/** The terrain rows a level camera `height` over the road at station 0 draws: their lowest row and nearest depth. */
function rows(grade, height) {
  const { plan, height: profile } = road(grade);
  const camera = { x: 0, y: height, z: 0, yaw: 0, pitch: 0, s: 0, focalLength: 240, centerX: 160, centerY: 120 };
  const { lines } = generateTerrainLines(plan, camera, {
    extent: { start: -1000, end: 1000 },
    screenHeight: SCREEN,
    dMin: RENDER_NEAR_DEPTH_METERS,
    dMax: RENDER_FAR_DEPTH_METERS,
    height: profile,
  });
  return { bottom: Math.max(...lines.map((line) => line.y)), nearest: Math.min(...lines.map((line) => line.d)) };
}

test('while the camera stands above the road, the road reaches the frame’s bottom edge (K, 2026-11-27)', () => {
  // Low over a level road, and looking up a slope, the road nearer than the near depth fills the rows below it.
  for (const [grade, height] of [
    [0, 1],
    [0, 0.5],
    [0.2, 1.5],
    [0.5, 2],
  ]) {
    const { bottom, nearest } = rows(grade, height);
    assert.equal(bottom, SCREEN - 1, `grade ${grade}, ${height} m`);
    assert.ok(nearest < RENDER_NEAR_DEPTH_METERS, `grade ${grade}, ${height} m`);
  }
  // A camera whose road reaches the bottom edge by the near depth begins there, as before.
  for (const [grade, height] of [
    [0, 2],
    [0, 1.5],
    [-0.2, 1.5],
  ]) {
    const { bottom, nearest } = rows(grade, height);
    assert.equal(bottom, SCREEN - 1);
    assert.ok(nearest >= RENDER_NEAR_DEPTH_METERS - 1e-9, `grade ${grade}, ${height} m: ${nearest}`);
  }
});
