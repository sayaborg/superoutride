import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { createCourseDrivingSource } from '../../dist/runtime/course-driving-view.js';
import { queryDemand } from '../helpers/course-driving-fixture.mjs';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { guidePathToWorld, locateWorldOnGuideLocal, projectWorldOnGuideInterval } from '../../dist/core/guide-curve.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';

import { VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';
import { commonPresentationDocument } from '../helpers/course-common-presentation.mjs';
import { cameraProfile, courseDrivingFixture } from '../helpers/course-driving-fixture.mjs';
import { coursePresentationScene } from '../helpers/course-presentation-scene.mjs';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';
import { renderDriving } from '../../dist/render/renderer.js';
import { createCameraRig, updateCamera } from '../../dist/camera/camera.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';

const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? undefined : JSON.stringify(r));
  return r.value;
};
async function fixture(shiftDestination = 0) {
  const f = await commonPresentationDocument('linked-linear', (d) => {
    for (const s of d.sections) {
      s.primitives[0].length = 2000;
      for (const b of s.boundaries)
        for (const k of b.knots) if (k.anchor.kind === 'absolute' && k.anchor.s === 300) k.anchor.s = 2000;
      for (const p of s.ports) p.anchor = { kind: 'absolute', s: p.kind === 'entry' ? 500 : 1400 };
    }
    for (const l of d.links) l.overlap = { behind: 30, ahead: 30 };
    for (const boundary of d.sections[1].boundaries) for (const knot of boundary.knots) knot.l += shiftDestination;
  });
  for (const s of f.document.sections) {
    s.presentation.ground.left = 1000;
    s.presentation.ground.right = 1000;
    // This edge case has no stamps: a fractional chart offset is not a shared stamp texel lattice.
    if (shiftDestination !== 0) s.presentation.ground.stamps = [];
  }
  const c = ok(await compileCourseDocument(f.document, f.inputs));
  const pose = { behind: 20, ahead: 20, left: 1, right: 1 },
    step = { behind: 1, ahead: 1, left: 0.1, right: 0.1 };
  const physical = ok(
    compileCoursePhysicalDomains(c.links, {
      pose,
      step,
      consumers: {
        contact: { behind: 5, ahead: 5, left: 8, right: 8 },
        driverLookahead: { behind: 0, ahead: 0, left: 0, right: 0 },
        reverseRecovery: { behind: 0, ahead: 0, left: 2, right: 2 },
      },
    }),
  );
  const footprint = { behind: 5, ahead: 5, left: 200, right: 200 };
  const presentation = ok(
    compileCoursePresentationDomains(c.links, {
      pose,
      step,
      consumers: { cameraRender: footprint, groundFilter: footprint, scenery: footprint },
    }),
  );
  const traversal = createCourseGeometryTraversal(c.entry, {
    retainBehind: 1000,
    selectAhead: 1000,
    maxOccurrences: 4,
  });
  ok(traversal.select(traversal.snapshot().active, c.links[0]));
  return { c, traversal, source: createCourseDrivingSource(physical, presentation), physical, presentation, saved: f };
}
function view(f, s = 1400, slack = 20) {
  const d = queryDemand({ minS: s - slack, maxS: s + slack, maxAdvance: 1 });
  const geometry = ok(createCourseGeometryView(f.traversal.snapshot(), d));
  return { geometry, driving: ok(f.source.createView(geometry)) };
}

test('clipped Guide projection retains native full-segment arithmetic and bounds straight/arc candidates', async () => {
  const c = await courseDrivingFixture(),
    g = c.entry.guide;
  for (const segment of g.segments) {
    const s = (segment.sStart + segment.sEnd) / 2,
      point = guidePathToWorld(g, s, 0.75);
    assert.deepEqual(
      projectWorldOnGuideInterval(g, segment.index, point, segment.sStart, segment.sEnd),
      locateWorldOnGuideLocal(g, point, segment.index, 0),
    );
    const start = segment.sStart + (segment.sEnd - segment.sStart) * 0.2,
      end = segment.sStart + (segment.sEnd - segment.sStart) * 0.8;
    const before = guidePathToWorld(g, segment.sStart, 0.75),
      after = guidePathToWorld(g, segment.sEnd, 0.75);
    assert.ok(Math.abs(projectWorldOnGuideInterval(g, segment.index, before, start, end).s - start) < 1e-8);
    assert.ok(Math.abs(projectWorldOnGuideInterval(g, segment.index, after, start, end).s - end) < 1e-8);
  }
  assert.throws(() => projectWorldOnGuideInterval(g, 0, { x: 0, z: 0 }, 10, 10), RangeError);
  assert.throws(() => projectWorldOnGuideInterval(g, 0, { x: 0, z: 0 }, 10, 20, 'false'), TypeError);
});

