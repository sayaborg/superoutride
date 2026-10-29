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
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = new URL('../../content/originals/', import.meta.url);
const delivered = await readDeliveredContent();
const materials = await loadSurfaceMaterials(delivered);
const definitions = await loadVehicleDefinitions(delivered, await loadEngineSounds(delivered));
const read = await readCourseDocumentBytes(
  new Uint8Array(await readFile(new URL('courses/super-hang-on-africa.course.json', content))),
  'super-hang-on-africa.course.json',
);
assert.ok(read.ok);
const images = await readCourseImages(
  courseImageNames(read.value),
  async (name) => new Uint8Array(await readFile(new URL(`images/${name}`, content))),
);
const prepared = await compileCourseImages(read.value, images);

/**
 * The frame seen from the entry Section's station 60 m with no player, `sprites` added to the Section's and, where
 * `transparent`, every Strip's color taken away.
 */
async function frame(sprites, transparent) {
  const document = structuredClone(prepared.document);
  const section = document.sections[0];
  section.sprites = [...section.sprites, ...sprites];
  // As in the Strip ground test: only the material Strips stay, colorless, so no ground is drawn.
  if (transparent)
    section.strips = section.strips
      .filter((s) => s.kind === 'strip' && s.material !== null)
      .map((s) => ({ ...s, color: null }));
  const admitted = readCourseDocument(document);
  assert.ok(admitted.ok);
  const compiled = await compileCourseDocument(
    admitted.value,
    'below-ground',
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
  return target;
}

/** The lowest screen row where `a` and `b` differ, or -1. */
function lowestDifference(a, b) {
  for (let y = a.height - 1; y >= 0; y--)
    for (let x = 0; x < a.width; x++) if (a.pixels[y * a.width + x] !== b.pixels[y * a.width + x]) return y;
  return -1;
}

test("a board's rows below the ground are hidden by the nearer drawn ground and seen through transparent ground", async () => {
  const board = {
    kind: 'sprite',
    image: 'shangon-075',
    palette: 'p045',
    at: { joint: 's0', offset: 100 },
    lateral: 0,
    groundOffset: -1,
    unselectedLink: null,
    body: null,
  };
  const [ground, groundBoard, clear, clearBoard] = [
    await frame([], false),
    await frame([board], false),
    await frame([], true),
    await frame([board], true),
  ];
  const hidden = lowestDifference(ground, groundBoard),
    seen = lowestDifference(clear, clearBoard);
  assert.ok(hidden >= 0, 'the part above the ground is drawn');
  assert.ok(seen > hidden + 4, `the part below the ground shows through transparent ground (${hidden}, ${seen})`);
});
