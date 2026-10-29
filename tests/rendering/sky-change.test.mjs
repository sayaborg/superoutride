import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { readCourseImages } from '../../tools/course/read-course-images.ts';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseFileSha256 } from '../../tools/course/course-file-id.ts';
import { courseImageNames, readCourseDocument, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { createCourseRoute, createRouteWindow } from '../../src/course/course-route.js';
import { createCourseRouteReaders } from '../../src/course/course-route-readers.js';
import { createCourseRouteVisualReaders } from '../../src/view/course-route-visual-readers.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { drawSky, newSkyLines } from '../../src/view/background-transition.js';
import { backgroundPan } from '../../src/view/tile-background.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { wrapAngle } from '../../src/core/math.js';
import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import { createStripRenderMetrics } from '../../src/view/strip-ground-sampler.js';

// OUTRUN A with the fork's GATEWAY sky changing over 1000 m from its knot, past its Section's end, and a color pair over
// the road's whole width from 100 m to 400 m into the change.
const LENGTH = 1000;
const PAIR = { from: 0x001f, to: 0x7c00 };
async function compileChanging(pair = [100, 400]) {
  const content = new URL('../../content/', import.meta.url);
  const read = readCourseDocumentBytes(
    new Uint8Array(await readFile(new URL('courses/outrun-a.course.json', content))),
    'outrun-a.course.json',
  );
  assert.ok(read.ok);
  const document = structuredClone(read.value);
  const fork = document.sections.find((section) => section.id === 'coconut-beach-left');
  const knot = fork.environments.find((e) => e.background.image === 'outrun-gateway-sky');
  knot.transition = LENGTH;
  // A station `along` metres from the knot, measured from its nearest joint as the format has it.
  const joints = fork.plan.reduce(
    (list, e) => [...list, { id: e.id, s: (list.at(-1)?.s ?? 0) + (list.at(-1)?.length ?? 0), length: e.length }],
    [],
  );
  const at = (along) => {
    const s = joints.find((j) => j.id === knot.at.joint).s + knot.at.offset + along;
    const joint = joints.reduce((best, j) => (Math.abs(j.s - s) < Math.abs(best.s - s) ? j : best));
    return { joint: joint.id, offset: s - joint.s };
  };
  fork.strips.push({
    kind: 'strip',
    start: at(pair[0]),
    end: at(pair[1]),
    left: null,
    right: null,
    color: PAIR,
    material: null,
  });
  const admitted = readCourseDocument(document);
  assert.ok(admitted.ok, JSON.stringify(admitted.diagnostics ?? admitted.error ?? admitted));
  const images = await readCourseImages(
    courseImageNames(admitted.value),
    async (name) => new Uint8Array(await readFile(new URL(`images/${name}`, content))),
  );
  const prepared = await compileCourseImages(admitted.value, images);
  return compileCourseDocument(
    prepared.document,
    'outrun-a',
    await courseFileSha256(prepared.document),
    prepared.images,
    await loadSurfaceMaterials(await readDeliveredContent()),
  );
}
async function changingCourse() {
  const compiled = await compileChanging();
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics ?? compiled.error ?? Object.keys(compiled)));
  const builder = createCourseRoute(compiled.value.entry);
  for (let i = 0; i < 8 && builder.route.occurrences.at(-1).section.outgoing.length; i++)
    builder.select(builder.route.occurrences.at(-1).section.outgoing[0]);
  return builder.route;
}

/** The lines in the order the new sky takes them: their numbers' 8 bits reversed, those below 240. */
const order = Array.from({ length: 256 }, (_, n) =>
  parseInt(n.toString(2).padStart(8, '0').split('').reverse().join(''), 2),
).filter((line) => line < 240);

test('a change of sky takes round(240p) lines, spread by their bits reversed, in exact proportion to the road', async () => {
  const route = await changingCourse();
  const visual = createCourseRouteVisualReaders(route).read();
  const knot = route.occurrences
    .flatMap((o) => o.section.appearance.environments.map((e) => ({ o, e })))
    .find(({ e }) => e.transition === LENGTH);
  const start = knot.o.start + knot.e.at.s;
  const camera = { ...CAMERA_DEFINITION, x: 0, y: 2, z: 0, yaw: 0.3, pitch: 0, s: 0 };
  const frame = (sky) => {
    const surface = new SoftwareSurface(320, 240);
    drawSky(surface, sky, camera, 0.3);
    return surface.pixels;
  };
  const row = (pixels, y) => pixels.subarray(y * 320, (y + 1) * 320);
  for (const along of [0, 1, 125, 250, 500, 640, 875, 999]) {
    const sky = visual.skyAt(start + along);
    const p = along / LENGTH;
    assert.ok(Math.abs(sky.p - p) < 1e-9, `the share ${sky.p} at ${along} m`);
    const shown = frame(sky),
      to = frame({ from: null, to: sky.to, p: 1 }),
      from = frame({ from: null, to: sky.from, p: 1 });
    const newLines = new Set(order.slice(0, newSkyLines(240, p)));
    assert.equal(newLines.size, Math.round(240 * p));
    for (let y = 0; y < 240; y++)
      assert.deepEqual(row(shown, y), row(newLines.has(y) ? to : from, y), `line ${y} at ${along} m`);
  }
  // Past the Section the change began in, it runs on; at its end the new sky alone.
  assert.notEqual(route.at(start + 900), knot.o);
  assert.equal(visual.skyAt(start + LENGTH).from, null);
  assert.equal(visual.skyAt(start - 1).from, null);
});