test('stable frame addresses and occurrence seeds survive moving view origins across a selected Link', async () => {
  const f = await fixture(),
    a = view(f, 1400),
    b = view(f, 1400.123456, 19.1);
  assert.equal(a.driving.scope, 'occurrence-driving');
  assert.equal(a.driving.frame, f.traversal.snapshot().active);
  for (const s of [1390.25, 1399.875, 1400, 1400.12345, 1404.0625, 1410.5]) {
    assert.deepEqual(a.geometry.addressInFrame(s, 0.25), b.geometry.addressInFrame(s, 0.25));
    const p = a.driving.world.guide.toWorld(s, 0.25),
      q = b.driving.world.guide.toWorld(s, 0.25);
    assert.deepEqual(p, q);
    assert.deepEqual(
      a.driving.world.guide.locateLocal(p, p.segmentIndex, 5, false),
      b.driving.world.guide.locateLocal(p, p.segmentIndex, 5, false),
    );
    assert.deepEqual(a.driving.world.surfaces.sample(s, 0.25), b.driving.world.surfaces.sample(s, 0.25));
  }
  assert.equal(a.geometry.addressInFrame(1400, 0).occurrence, f.traversal.snapshot().selected[0]);
  assert.ok(a.driving.metadata.guideSegments < 30);
  assert.ok(a.driving.metadata.heightNodes < 6);
  assert.equal(a.driving.world.surfaces.sample(1401, 50).material.supported, false);
  assert.throws(() => a.driving.world.guide.toWorld(a.driving.range.end + 1, 0), RangeError);
});

test('actual vehicle contact and driver reads cross mapped LINEAR content while the active occurrence stays unchanged', async () => {
  const f = await fixture(),
    initial = f.traversal.snapshot().active;
  const nativeWorld = {
    guide: f.c.entry.guide,
    height: f.c.entry.height,
    surfaces: createBandSurfaceReader(f.c.entry.bandPartition, f.c.entry.physicalBindings),
  };
  const retained = view(f).driving;
  for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG[5]]) {
    const spawn = { s: 1395, l: 0.25, initialSpeed: 20, torqueProtection: entry.torqueProtection };
    const cars = [nativeWorld, retained.world, retained.world].map((w) => createArcadeVehicle(entry.profile, w, spawn));
    for (let tick = 0; tick < 60; tick++) {
      const moving = view(f, cars[2].course.s, 2).driving;
      for (const [i, world] of [nativeWorld, retained.world, moving.world].entries()) {
        const input = sampleRivalDrivingInput(world.guide, cars[i]);
        updateArcadeVehicle(world, cars[i], input, 1 / 60);
      }
      for (const key of ['x', 'y', 'z', 'yaw', 'velocityX', 'velocityY', 'velocityZ'])
        assert.ok(Math.abs(cars[0][key] - cars[1][key]) < 1e-6, `${entry.id} ${key}`);
      assert.deepEqual(cars[1], cars[2], 'reconstruction frequency must not change mechanics or caches');
    }
    assert.ok(cars[1].course.s > 1400);
  }
  assert.equal(f.traversal.snapshot().active, initial);
  assert.equal(f.traversal.snapshot().occurrences.length, 1);
});

test('projection rejects a window clipped inside a candidate even when the seed count suffices', async () => {
  const f = await fixture();
  const extent = { behind: 1, ahead: 1 };
  const geometry = ok(
    createCourseGeometryView(f.traversal.snapshot(), {
      pose: { minS: 1402, maxS: 1402, maxAdvance: 0 },
      consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
    }),
  );
  const driving = ok(f.source.createView(geometry));
  const point = driving.world.guide.toWorld(1402, 0);
  assert.throws(() => driving.world.guide.locateLocal(point, point.segmentIndex, 0, false), {
    name: 'RangeError',
    message: 'Driving window clips a seeded projection candidate',
  });
});

