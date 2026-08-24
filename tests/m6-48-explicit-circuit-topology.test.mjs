import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compileRasterPath } from '../dist/core/course.js';
import {
  compileCircuitTopology,
  decomposeCircuitChainage,
  liftCircuitLocalChainageNear,
  unfoldCircuitRasterPath,
  wrapCircuitChainage,
} from '../dist/gameplay/circuit-topology.js';

function createGentleClosedLap(segmentCount = 72, radius = 120) {
  const vertices = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    vertices.push({
      x: radius * Math.cos(angle),
      z: radius * Math.sin(angle),
    });
  }
  vertices.push({ ...vertices[0] });
  return compileRasterPath(vertices);
}

test('M6.48 circuit topology identifies only an explicitly duplicated open-lap endpoint seam', () => {
  const lap = createGentleClosedLap();
  const topology = compileCircuitTopology('DEV_CIRCUIT', lap);

  assert.equal(topology.lapPath, lap);
  assert.equal(topology.lapLength, lap.length);
  assert.equal(lap.segments.length, 72);
  assert.ok(Math.abs(topology.seamTurn) <= (10 * Math.PI / 180) + 1e-8);
  assert.ok(Math.abs(Math.abs(topology.seamTurn) - (5 * Math.PI / 180)) < 1e-10);
});

test('M6.48 circuit topology rejects an ordinary open path instead of inventing last-to-first geometry', () => {
  const open = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 100 },
    { x: 5, z: 200 },
  ]);

  assert.throws(
    () => compileCircuitTopology('NOT_CLOSED', open),
    /explicitly repeat its first world vertex/,
  );
});

test('M6.48 circuit seam has one unambiguous copy of endpoint authoring metadata', () => {
  const vertices = [];
  const segmentCount = 72;
  const radius = 120;
  for (let i = 0; i < segmentCount; i += 1) {
    const angle = (i / segmentCount) * Math.PI * 2;
    vertices.push({ x: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }
  vertices[0].sourceRadius = 150;
  vertices.push({ ...vertices[0], sourceRadius: 160 });
  const lap = compileRasterPath(vertices);

  assert.throws(
    () => compileCircuitTopology('CONFLICTING_SEAM', lap),
    /sourceRadius metadata must match exactly/,
  );
});

test('M6.48 unfolding repeats lap geometry into one ordinary open RasterPath', () => {
  const lap = createGentleClosedLap();
  const topology = compileCircuitTopology('THREE_COPY_WINDOW', lap);
  const unfolded = unfoldCircuitRasterPath(topology, 3);

  assert.equal(unfolded.segments.length, lap.segments.length * 3);
  assert.ok(Math.abs(unfolded.length - lap.length * 3) < 1e-8);

  const seam1 = lap.vertices.length - 1;
  const seam2 = seam1 * 2;
  assert.ok(Math.abs(unfolded.vertexTurns[seam1] - topology.seamTurn) < 1e-12);
  assert.ok(Math.abs(unfolded.vertexTurns[seam2] - topology.seamTurn) < 1e-12);
});

test('M6.48 continuous circuit chainage decomposes cleanly across positive and negative windings', () => {
  const topology = compileCircuitTopology('CHAINAGE', createGentleClosedLap());
  const L = topology.lapLength;

  assert.deepEqual(decomposeCircuitChainage(topology, L + 7), {
    winding: 1,
    sLocal: 7,
    sUnwrapped: L + 7,
  });
  assert.deepEqual(decomposeCircuitChainage(topology, -7), {
    winding: -1,
    sLocal: L - 7,
    sUnwrapped: -7,
  });
  assert.equal(wrapCircuitChainage(topology, L * 2), 0);
});

test('M6.48 local source chainage lifts through the seam without giving modulo authority to Core', () => {
  const topology = compileCircuitTopology('LIFT', createGentleClosedLap());
  const L = topology.lapLength;

  assert.ok(Math.abs(liftCircuitLocalChainageNear(topology, 2, L - 1) - (L + 2)) < 1e-12);
  assert.ok(Math.abs(liftCircuitLocalChainageNear(topology, L - 2, L + 1) - (L - 2)) < 1e-12);
  assert.ok(Math.abs(liftCircuitLocalChainageNear(topology, L, L - 1) - L) < 1e-12);

  assert.throws(
    () => liftCircuitLocalChainageNear(topology, L + 0.001, L),
    /within the authored \[0,L\] lap domain/,
  );
});

test('M6.48 circuit topology remains above Core and outside renderer and RouteDag authority', async () => {
  const source = await readFile(new URL('../src/gameplay/circuit-topology.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /route-dag/);
  assert.doesNotMatch(source, /projection/);
  assert.doesNotMatch(source, /pseudoDepth/);
  assert.doesNotMatch(source, /wrapPositive/);
  assert.match(source, /compileRasterPath/);
});
