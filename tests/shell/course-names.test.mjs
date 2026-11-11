import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { admit } from '../../src/core/admission.js';
import { COURSE_TEXTS_FORMAT, courseTextsOf, readCourseTexts } from '../../src/content/course-texts.js';
import { COURSE_TEXT_LIMITS } from '../../src/course/course-limits.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { CARD, cardNameLines, createCardFaces } from '../../src/shell/card-face.js';
import { CARD_STYLES } from '../../src/shell/card-styles.js';
import { coursePage } from '../../src/shell/course-page.js';
import { createPreRaceScreen, preRaceCardOf } from '../../src/shell/prerace-screen.js';
import { writeHud } from '../../src/shell/run-hud.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';

const DOCUMENT = 'content/course-texts.json';
const authored = JSON.parse(await readFile(new URL(`../../${DOCUMENT}`, import.meta.url), 'utf8'));
const entry = (id, name = id.toUpperCase(), description = 'A road.') => ({ id, name, description });
const document = (...courses) => ({ ...COURSE_TEXTS_FORMAT, courses });
// The course texts admitted for `courseIds` as the build admits them: the result, or the one diagnostic's path and
// message.
const admitted = (value, courseIds) => {
  const result = admit(DOCUMENT, () => courseTextsOf(readCourseTexts(value), courseIds));
  return result.ok ? result.value : { path: result.diagnostics[0].path, message: result.diagnostics[0].message };
};

test('the course texts name every course once and admit only what the screens can show', async () => {
  // The authored texts: every delivered course has its entry; the others name courses not yet raised.
  const content = await readDeliveredContent();
  const delivered = content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  const texts = admitted(authored, delivered);
  assert.equal(texts.byCourse.size, delivered.length);
  assert.equal(texts.unraised, authored.courses.length - delivered.length);
  // A product course takes its original's entry, and an entry without a course passes and is counted.
  const product = admitted(document(entry('tsukuba'), entry('outrun-a')), ['tsukuba-product']);
  assert.equal(product.byCourse.get('tsukuba-product').name, 'TSUKUBA');
  assert.equal(product.unraised, 1);
  // Each failure names what fails.
  assert.deepEqual(admitted(document(entry('tsukuba')), ['tsukuba', 'outrun-a']), {
    path: '/courses',
    message: 'Course outrun-a has no entry',
  });
  assert.match(admitted(document(entry('tsukuba'), entry('tsukuba')), ['tsukuba']).message, /"tsukuba"/);
  const name = 'W'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits + 1),
    description = 'W'.repeat(COURSE_TEXT_LIMITS.descriptionCodeUnits + 1);
  assert.deepEqual(admitted(document(entry('tsukuba', name)), ['tsukuba']), {
    path: '/courses/0/name',
    message: `String exceeds ${COURSE_TEXT_LIMITS.nameCodeUnits} code units`,
  });
  assert.deepEqual(admitted(document(entry('tsukuba', 'TSUKUBA', description)), ['tsukuba']), {
    path: '/courses/0/description',
    message: `String exceeds ${COURSE_TEXT_LIMITS.descriptionCodeUnits} code units`,
  });
  assert.deepEqual(admitted(document(entry('tsukuba', 'TSUKUBA', 'Tsukuba, Japón.')), ['tsukuba']), {
    path: '/courses/0/description',
    message: "Expected the text tiles' characters",
  });
});

// A text layer that records every write of one drawing, so that a test can tell what else covers a line's cells.
function recordingText(text) {
  const writes = [];
  return {
    writes,
    text: Object.freeze({
      ...text,
      clear() {
        writes.length = 0;
        text.clear();
      },
      write(column, row, line, palette, font = 'normal') {
        text.write(column, row, line, palette, font);
        writes.push({ column, row, rows: font === 'ornateLarge' ? 2 : 1, length: line.length, line });
      },
      put(column, row, pattern, palette) {
        text.put(column, row, pattern, palette);
        writes.push({ column, row, rows: 1, length: 1, line: null });
      },
    }),
  };
}
// The one write of `line`, which no other write of the drawing overlaps.
function alone(writes, line) {
  const own = writes.filter((write) => write.line === line);
  assert.equal(own.length, 1, `${line} is written once`);
  const [a] = own;
  for (const b of writes)
    if (b !== a)
      assert.ok(
        b.row + b.rows <= a.row ||
          a.row + a.rows <= b.row ||
          b.column + b.length <= a.column ||
          a.column + a.length <= b.column,
        `${JSON.stringify(b)} overlaps ${line}`,
      );
  return a;
}