test('saved presentation maps once across a selected seam and actual complete frames survive moving windows', async () => {
  const f = await fixture(),
    port = f.c.links[0].source;
  const assets = createSpriteAssets(),
    pixels = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
  const retained = ok(f.source.createSeamView(view(f).geometry, f.traversal.snapshot().selected[0]));
  const observed = { queries: 0, maxL: 0 };
  let neighborQueries = 0;
  for (const s of [1398, 1400, 1402])
    for (const yaw of [-7, 0, 7]) {
      const native = coursePresentationScene(
        port,
        s - port.anchor.s,
        0.0625,
        (yaw * Math.PI) / 180,
        pixels[0],
        assets,
        { ...f.presentation.demand.bounds, behind: 10, ahead: 200 },
        observed,
      );
      const moving = view(f, s, 19.1);
      for (const [i, d] of [retained, moving.driving].entries()) {
        const camera = updateCamera(createCameraRig(), d.world, native.vehicle, cameraProfile, 1 / 60);
        assert.deepEqual(camera, native.camera);
        const p = d.presentation;
        const result = renderDriving(
          pixels[i + 1],
          {
            background: p.backgroundAt(camera.s),
            guide: d.geometry,
            camera,
            vehicle: native.vehicle,
            terrainProfile: {
              screenHeight: 240,
              dMin: 2.5,
              dMax: 200,
              ...p.groundProfile,
              roadLeft: 4,
              roadRight: 4,
              height: d.world.height,
              visual: p.visual,
            },
            groundProfile: p.groundProfile,
            worldSprites: p.worldSprites,
            assets,
            playerKind: 'car',
          },
          {
            ground: {
              ...p.ground,
              sampleAtLevel(s, l, level) {
                if (moving.geometry.addressInFrame(s, l).occurrence !== d.frame) neighborQueries += 1;
                return p.ground.sampleAtLevel(s, l, level);
              },
            },
          },
        );
        assert.ok(result.terrainOutputPixels > 1000);
        assert.deepEqual(pixels[i + 1].pixels, pixels[0].pixels, `saved frame s=${s} yaw=${yaw} reader=${i}`);
      }
      assert.equal(retained.presentation.worldSprites.length, 1, 'common scenery is owned once at the seam');
      assert.equal(moving.driving.presentation.worldSprites[0].asset, retained.presentation.worldSprites[0].asset);
    }
  assert.ok(neighborQueries > 10000);
  assert.equal(typeof retained.presentation.ground.sampleAtLevel(1404, 500, 0), 'number');
  assert.throws(() => retained.presentation.ground.sampleAtLevel(1404, 0, 1), RangeError);
  assert.throws(() => retained.presentation.ground.sampleAtLevel(1404, 0, '0'), TypeError);
});

test('reverse driving reads the actual retained predecessor in the destination frame', async () => {
  const f = await fixture();
  ok(f.traversal.forward()); // Offline frame selection precedes spawn; this is not an actor commit.
  const active = f.traversal.snapshot().active;
  const nativeWorld = {
    guide: active.section.guide,
    height: active.section.height,
    surfaces: createBandSurfaceReader(active.section.bandPartition, active.section.physicalBindings),
  };
  const retained = view(f, 500).driving;
  for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG[5]]) {
    const spawn = {
      s: 505,
      l: coursePortLateral(active.incoming.destination) + 0.25,
      initialSpeed: -20,
      torqueProtection: entry.torqueProtection,
    };
    const cars = [nativeWorld, retained.world, retained.world].map((w) => createArcadeVehicle(entry.profile, w, spawn));
    for (let tick = 0; tick < 60; tick++) {
      const moving = view(f, cars[2].course.s, 2).driving;
      for (const [i, world] of [nativeWorld, retained.world, moving.world].entries())
        updateArcadeVehicle(world, cars[i], { steering: 0, throttle: false, brake: false }, 1 / 60);
      for (const key of ['x', 'y', 'z', 'yaw', 'velocityX', 'velocityY', 'velocityZ'])
        assert.ok(Math.abs(cars[0][key] - cars[1][key]) < 1e-6, `${entry.id} reverse ${key}`);
      assert.deepEqual(cars[1], cars[2]);
    }
    assert.ok(cars[1].course.s < 500);
  }
  const l = coursePortLateral(active.incoming.destination) + 0.25;
  const native = guidePathToWorld(active.section.guide, 499, l);
  const mapped = retained.world.guide.toWorld(499, l);
  assert.ok(Math.hypot(native.x - mapped.x, native.z - mapped.z) < 1e-8);
  assert.equal(f.traversal.snapshot().active, active);
});

test('admission and query failures preserve traversal and reject unqualified or exhausted coverage', async () => {
  const f = await fixture(),
    before = f.traversal.snapshot(),
    v = view(f);
  assert.throws(() => createCourseDrivingSource(null, f.presentation), TypeError);
  const separate = await fixture();
  assert.throws(() => createCourseDrivingSource(f.physical, separate.presentation), RangeError);
  const extent = { behind: 10, ahead: 501 };
  const outside = ok(
    createCourseGeometryView(before, {
      pose: { minS: 1400, maxS: 1400, maxAdvance: 0 },
      consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
    }),
  );
  assert.equal(f.source.createView(outside).ok, true, 'consumer span extends past the 30 m guard');
  assert.equal(separate.source.createView(v.geometry).reason, 'unqualified_links');
  const guide = v.driving.world.guide,
    point = guide.toWorld(1404, 0.25);
  assert.throws(() => guide.locateLocal(point, 999999, 5, false), RangeError);
  assert.throws(() => guide.locateLocal(point, point.segmentIndex, '5', false), TypeError);
  assert.throws(() => guide.metricsAt(1404, 0.25, String(point.segmentIndex)), TypeError);
  assert.throws(() => guide.locateLocal(point, point.segmentIndex, 100, false), RangeError);
  assert.deepEqual(f.traversal.snapshot(), before);
});

