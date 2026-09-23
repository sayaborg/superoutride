import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { compileCoursePhysicalDomains } from '../../src/course/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../../src/course/compiler/course-presentation-overlap.js';
import { createCourseDrivingReaders } from '../../src/course/course-driving-readers.js';
import { createCourseDrivingGraph } from '../../src/race/course-driving-session.js';
import { COURSE_DRIVING_POLICY } from '../../src/race/course-driving-policy.js';
import { createCourseDrivingViewSource } from '../../src/view/course-driving-view.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { createPlanarCoordinateSample } from '../../src/core/planar-sample.js';
import { createRecoveryState } from '../../src/race/recovery.js';

function physicalProduct(links) {
  const { pose, step, contact } = COURSE_DRIVING_POLICY.guard;
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  const product = compileCoursePhysicalDomains(links, {
    pose,
    step,
    consumers: { contact, driverLookahead: zero, reverseRecovery: zero },
  });
  assert.ok(product.ok, JSON.stringify(product.ok ? null : product));
  return product.value;
}

test('course physical source drives a race session without any presentation or image data', async () => {
  const document = JSON.parse(
    await readFile(new URL('../../content/courses/ribbon-coast.course.json', import.meta.url), 'utf8'),
  );
  document.sections = document.sections.map((section) => ({ ...section, presentation: null, assetIds: [] }));
  document.assets = [];
  document.sceneryInstances = [];
  document.rules = null;
  const compiled = await compileCourseDocument(document, []);
  assert.ok(compiled.ok, JSON.stringify(compiled.ok ? null : compiled));
  const source = createCourseDrivingReaders(physicalProduct([]));
  const session = createCourseDrivingGraph(compiled.value.entry, source).createSession();
  assert.ok(!('presentation' in session.view));
  const profile = VEHICLE_CATALOG[0];
  const s = compiled.value.entry.ports.find((port) => port.kind === 'entry').anchor.s;
  const vehicle = createArcadeVehicle(profile.profile, session.view.world, { s, l: 0, initialSpeed: 0 });
  const actor = { vehicle, recovery: createRecoveryState(vehicle) };
  for (let i = 0; i < 60; i++) {
    const previous = { x: vehicle.x, z: vehicle.z };
    updateArcadeVehicle(session.view.world, vehicle, { steering: 0, throttle: true, brake: false }, 1 / 60);
    assert.equal(session.observeStep(actor, previous, false), null);
  }
  assert.ok(vehicle.course.s > s);
  assert.ok(session.view.world.surfaces.sample(s, 0).material.supported);
});

test('rendering overlays the same immutable occurrence mappings across forward and reverse seams', async () => {
  const file = fileURLToPath(new URL('../../content/courses/ribbon-ring.course.json', import.meta.url));
  const { course } = await loadCourse(file);
  const physical = physicalProduct(course.links);
  const { pose, step, contact } = COURSE_DRIVING_POLICY.guard;
  const zero = { behind: 0, ahead: 0, left: 0, right: 0 };
  const presentation = compileCoursePresentationDomains(course.links, {
    pose,
    step,
    consumers: { cameraRender: contact, groundFilter: zero, scenery: zero },
  });
  assert.ok(presentation.ok, JSON.stringify(presentation.ok ? null : presentation));
  assert.deepEqual(physical.demand.pose, presentation.value.demand.pose);
  assert.deepEqual(physical.demand.step, presentation.value.demand.step);
  const source = createCourseDrivingReaders(physical);
  const session = createCourseDrivingGraph(course.entry, source).createSession();
  const rendering = createCourseDrivingViewSource(await loadCourseGround(course), physical, presentation.value);
  const verify = () => {
    const view = session.view;
    const before = session.history;
    const result = rendering.createView(view);
    assert.ok(result.ok, JSON.stringify(result.ok ? null : result));
    assert.equal(rendering.createView(view), result, 'same mapping reuses rendering readers');
    assert.equal(session.history, before, 'rendering cannot commit physical history');
    assert.ok(Object.isFrozen(view.mapping));
    assert.ok(Object.isFrozen(view.mapping.mapped));
    for (const m of view.mapping.mapped) {
      assert.ok(Object.isFrozen(m));
      assert.throws(() => {
        m.frameStart = 100;
      }, TypeError);
      for (const s of [m.frameStart, m.frameEnd, (m.frameStart + m.frameEnd) / 2]) {
        if (s < view.range.start || s > view.range.end) continue;
        const owner = view.mapping.mappingAt(s);
        assert.equal(view.mapping.resolve(s, 0).address.occurrence, owner.occurrence);
        assert.ok(Number.isFinite(view.world.height.sampleCamera(s)));
        assert.ok(result.value.visual.sample(s));
        assert.ok(result.value.backgroundAt(s));
      }
    }
    assert.throws(() => view.mapping.mapped.pop(), TypeError);
    assert.throws(() => result.value.backgroundAt(view.range.end + 1), RangeError);
    assert.throws(() => rendering.createView({ ...view, physical: physicalProduct(course.links) }), RangeError);
  };
  verify();
  const profile = VEHICLE_CATALOG[0].profile;
  const link = course.entry.outgoing[0];
  for (const [direction, port, sign] of [
    ['forward', link.source, 1],
    ['reverse', link.destination, -1],
  ]) {
    const previous = session.view.world.guide.toWorld(port.anchor.s - sign, 0, createPlanarCoordinateSample());
    const vehicle = createArcadeVehicle(profile, session.view.world, {
      s: port.anchor.s + sign,
      l: 0,
      initialSpeed: 0,
    });
    const transition = session.observeStep({ vehicle, recovery: createRecoveryState(vehicle) }, previous, false);
    assert.equal(transition.direction, direction);
    verify();
  }
});