test('a course name as long as the course texts admit fits every screen that shows it', async () => {
  const content = await readDeliveredContent();
  const name = 'W'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits);
  assert.equal(name.length, TEXT_COLUMNS);
  const courses = (await loadCourseIndex(content)).map((course) => Object.freeze({ ...course, name }));
  const sounds = await loadEngineSounds(content);
  const { vehicles, driving } = await loadVehicleDefinitions(content, sounds);
  const pictures = await loadScreenPictures(content);
  const music = await loadMusic(content, TEXT_COLUMNS);
  const series = await loadSeriesCatalog(content, vehicles, pictures, music);
  const frame = createLogicalFrame();
  const tiles = await loadTextTiles(content);
  const { text, writes } = recordingText(createTextLayer(tiles));

  // SELECT COURSE: the name as its page's title, in two lines the band holds when longer; every authored name too.
  for (const shown of [name, ...authored.courses.map((course) => course.name)]) {
    const lines = cardNameLines(shown);
    assert.ok(lines.length <= 2 && lines.every((line) => line.length <= CARD.columns - 2), shown);
    assert.equal(lines.join(lines.length > 1 && !shown.includes(' ') ? '' : ' '), shown);
  }
  const faces = createCardFaces(tiles, () => CARD_STYLES[0]);
  faces.draw(frame, { name, line: '', dim: false, page: coursePage(courses[0], CARD_STYLES[0]) }, CARD.x, CARD.y);

  // The PRE-RACE card: the name on its own row, clear of the map's box (x 8–136, y 136–232).
  const [classSeries] = series.series;
  const request = { seriesId: classSeries.id, classId: classSeries.classes[0].id, session: 'RACE' };
  const course = await loadDeliveredCourse(content, classSeries.classes[0].course, await loadSurfaceMaterials(content));
  const card = createPreRaceScreen(
    frame,
    text,
    () => {},
    preRaceCardOf(request, series, courses),
    () => {},
  );
  card.facts({ field: 16, bikes: false, slot: 16, best: null });
  card.screen.render();
  const line = alone(writes, name);
  assert.ok(line.row * 8 + 7 < 136 || line.row * 8 > 232, `the name on row ${line.row} crosses the map`);

  // READY's HUD: the name on its own row.
  const player = vehicles.find((v) => v.listing.form === 'car');
  const prepared = await prepareRun(
    content,
    { vehicles, driving, materials: await loadSurfaceMaterials(content), freePlay: await loadFreePlayRules(content) },
    course,
    null,
    {
      mode: 'FREE_PLAY',
      vehicleId: player.compiledVehicle.id,
      color: null,
      lapCount: 1,
      rivalCount: 0,
      rivalPool: formPool(await loadFreePlayRules(content), player).id,
      traffic: 'OFF',
    },
  );
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
  race.start();
  const observed = race.observe().player;
  text.clear();
  writeHud(
    {
      race,
      player: observed,
      camera: updateCamera(createCameraRig(), scene.world, observed, CAMERA_DEFINITION, 'FACING'),
      run: {
        courseName: name,
        rules: 'FREE PLAY',
        redlineRpm: player.compiledVehicle.powertrain.redlineRpm,
        steeringPicture: player.steeringPicture,
        tireKnee: race.player.actor.model.tire.rhoKnee,
        slowDown: false,
      },
      record: null,
      split: null,
    },
    text,
    false,
  );
  assert.equal(alone(writes, name).row, 10);
});
