import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { readCourseImages } from '../../tools/course/read-course-images.ts';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { compileCourseImages } from '../../tools/course/compile-course-images.ts';
import { courseViewsFile } from '../../tools/graphics/sprite-import.ts';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { courseFileSha256 } from '../../tools/course/course-file-id.ts';
import { courseImageNames, readCourseDocument, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createCourseRouteReaders } from '../../src/course/course-route-readers.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { createCourseRouteVisualReaders } from '../../src/view/course-route-visual-readers.js';
import { collectVisibleCourseSprites, selectCourseSpriteView } from '../../src/view/course-sprite.js';
import { cameraRightDistance } from '../../src/view/projection.js';
import { wrapAngle } from '../../src/core/math.js';

const content = new URL('../../content/', import.meta.url);
const COURSE = 'super-monaco-gp-qualifying';
const VIEWS = 'test-views';
const SECTION = 2;
const STATION = 40;
const LATERAL = -9;

/** A one-level master `width` texels wide and 2 high, in one palette of every slot. */
function master(width) {
  const colors = Array.from({ length: 16 }, (_, i) => (i ? i * 2000 : 0));
  return {
    format: 'superoutride.sprite-lod',
    version: 4,
    name: VIEWS,
    width,
    height: 2,
    anchorX: (width - 1) / 2,
    anchorY: 1,
    defaultPalette: 'p000',
    palettes: { p000: { colors }, p001: { colors: colors.map((c) => c ^ 0x1f) } },
    levels: [
      {
        paletteRgb555: colors,
        indices: Array.from({ length: 2 * width }, (_, i) => 1 + (i % 15)),
        mixtures: colors.map((_, i) => (i ? [[i, 1]] : [])),
      },
    ],
  };
}

/** A view set whose picture p is `p + 1` texels wide, view i showing picture `table[i]`. */
function viewSet(table = Array.from({ length: 32 }, (_, i) => i)) {
  const count = Math.max(...table) + 1;
  const file = courseViewsFile(
    VIEWS,
    Array.from({ length: count }, (_, p) => master(p + 1)),
    table,
  );
  return JSON.parse(new TextDecoder().decode(file.bytes));
}

const encode = (document) => ({ name: VIEWS, bytes: new TextEncoder().encode(JSON.stringify(document)) });

/** The course with one board placed on its third Section, whose occurrence is turned, and its other images. */
async function courseWith(board = {}) {
  const read = await readCourseDocumentBytes(
    new Uint8Array(await readFile(new URL(`courses/${COURSE}.course.json`, content))),
    `${COURSE}.course.json`,
  );
  assert.ok(read.ok);
  const document = structuredClone(read.value);
  const section = document.sections[SECTION];
  section.sprites = [
    {
      kind: 'sprite',
      image: VIEWS,
      palette: 'p001',
      at: { joint: section.plan[0].id, offset: STATION },
      lateral: LATERAL,
      groundOffset: 0,
      unselectedLink: null,
      body: null,
      ...board,
    },
  ];
  const admitted = readCourseDocument(document);
  assert.ok(admitted.ok);
  const images = await readCourseImages(
    courseImageNames(admitted.value).filter((name) => name !== VIEWS),
    async (name) => new Uint8Array(await readFile(new URL(`images/${name}`, content))),
  );
  return { document: admitted.value, images };
}

/** The course compiled with its board's image `views`. */
async function compileWith(views, board) {
  const { document, images } = await courseWith(board);
  const materials = await loadSurfaceMaterials(await readDeliveredContent());
  return compileCourseDocument(
    document,
    COURSE,
    await courseFileSha256(document),
    [...images, encode(views)],
    materials,
  );
}