test("within a change both skies move only as the camera turns, and the change outlives its knot's occurrence", async () => {
  const route = await changingCourse();
  const visual = createCourseRouteVisualReaders(route).read();
  const coordinates = createCourseRouteReaders(route).coordinates;
  const sample = createPlanCoordinateSample();
  const camera = { focalLength: CAMERA_DEFINITION.focalLength };
  const fork = route.occurrences.find((o) => o.section.id === 'coconut-beach-left');
  const knot = fork.start + fork.section.appearance.environments.find((e) => e.transition === LENGTH).at.s;
  const view = (s) => {
    coordinates.toWorld(s, 0, sample);
    const yaw = wrapAngle(sample.heading + 0.2 * Math.sin(s / 37));
    const sky = visual.skyAt(s);
    const skyYaw = visual.skyYawAt(s, yaw);
    return { yaw, sky, x: [sky.from, sky.to].map((b) => backgroundPan(b, skyYaw, camera)) };
  };
  let previous = view(knot + 0.5);
  for (let s = knot + 2.5; s < knot + LENGTH; s += 2) {
    const next = view(s);
    const turned = camera.focalLength * wrapAngle(next.yaw - previous.yaw);
    for (const k of [0, 1]) {
      const width = next.sky[k === 0 ? 'from' : 'to'].image.width;
      let moved = next.x[k] - previous.x[k];
      moved -= width * Math.round(moved / width);
      assert.ok(Math.abs(moved - turned) <= 1, `sky ${k} at ${s} m moved ${moved} px for ${turned.toFixed(2)} px`);
    }
    previous = next;
  }
  // A window that has dropped the knot's occurrence shows the same sky as the whole Route, as a still frame would.
  const resident = createRouteWindow(route);
  const windowed = createCourseRouteVisualReaders(resident.window);
  windowed.read();
  resident.retainFrom(knot + 800);
  assert.notEqual(resident.window.occurrences[0], fork);
  for (const along of [800, 900, 999]) {
    const a = windowed.read().skyAt(knot + along),
      b = visual.skyAt(knot + along);
    assert.equal(a.p, b.p);
    assert.equal(a.from.image, b.from.image);
    assert.equal(a.to.image, b.to.image);
  }
});

test("a color pair mixes in linear light by the change's share at each row's station", async () => {
  const route = await changingCourse();
  const visual = createCourseRouteVisualReaders(route).read();
  const fork = route.occurrences.find((o) => o.section.id === 'coconut-beach-left');
  const knot = fork.start + fork.section.appearance.environments.find((e) => e.transition === LENGTH).at.s;
  const linear = (rgb555) => [rgb555 >> 10, (rgb555 >> 5) & 31, rgb555 & 31].map(rgb555LinearChannel);
  const [from, to] = [linear(PAIR.from), linear(PAIR.to)];
  const stats = createStripRenderMetrics();
  for (const along of [100, 137.5, 250, 333, 399]) {
    const p = along / LENGTH;
    const pixels = new Uint16Array(1);
    // A near row (one point read) and a far row (a cell read) both mix by the share at their own station.
    for (const deltaS of [0, 0.25]) {
      visual.ground.sampleSpan(pixels, 0, 1, knot + along, 0, 0.01, deltaS, stats);
      const mixed = linearToRgb555(...from.map((c, i) => c + p * (to[i] - c)));
      assert.equal(pixels[0], mixed, `the road at ${along} m (row step ${deltaS} m)`);
    }
  }
});

test("a color pair lies within one environment interval, so it is the change's in force there", async () => {
  // Across the GATEWAY knot it would show the old change's share before it.
  const compiled = await compileChanging([-10, 50]);
  assert.equal(compiled.ok, false);
  assert.ok(
    compiled.diagnostics.some((d) => d.code === 'invalid_strip' && /^\/sections\/2\/strips\/\d+\/color$/.test(d.path)),
    JSON.stringify(compiled.diagnostics),
  );
});