test('fractional mapped Band edges share exact physical and paint ownership without an inverse round trip', async () => {
  const f = await fixture(0.004),
    v = view(f),
    span = v.geometry.spans[1],
    band = span.occurrence.section.bandPartition.bands[0],
    s = 1404.0625;
  const sourceS = v.geometry.addressInFrame(s, 0).sourceS,
    right = courseBoundaryAt(band.right, sourceS) - span.sourceLateralOrigin;
  assert.notEqual(right + span.sourceLateralOrigin, courseBoundaryAt(band.right, sourceS));
  assert.equal(v.driving.world.surfaces.sample(s, right - 1e-10).type, 'ASPHALT');
  assert.equal(v.driving.world.surfaces.sample(s, right).type, 'VOID');
  assert.equal(v.driving.world.surfaces.sample(s, right + 1e-10).type, 'VOID');
  const base = rgb555ToRgba(span.occurrence.section.presentation.ground.baseRgb555);
  for (const at of [1401.001, 1404.0625, 1406.4375])
    assert.equal(v.driving.presentation.ground.sampleAtLevel(at, right, 0), base);
});

test('seam admission bounds contact motion independently of span-composed consumer readers', async () => {
  const f = await fixture(),
    history = f.traversal.snapshot(),
    successor = history.selected[0];
  const geometry = view(f).geometry,
    driving = ok(f.source.createSeamView(geometry, successor));
  assert.equal(driving.seam, successor);
  for (const s of [1399, 1400, 1401]) {
    assert.equal(driving.world.surfaces.sample(s, 50).material.supported, false);
    assert.equal(driving.world.guide.toWorld(s, 50).l, 50);
    assert.equal(typeof driving.presentation.ground.sampleAtLevel(s, 500, 0), 'number');
  }
  const p = (s, l = 0) => geometry.geometry.guideAt(s - geometry.activeRange.start, l);
  assert.equal(driving.admitMotion(p(1399.8), p(1400.2)).ok, true);
  assert.equal(driving.admitMotion(p(1400.2), p(1399.8)).ok, true);
  assert.equal(driving.admitMotion(p(1399), p(1401)).reason, 'step_domain_exhausted');
  assert.equal(driving.admitMotion(p(1399, 3), p(1399.1, 3)).reason, 'pose_domain_exhausted');
  assert.throws(() => driving.admitMotion(null, p(1400)), TypeError);
  assert.throws(() => driving.admitMotion({ x: NaN, z: 0 }, p(1400)), RangeError);
  assert.equal(f.traversal.snapshot(), history);
  assert.equal(f.source.createSeamView(view(f, 1400, 30).geometry, successor).ok, true);
  const pending = ok(f.traversal.prepare('forward'));
  const demand = queryDemand({ minS: 480, maxS: 520, maxAdvance: 1 });
  const destination = ok(f.source.createSeamView(ok(createCourseGeometryView(pending.history, demand)), successor));
  assert.equal(destination.frame, successor);
  assert.equal(f.traversal.snapshot(), history, 'destination readers do not publish a traversal');
  assert.equal(destination.world.surfaces.sample(500, 50).material.supported, false);
});

test('car and bike use fully bounded seam readers with unchanged mechanics and admitted fixed steps', async () => {
  const f = await fixture(),
    ordinary = view(f).driving;
  const bounded = ok(f.source.createSeamView(view(f).geometry, f.traversal.snapshot().selected[0]));
  for (const entry of [VEHICLE_CATALOG[0], VEHICLE_CATALOG[5]]) {
    const spawn = { s: 1395, l: 0.25, initialSpeed: 20, torqueProtection: entry.torqueProtection };
    const cars = [ordinary, bounded].map((d) => createArcadeVehicle(entry.profile, d.world, spawn));
    for (let tick = 0; tick < 60; tick++) {
      const previous = { x: cars[1].x, z: cars[1].z };
      for (const [i, d] of [ordinary, bounded].entries())
        updateArcadeVehicle(d.world, cars[i], sampleRivalDrivingInput(d.world.guide, cars[i]), 1 / 60);
      assert.deepEqual(cars[1], cars[0], entry.id);
      assert.equal(bounded.admitMotion(previous, cars[1]).ok, true, entry.id);
    }
    assert.ok(cars[1].course.s > 1400);
  }
  assert.equal(f.traversal.snapshot().occurrences.length, 1);
});
