import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import { sampleGuidePath } from '../dist/core/guide-curve.js';
import { compileCircuitTopology } from '../dist/gameplay/circuit-topology.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { computeForwardVisibleInterval, generateTerrainLines } from '../dist/road/terrain-line.js';
import {
  circuitUnwrappedToWindowChainage,
  circuitWindowToLapSourceChainage,
  circuitWindowToUnwrappedChainage,
  compileCircuitRuntimeWindow,
} from '../dist/runtime/circuit-runtime-window.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { VisualProfile } from '../dist/visual/visual-profile.js';

function createGentleCircuit(segmentCount = 72, radius = 120) {
  const vertices = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    vertices.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }
  vertices.push({ ...vertices[0] });
  return compileCircuitTopology('M6_49_DEV_CIRCUIT', compileRasterPath(vertices));
}

function createSources(topology, ground = undefined) {
  const L = topology.lapLength;
  return {
    height: new HeightProfile(L, [
      { s: 0, y: 0 },
      { s: L * 0.5, y: 4 },
      { s: L, y: 0 },
    ]),
    visual: new VisualProfile(L, [
      {
        sStart: 0,
        name: 'START_GREEN',
        groundBaseLeft: { kind: 'color', color: 0x111111ff },
        groundBaseRight: { kind: 'color', color: 0x111111ff },
      },
      {
        sStart: L * 0.5,
        name: 'BACK_ROCK',
        groundBaseLeft: { kind: 'color', color: 0x222222ff },
        groundBaseRight: { kind: 'color', color: 0x222222ff },
      },
    ]),
    surface: new SurfaceMap(L, [
      {
        sStart: 0,
        name: 'START_ASPHALT',
        bands: [{ lMin: -5, lMax: 5, type: 'ASPHALT' }],
      },
      {
        sStart: L * 0.5,
        name: 'BACK_GRASS',
        bands: [{ lMin: -5, lMax: 5, type: 'GRASS' }],
      },
    ]),
    ground,
  };
}

function compileWindow({ startWinding = -1, repeatCount = 3, ground } = {}) {
  const topology = createGentleCircuit();
  const window = compileCircuitRuntimeWindow(
    topology,
    startWinding,
    repeatCount,
    { lMax: 4.5, mMin: 0.72, dCam: 5 },
    createSources(topology, ground),
  );
  return { topology, window };
}

test('M6.49 finite circuit window is an ordinary open Raster/Guide path across internal seams', () => {
  const { topology, window } = compileWindow();
  const L = topology.lapLength;

  assert.equal(window.raster.segments.length, topology.lapPath.segments.length * 3);
  assert.ok(Math.abs(window.raster.length - 3 * L) < 1e-8);
  assert.ok(Math.abs(window.guide.length - 3 * L) < 1e-8);
  assert.equal(window.startUnwrappedS, -L);
  assert.equal(window.endUnwrappedS, 2 * L);

  const sCamera = L - 10;
  const cameraSample = sampleGuidePath(window.guide, sCamera);
  const visible = computeForwardVisibleInterval(window.guide, cameraSample.heading, sCamera, 2.5, 30);
  assert.ok(visible);
  assert.ok(Math.abs(visible.dEnd - 30) < 1e-8, 'internal circuit seam must not clip renderer visibility');
});

test('M6.49 window/unwrapped conversion is exact and bounded without giving renderer modulo authority', () => {
  const { topology, window } = compileWindow({ startWinding: -2, repeatCount: 4 });
  const L = topology.lapLength;

  assert.equal(circuitUnwrappedToWindowChainage(window, -2 * L), 0);
  assert.ok(Math.abs(circuitUnwrappedToWindowChainage(window, 0) - 2 * L) < 1e-8);
  assert.ok(Math.abs(circuitWindowToUnwrappedChainage(window, 3 * L) - L) < 1e-8);
  assert.throws(() => circuitUnwrappedToWindowChainage(window, -2 * L - 1), /outside \[0, length\]/);
  assert.throws(() => circuitWindowToUnwrappedChainage(window, 4 * L + 1), /outside \[0, length\]/);
});

test('M6.49 source-chainage ownership is explicit: interior seam -> 0, final open endpoint -> L', () => {
  const { topology, window } = compileWindow({ repeatCount: 3 });
  const L = topology.lapLength;

  assert.equal(circuitWindowToLapSourceChainage(window, 0), 0);
  assert.equal(circuitWindowToLapSourceChainage(window, L), 0);
  assert.ok(Math.abs(circuitWindowToLapSourceChainage(window, L + 7) - 7) < 1e-8);
  assert.equal(circuitWindowToLapSourceChainage(window, 3 * L), L);
});