test("a board's view counts π/32 steps of its road's angle less (π/4) tan β, half a turn round", () => {
  assert.equal(selectCourseSpriteView(0, -0.1), 0);
  // A negative angle turns round: view 31 is view 0's picture mirrored.
  assert.equal(selectCourseSpriteView(0, 0.1), 31);
  assert.equal(selectCourseSpriteView(Math.PI / 2 + 0.01, 0), 16);
  assert.equal(selectCourseSpriteView(Math.PI / 2 - 0.01, 0), 15);
  assert.equal(selectCourseSpriteView(Math.PI + 0.01, 0), 0);
  assert.equal(selectCourseSpriteView(-Math.PI / 2 + 0.01, 0), 16);
});

test('a view set is admitted whole: 32 views, each a picture, in its declared palettes, never solid', async () => {
  const set = viewSet();
  const failure = async (views, board) => {
    const result = await compileWith(views, board);
    assert.equal(result.ok, false);
    return result.diagnostics[0];
  };
  assert.equal((await failure({ ...set, views: set.views.slice(1) })).code, 'asset_invalid_image');
  assert.equal((await failure({ ...set, views: set.views.map((v) => (v ? v : 32)) })).code, 'asset_invalid_image');
  assert.equal((await failure({ ...set, views: set.views.map((v) => (v === 5 ? 6 : v)) })).code, 'asset_invalid_image');
  assert.equal((await failure(set, { palette: 'p002' })).code, 'unresolved_reference');
  assert.equal((await failure(set, { body: { width: 0.01, movable: null } })).code, 'invalid_placement');
  // A saved view set's pictures hold every level of their LOD.
  const partial = structuredClone(set);
  partial.pictures[31].levels.pop();
  const { document, images } = await courseWith();
  await assert.rejects(compileCourseImages(document, [...images, encode(partial)]));
  assert.ok((await compileCourseImages(document, [...images, encode(set)])).images.length > 0);
});

test("a board on a turned occurrence draws the view of its road's heading in the Route frame", async () => {
  const compiled = await compileWith(viewSet());
  assert.ok(compiled.ok);
  const builder = createCourseRoute(compiled.value.entry);
  const sectionStart = compiled.value.sections
    .slice(0, SECTION)
    .reduce((sum, section) => sum + section.coordinates.domain.end, 0);
  builder.extendThrough(sectionStart + STATION + 1);
  const route = builder.route;
  const occurrence = route.at(sectionStart + STATION);
  assert.equal(occurrence.section, compiled.value.sections[SECTION]);
  assert.ok(Math.abs(wrapAngle(occurrence.rotation)) > 0.5, 'the occurrence is turned');
  const readers = createCourseRouteReaders(route);
  const [board] = createCourseRouteVisualReaders(route)
    .read()
    .worldSprites.filter((sprite) => sprite.name === VIEWS);
  assert.ok(board);
  const at = readers.coordinates.toWorld(board.sRender, LATERAL, createPlanCoordinateSample());
  assert.ok(Math.abs(wrapAngle(board.views.heading - at.heading)) < 1e-9, 'the Route heading');
  const seen = new Set();
  for (const turn of [-0.6, -0.2, 0, 0.2, 0.6]) {
    const behind = readers.coordinates.toWorld(board.sRender - 20, 0, createPlanCoordinateSample());
    const camera = {
      x: behind.x,
      y: 2,
      z: behind.z,
      yaw: wrapAngle(behind.heading + turn),
      pitch: 0,
      s: board.sRender - 20,
      focalLength: 300,
      centerX: 160,
      centerY: 112,
    };
    const [visible] = collectVisibleCourseSprites([board], camera, 1, 100);
    const view = selectCourseSpriteView(at.heading - camera.yaw, cameraRightDistance(board, camera) / 20);
    // Picture p is p + 1 texels wide, and view i shows picture i.
    assert.equal(visible.asset.levels[0].width, view + 1);
    assert.equal(visible.asset.levels[0].paletteRgb555[1], 2000 ^ 0x1f, "the placement's palette");
    seen.add(view);
  }
  assert.ok(seen.size > 2, 'turning the camera changes the picture');
});
