import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { readCourseImages } from '../../tools/course/read-course-images.ts';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseFileSha256 } from '../../tools/course/course-file-id.ts';
import { courseImageNames, readCourseDocument, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { pseudoProject } from '../../src/view/projection.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = new URL('../../content/', import.meta.url);
const delivered = await readDeliveredContent();
const materials = await loadSurfaceMaterials(delivered);
const definitions = await loadVehicleDefinitions(delivered, await loadEngineSounds(delivered));
const read = await readCourseDocumentBytes(
  new Uint8Array(await readFile(new URL('courses/super-hang-on-africa.course.json', content))),
  'super-hang-on-africa.course.json',
);
assert.ok(read.ok);

// A picture that all lies: a copy of a board anchored at its top edge.
const LYING = 'shangon-045-lying';
const lyingImage = { ...JSON.parse(await readFile(new URL('images/shangon-045.json', content), 'utf8')) };
lyingImage.name = LYING;
lyingImage.anchorY = -0.5;
const board = (s, at) => ({
  kind: 'sprite',
  image: LYING,
  palette: 'p104',
  at,
  lateral: 0,
  groundOffset: 0,
  unselectedLink: null,
  body: null,
});
// The images are admitted with the copy standing once at the course's far end, so every frame names it.
const base = structuredClone(read.value);
const last = base.sections.at(-1);
last.sprites = [...last.sprites, board(0, { joint: 'end', offset: -1 })];
const images = await readCourseImages(courseImageNames(base), async (name) =>
  name === `${LYING}.json`
    ? new TextEncoder().encode(JSON.stringify(lyingImage))
    : new Uint8Array(await readFile(new URL(`images/${name}`, content))),
);
const prepared = await compileCourseImages(base, images);

/** Section 0's station `s` from its nearest joint: `s0` to 228.4 m, then `c1` at 456.816188 m. */
const at = (s) =>
  s <= 228.4 ? { joint: 's0', offset: s } : { joint: 'c1', offset: Number((s - 456.816188).toFixed(6)) };
/** Section 0's profile through `knots` ([station, height]), level at its own end's height over its last 50 m. */
const endHeight = base.sections[0].profile.at(-1).y;
const profile = (knots) => [
  ...knots.map(([s, y]) => ({ at: at(s), y, curveLength: 0 })),
  { at: { joint: 'end', offset: -50 }, y: endHeight, curveLength: 0 },
  { at: { joint: 'end', offset: 0 }, y: endHeight, curveLength: 0 },
];

/**
 * The frame seen from Section 0's station 60 m with no player, its profile through `knots` (as it is where null) and
 * the lying picture at station `s` (none where null), with the screen row of the road's middle at a station.
 */
async function frame(knots, s) {
  const document = structuredClone(prepared.document);
  const section = document.sections[0];
  if (knots) section.profile = profile(knots);
  if (s !== null) section.sprites = [...section.sprites, board(s, at(s))];
  const admitted = readCourseDocument(document);
  assert.ok(admitted.ok, JSON.stringify(admitted.diagnostics));
  const compiled = await compileCourseDocument(
    admitted.value,
    'beyond-crest',
    await courseFileSha256(admitted.value),
    prepared.images,
    materials,
  );
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
  const scene = createCourseScene(compiled.value.entry, compiled.value.gates, definitions.vehicles);
  const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
  const vehicle = createVehicle(model, scene.world, { s: 60, l: 0, initialSpeed: 0 });
  const camera = updateCamera(createCameraRig(), scene.world, vehicle, CAMERA_DEFINITION, 'FACING');
  const target = createLogicalFrame();
  scene.render(target, null, camera, [], [], []);
  const sample = createPlanCoordinateSample();
  const row = (station) => {
    const point = scene.world.coordinates.toWorld(station, 0, sample);
    const y = scene.world.renderHeight.sample(station).y;
    return pseudoProject({ x: point.x, y, z: point.z, s: station }, camera).y;
  };
  return { target, row };
}

/** The lowest screen row where `a` and `b` differ, or -1. */
function lowestDifference(a, b) {
  for (let y = a.height - 1; y >= 0; y--)
    for (let x = 0; x < a.width; x++) if (a.pixels[y * a.width + x] !== b.pixels[y * a.width + x]) return y;
  return -1;
}

/** The lowest row the lying picture at `s` changes over the profile through `knots`, and that frame's rows. */
async function shown(knots, s) {
  const [without, withPicture] = [await frame(knots, null), await frame(knots, s)];
  return { lowest: lowestDifference(without.target, withPicture.target), row: withPicture.row };
}

const CREST = [
  [0, 0],
  [75, 0],
  [95, 3],
  [300, -17.5],
  [400, -17.5],
];
const valley = (flatEnd) => [
  [0, 0],
  [75, 0],
  [95, 3],
  [flatEnd, 3],
  [235, 28],
  [400, 28],
];
const BUMP = [
  [0, 0],
  [110, 0],
  [120, 0.6],
  [130, 0],
];

test('on level ground a picture lays its rows below the anchor on the ground in front of it', async () => {
  const { lowest, row } = await shown(null, 140);
  assert.ok(lowest > Math.floor(row(140)) + 5, `${lowest} against the anchor's row ${row(140)}`);
});

test('a picture beyond a crest lays no row over the nearer slope', async () => {
  for (const s of [95.5, 96, 96.5, 140]) {
    const { lowest } = await shown(CREST, s);
    assert.equal(lowest, -1, `the picture at ${s} m shows at row ${lowest}`);
  }
});

test("beyond a valley a picture's rows lie as far as the far ground is seen, none over the nearer slope", async () => {
  for (const flatEnd of [110, 100]) {
    const { row: rowOf } = await frame(valley(flatEnd), null);
    const crestRow = rowOf(95);
    let s = 96;
    while (rowOf(s) > crestRow - 3) s += 0.25;
    const { lowest, row } = await shown(valley(flatEnd), s);
    assert.ok(lowest > Math.floor(row(s)), `level to ${flatEnd} m, at ${s} m: ${lowest} against ${row(s)}`);
    assert.ok(lowest < crestRow, `level to ${flatEnd} m, at ${s} m: ${lowest} against the crest's ${crestRow}`);
  }
});

test('beyond a low bump whose far side faces away a picture lays no row over the bump', async () => {
  const { lowest, row } = await shown(BUMP, 124);
  assert.ok(lowest < row(120), `${lowest} against the bump's top ${row(120)}`);
});
