import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { normalFromHeading } from '../dist/core/math.js';

import { compileRasterPath, rasterPathToWorld, MAX_RASTER_VERTEX_TURN_DEGREES } from '../dist/core/raster-path.js';
import { createCircularArcGuide } from '../dist/dev/fixtures/raster-courses.js';

import { RasterTurtle } from '../dist/course/raster-turtle.js';

describe('open coordinate geometry', () => {
  test('raster compiler rejects an interior turn sharper than the Core 10-degree hard limit', () => {
    assert.throws(
      () =>
        compileRasterPath([
          { x: 0, z: 0 },
          { x: 0, z: 20 },
          { x: 10, z: 30 },
          { x: 20, z: 0 },
        ]),
      /10deg limit/,
    );
  });

  test('raster fixed-l strip edges converge to the same miter point from both sides of every interior vertex', () => {
    const course = createCircularArcGuide().raster;
    const epsilonS = 1e-7;
    for (let i = 1; i < course.vertices.length - 1; i += 1) {
      const sVertex = course.vertexS[i];
      for (const l of [-12, -4.5, 0, 4.5, 12]) {
        const before = rasterPathToWorld(course, sVertex - epsilonS, l);
        const at = rasterPathToWorld(course, sVertex, l);
        const after = rasterPathToWorld(course, sVertex + epsilonS, l);
        assert.ok(Math.hypot(before.x - at.x, before.z - at.z) < 2e-6);
        assert.ok(Math.hypot(after.x - at.x, after.z - at.z) < 2e-6);
      }
    }
  });

  test('raster interior miter is exact while endpoint bases are adjacent-segment normals', () => {
    const course = createCircularArcGuide().raster;
    const maxMiterScale = 1 / Math.cos(deg(5));
    for (let i = 1; i < course.vertices.length - 1; i += 1) {
      const incoming = course.segments[i - 1].heading;
      const outgoing = course.segments[i].heading;
      const nIn = normalFromHeading(incoming);
      const nOut = normalFromHeading(outgoing);
      const m = course.vertexMiters[i];
      near(m.x * nIn.x + m.z * nIn.z, 1, 1e-12);
      near(m.x * nOut.x + m.z * nOut.z, 1, 1e-12);
      assert.ok(Math.hypot(m.x, m.z) <= maxMiterScale + 1e-12);
    }

    assert.deepEqual(course.vertexMiters[0], normalFromHeading(course.segments[0].heading));
    assert.deepEqual(course.vertexMiters.at(-1), normalFromHeading(course.segments.at(-1).heading));
  });
});

describe('authored boundary regressions', () => {
  test('shared turtle authors open finite Raster geometry below the compiler turn bound', () => {
    for (const sign of [-1, 1]) {
      const turtle = new RasterTurtle({ x: 7, z: -2 }, 0.3);
      turtle.appendStraight(110);
      turtle.appendArcDegrees(100, sign * 75);
      turtle.appendStraight(70);
      turtle.appendArc(150, (-sign * Math.PI) / 2);
      const raster = compileRasterPath(turtle.vertices);
      assert.ok(raster.vertexTurns.every((turn) => Math.abs(turn) <= (MAX_RASTER_VERTEX_TURN_DEGREES * Math.PI) / 180));
      assert.equal(raster.vertices.length, 1 + 3 + 15 + 2 + 18);
      assert.notDeepEqual(raster.vertices[0], raster.vertices.at(-1));
      assert.equal(turtle.arcCount, 2);
      assert.ok(Math.abs(turtle.chainage - raster.length) < 1e-9);
      assert.throws(() => turtle.appendArc(NaN, 1), /radius/);
      assert.throws(() => turtle.appendArc(100, 0), /turn/);
      assert.throws(() => turtle.appendStraight(-1), /length/);
    }
  });
});
