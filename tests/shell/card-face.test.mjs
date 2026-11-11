import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { COURSE_INDEX_MAP, loadCourseIndex } from '../../src/content/course-index.js';
import { COURSE_DOCUMENT_LIMITS, COURSE_TEXT_LIMITS } from '../../src/course/course-limits.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import {
  CARD,
  createCardFaces,
  PAGE_TEXT,
  WORDS_SCROLL,
  wordsScroll,
  wrappedLines,
} from '../../src/shell/card-face.js';
import { classPage, coursePage } from '../../src/shell/course-page.js';
import { vehicleCard } from '../../src/shell/vehicle-card.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { spriteSetColors } from '../../src/vehicle/vehicle-sprite-set.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';

const content = await readDeliveredContent();
const tiles = await loadTextTiles(content);
const courses = await loadCourseIndex(content);
const { vehicles, driving } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const BEHIND = 0x1234;

test('words break at spaces into lines of their columns, a longer word where its line ends', () => {
  assert.deepEqual(wrappedLines('A BB CCC', 4), ['A BB', 'CCC']);
  assert.deepEqual(wrappedLines('ABCDEFGHIJ K', 4), ['ABCD', 'EFGH', 'IJ K']);
  assert.deepEqual(wrappedLines('', 4), []);
});

test('words taller than their box rise: held at the top, a pixel at a time, held at the end, then at the top', () => {
  const { hold, pixel, end } = WORDS_SCROLL,
    overflow = 8;
  assert.equal(wordsScroll(0, hold + 100 * pixel), 0);
  assert.equal(wordsScroll(overflow, hold - 1), 0);
  assert.equal(wordsScroll(overflow, hold + pixel), 1);
  assert.equal(wordsScroll(overflow, hold + overflow * pixel), overflow);
  assert.equal(wordsScroll(overflow, hold + overflow * pixel + end - 1), overflow);
  assert.equal(wordsScroll(overflow, hold + overflow * pixel + end), 0);
});

// A card's face drawn at rest after `steps` over a frame of one color, which it must not leave.
function draw(faces, face, steps) {
  const frame = new SoftwareSurface(320, 240);
  frame.clear(BEHIND);
  faces.draw(frame, face, CARD.x, CARD.y, steps);
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++)
      if (x < CARD.x || x >= CARD.x + CARD.columns * 8 || y < CARD.y || y >= CARD.y + CARD.rows * 8)
        assert.equal(frame.pixels[y * frame.width + x], BEHIND, `(${x}, ${y}) lies outside the card`);
  return frame;
}
// Whether the pixel (x, y) of the frame lies within the words' lines of a card at the card's place.
const inWords = (x, y) => {
  const { column, row, columns, rows } = PAGE_TEXT.words;
  const [left, top] = [CARD.x + column * 8, CARD.y + row * 8];
  return x >= left && x < left + columns * 8 && y >= top && y < top + rows * 8;
};

test('a page holds the longest title, rules and words the readers admit, and its words rise within their lines', () => {
  const faces = createCardFaces(tiles);
  const [first] = courses;
  // The longest course the index admits: its name and description, laps, length and stages.
  const longest = Object.freeze({
    ...first,
    name: 'W'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits),
    description: 'WW '
      .repeat(COURSE_TEXT_LIMITS.descriptionCodeUnits)
      .slice(0, COURSE_TEXT_LIMITS.descriptionCodeUnits),
    maxLaps: RUN_RULE_LIMITS.laps,
    map: Object.freeze({
      ...first.map,
      lengthMeters: COURSE_DOCUMENT_LIMITS.lengthMeters,
      checkpoints: Array(COURSE_INDEX_MAP.checkpoints).fill(first.map.start.point),
    }),
  });
  // A class with the most of every rule, under a title of its own.
  const runClass = {
    title: 'X'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits),
    laps: RUN_RULE_LIMITS.laps,
    entries: Array(RUN_RULE_LIMITS.competitors).fill(null),
    traffic: {},
    timeMargin: 1.35,
  };
  for (const page of [
    coursePage({ ...longest, type: 'CIRCUIT' }),
    coursePage({ ...longest, type: 'LINEAR', maxLaps: 1 }),
    classPage(runClass, { ...longest, type: 'CIRCUIT' }, true),
    classPage(runClass, { ...longest, type: 'BRANCH', maxLaps: 1 }, false),
  ]) {
    const face = { name: page.title, line: '', dim: false, page };
    const still = draw(faces, face, 0),
      risen = draw(faces, face, WORDS_SCROLL.hold + 8 * WORDS_SCROLL.pixel);
    let moved = 0;
    for (let y = 0; y < still.height; y++)
      for (let x = 0; x < still.width; x++) {
        const i = y * still.width + x;
        if (still.pixels[i] === risen.pixels[i]) continue;
        assert.ok(inWords(x, y), `(${x}, ${y}) changed outside the words`);
        moved++;
      }
    assert.ok(moved > 0, `${page.title}: the words rise`);
  }
});