test('M6.49 height and visual readers expose one finite open window and repeat source semantics only at topology seams', () => {
  const { topology, window } = compileWindow({ repeatCount: 3 });
  const L = topology.lapLength;

  assert.equal(window.height.courseLength, 3 * L);
  assert.equal(window.visual.courseLength, 3 * L);
  assert.equal(window.height.samplePhysics(L), 0);
  assert.ok(Math.abs(window.height.samplePhysics(1.5 * L) - 4) < 1e-8);
  assert.equal(window.visual.sample(L).name, 'START_GREEN');
  assert.equal(window.visual.sample(1.75 * L).name, 'BACK_ROCK');
  assert.equal(window.visual.sample(3 * L).name, 'BACK_ROCK');
  assert.throws(() => window.height.sampleRender(3 * L + 0.01), /outside \[0, length\]/);
  assert.throws(() => window.visual.sample(-0.01), /outside \[0, length\]/);
});

test('M6.49 circuit height source must physically return to the same seam height', () => {
  const topology = createGentleCircuit();
  const L = topology.lapLength;
  const sources = createSources(topology);
  const badHeight = new HeightProfile(L, [
    { s: 0, y: 0 },
    { s: L * 0.5, y: 2 },
    { s: L, y: 1 },
  ]);

  assert.throws(
    () => compileCircuitRuntimeWindow(
      topology,
      0,
      2,
      { lMax: 4.5, mMin: 0.72, dCam: 5 },
      { ...sources, height: badHeight },
    ),
    /must return to the same world height/,
  );
});

test('M6.49 SurfaceMap window resets at internal seam while preserving the final open endpoint', () => {
  const { topology, window } = compileWindow({ repeatCount: 2 });
  const L = topology.lapLength;

  assert.equal(window.surface.sample(L - 1, 0).sectionName, 'BACK_GRASS');
  assert.equal(window.surface.sample(L, 0).sectionName, 'START_ASPHALT');
  assert.equal(window.surface.sample(2 * L, 0).sectionName, 'BACK_GRASS');
  assert.throws(() => window.surface.sample(2 * L + 1, 0), /outside \[0, length\]/);
});

test('M6.49 GroundMap runtime window delegates LOD unchanged and owns only explicit circuit source addressing', () => {
  const calls = [];
  const ground = {
    kMax: 6,
    selectLevel(deltaSEffective) {
      return deltaSEffective >= 8 ? 3 : 1;
    },
    sample(s, l, deltaSEffective) {
      calls.push(['sample', s, l, deltaSEffective]);
      return { color: Math.round(s), level: this.selectLevel(deltaSEffective) };
    },
    sampleAtLevel(s, l, levelIndex) {
      calls.push(['level', s, l, levelIndex]);
      return Math.round(s * 10 + levelIndex);
    },
  };
  const { topology, window } = compileWindow({ repeatCount: 2, ground });
  const L = topology.lapLength;

  assert.equal(window.ground.kMax, 6);
  assert.equal(window.ground.selectLevel(9), 3);
  window.ground.sampleAtLevel(L, 2, 4);
  window.ground.sampleAtLevel(2 * L, 2, 4);
  assert.deepEqual(calls[0], ['level', 0, 2, 4]);
  assert.ok(Math.abs(calls[1][1] - L) < 1e-8);
});

test('M6.49 ordinary TerrainLine generation crosses a circuit seam with open window readers', () => {
  const { topology, window } = compileWindow({ repeatCount: 3 });
  const L = topology.lapLength;
  const sCamera = L - 20;
  const center = sampleGuidePath(window.guide, sCamera);
  const camera = {
    x: center.x,
    y: 1.35,
    z: center.z,
    yaw: center.heading,
    pitch: 0.05,
    s: sCamera,
    focalLength: 200,
    centerX: 160,
    centerY: 120,
  };

  const lines = generateTerrainLines(window.guide, camera, {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 45,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    height: window.height,
    visual: window.visual,
  });

  assert.ok(lines.length > 0);
  assert.ok(lines.some((line) => line.s > L), 'terrain must continue beyond the former one-lap endpoint');
});

test('M6.49 circuit runtime integration stays outside renderer and RouteDag while renderer stays topology-blind', async () => {
  const runtimeSource = await readFile(new URL('../src/runtime/circuit-runtime-window.ts', import.meta.url), 'utf8');
  const rendererSource = await readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(runtimeSource, /render\//);
  assert.doesNotMatch(runtimeSource, /route-dag/);
  assert.doesNotMatch(runtimeSource, /pseudoDepth/);
  assert.doesNotMatch(rendererSource, /circuit-topology|CircuitTopology|CIRCUIT/);
});