test("every delivered course's page fits its card, and its words rise only when taller than their lines", () => {
  const faces = createCardFaces(tiles);
  for (const course of courses) {
    const page = coursePage(course);
    const face = { name: page.title, line: '', dim: false, page };
    const still = draw(faces, face, 0),
      later = draw(faces, face, WORDS_SCROLL.hold + 8 * WORDS_SCROLL.pixel);
    const fits = wrappedLines(course.description, PAGE_TEXT.words.columns).length <= PAGE_TEXT.words.rows;
    assert.equal(
      still.pixels.every((pixel, i) => pixel === later.pixels[i]),
      fits,
      course.id,
    );
  }
});

test("every delivered vehicle's card fits its card in each of its colors, and only its color line tells the colors apart", () => {
  const faces = createCardFaces(tiles);
  for (const vehicle of vehicles)
    for (const changes of [true, false]) {
      const shown = spriteSetColors(vehicle.spriteSet).map((color) => {
        const page = vehicleCard(vehicle, { color, changes }, driving);
        return draw(faces, { name: page.title, line: '', dim: false, page }, 0);
      });
      // Two colors' cards differ in the picture and on the color line (row 19) alone.
      const [first, second] = shown;
      for (let y = 0; y < first.height; y++)
        for (let x = 0; x < first.width; x++) {
          const i = y * first.width + x;
          if (first.pixels[i] === second.pixels[i]) continue;
          const [cx, cy] = [x - CARD.x, y - CARD.y];
          const inPicture = cx < 16 * 8 && cy >= 3 * 8 && cy < 12 * 8,
            onColorLine = cy >= 19 * 8 && cy < 20 * 8;
          assert.ok(inPicture || onColorLine, `${vehicle.compiledVehicle.id}: (${cx}, ${cy}) differs between colors`);
        }
    }
});

test("a vehicle's card at rest in focus turns its picture and revs its engine, within the picture and the graph", () => {
  const faces = createCardFaces(tiles);
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
  const page = vehicleCard(vehicle, { color: spriteSetColors(vehicle.spriteSet)[0], changes: true }, driving);
  const face = { name: page.title, line: '', dim: false, page };
  const still = draw(faces, face, 0);
  // Which of the picture and the graph differ from the still card after `steps`; nothing else may.
  const moved = (steps) => {
    const shown = draw(faces, face, steps),
      found = new Set();
    for (let y = 0; y < still.height; y++)
      for (let x = 0; x < still.width; x++) {
        const i = y * still.width + x;
        if (still.pixels[i] === shown.pixels[i]) continue;
        const [cx, cy] = [x - CARD.x, y - CARD.y];
        assert.ok(cy >= 3 * 8 && cy < 12 * 8, `(${cx}, ${cy}) moved outside the picture and the graph`);
        found.add(cx < 16 * 8 ? 'picture' : 'graph');
      }
    return [...found].sort();
  };
  // Full throttle from 1.5 s: past a turn's sixteenth the picture has turned, and the engine stands on the graph.
  assert.deepEqual(moved(120), ['graph', 'picture']);
  // Five whole turns of the picture later it stands as at rest again, while the free revving, repeating its second
  // turn of 6 s, stands 2 s into it at full throttle once more.
  assert.deepEqual(moved(5 * 64 * 6), ['graph']);
});
