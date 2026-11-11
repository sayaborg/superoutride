import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { COURSE_INDEX_FIGURES, COURSE_INDEX_MAP, loadCourseIndex } from '../../src/content/course-index.js';
import { COURSE_FIGURES } from '../../src/course/course-figures.js';
import { COURSE_TEXT_LIMITS } from '../../src/course/course-limits.js';
import {
  CARD,
  createCardFaces,
  FACE_TURN,
  WORDS_SCROLL,
  wordsScroll,
  wrappedLines,
} from '../../src/shell/card-face.js';
import { CARD_STYLES } from '../../src/shell/card-styles.js';
import { coursePage } from '../../src/shell/course-page.js';
import { drawSmallPrint, smallPrintDraws } from '../../src/shell/small-print.js';
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
    for (let x = 0; x < frame.width; x++) {
      const within = x >= CARD.x && x < CARD.x + CARD.columns * 8 && y >= CARD.y && y < CARD.y + CARD.rows * 8;
      assert.equal(frame.pixels[y * frame.width + x] === BEHIND, !within, `(${x}, ${y}) of the frame`);
    }
  return frame;
}
const same = (a, b) => a.pixels.every((pixel, i) => pixel === b.pixels[i]);
const faceOf = (page) => ({ name: page.title, line: '', dim: false, page });
// The steps at which a page's face `face` has stood for `since` steps.
const at = (face, since) => face * FACE_TURN.steps + since;

test('the small print draws capitals, digits and its marks, and nothing else', () => {
  assert.ok(smallPrintDraws("LENGTH 2.045KM L4/R5: 3.8% (MAX) +4'-1, A&B!?"));
  assert.ok(!smallPrintDraws('km'));
  const surface = new SoftwareSurface(16, 8);
  drawSmallPrint(surface, 0, 0, 'I1', 0x7fff);
  assert.equal(surface.pixels.filter((pixel) => pixel === 0x7fff).length, 9 + 8);
  assert.throws(() => drawSmallPrint(surface, 0, 0, 'k', 0x7fff), RangeError);
});

test('in every style the plain cards and every face of the longest course the index admits stay within the card', () => {
  const [first] = courses;
  // The longest course the index admits: its name and description, length, stages and figures.
  const { heightMeters, grade, corners, straightMeters } = COURSE_INDEX_FIGURES;
  const longest = Object.freeze({
    ...first,
    name: 'W'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits),
    description: 'WW '
      .repeat(COURSE_TEXT_LIMITS.descriptionCodeUnits)
      .slice(0, COURSE_TEXT_LIMITS.descriptionCodeUnits),
    map: Object.freeze({
      ...first.map,
      lengthMeters: 999999.9,
      checkpoints: Array(COURSE_INDEX_MAP.checkpoints).fill(first.map.start.point),
    }),
    figures: Object.freeze({
      profile: first.figures.profile.map((_, i) => (i % 2 ? heightMeters : -heightMeters)),
      climbMeters: heightMeters,
      steepestGrade: grade,
      corners: { left: corners, right: corners },
      longestStraightMeters: straightMeters,
      tightestRadiusMeters: COURSE_FIGURES.bendRadiusMeters,
    }),
  });
  // Words taller than their box rise; a style with room for them all holds them still.
  const rising = new Set();
  for (const style of CARD_STYLES) {
    const faces = createCardFaces(tiles, () => style);
    draw(faces, { name: 'W'.repeat(2 * (CARD.columns - 2)), line: 'W'.repeat(CARD.columns), dim: false }, 0);
    const items = Array.from({ length: 13 }, (_, i) => ({ label: 'W'.repeat(16), value: 'W'.repeat(7), selected: !i }));
    draw(faces, { name: 'SETTINGS', line: '', dim: true, items }, 0);
    for (const type of ['CIRCUIT', 'LINEAR', 'BRANCH']) {
      const page = coursePage({ ...longest, type }, style);
      for (let face = 0; face < page.faces; face++) {
        const still = draw(faces, faceOf(page), at(face, FACE_TURN.thin)),
          risen = draw(faces, faceOf(page), at(face, WORDS_SCROLL.hold + 4 * WORDS_SCROLL.pixel));
        if (!same(still, risen)) rising.add(style.id);
      }
    }
  }
  assert.ok(rising.has('program') && rising.has('pit-board'));
});

test("in every style every delivered course's card says the course alone and fits, on every face", () => {
  for (const style of CARD_STYLES) {
    const faces = createCardFaces(tiles, () => style);
    for (const course of courses) {
      const page = coursePage(course, style);
      assert.equal(page.title, course.name);
      for (let face = 0; face < page.faces; face++) draw(faces, faceOf(page), at(face, FACE_TURN.thin));
    }
  }
});

test("in every style every delivered vehicle's card fits in each of its colors, changeable or not", () => {
  for (const style of CARD_STYLES) {
    const faces = createCardFaces(tiles, () => style);
    for (const vehicle of vehicles)
      for (const changes of [true, false]) {
        const [first, second] = spriteSetColors(vehicle.spriteSet).map((color) => {
          const page = vehicleCard(vehicle, { color, changes }, driving, style);
          for (let face = 1; face < page.faces; face++) draw(faces, faceOf(page), at(face, FACE_TURN.thin));
          return draw(faces, faceOf(page), 0);
        });
        const names = Object.values(vehicle.listing.visuals.colorNames);
        if (new Set(names).size === names.length) assert.ok(!same(first, second), vehicle.compiledVehicle.id);
      }
  }
});

test('a page with several faces turns them by line thinning, each row the face before or the face that comes', () => {
  const style = CARD_STYLES.find((candidate) => candidate.id === 'data');
  const faces = createCardFaces(tiles, () => style);
  const page = coursePage(courses[0], style);
  assert.ok(page.faces > 1);
  const before = draw(faces, faceOf(page), FACE_TURN.steps - 1),
    after = draw(faces, faceOf(page), at(1, FACE_TURN.thin));
  assert.ok(!same(before, after));
  const thinning = draw(faces, faceOf(page), at(1, FACE_TURN.thin / 2 - 1));
  let [old, next] = [0, 0];
  for (let y = CARD.y; y < CARD.y + CARD.rows * 8; y++) {
    const row = (frame) => frame.pixels.subarray(y * 320, (y + 1) * 320).join();
    if (row(before) === row(after)) continue;
    assert.ok([row(before), row(after)].includes(row(thinning)), `row ${y} is one face's`);
    if (row(thinning) === row(after)) next++;
    else old++;
  }
  assert.ok(old > 0 && next > 0);
  // After the last face the first comes again; a dimmed card shows its first face, still.
  assert.ok(same(draw(faces, faceOf(page), at(page.faces, FACE_TURN.thin)), draw(faces, faceOf(page), FACE_TURN.thin)));
});

test("a vehicle's card at rest in focus turns its picture and revs its engine", () => {
  const style = CARD_STYLES[0];
  const faces = createCardFaces(tiles, () => style);
  const vehicle = vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
  const page = vehicleCard(vehicle, { color: spriteSetColors(vehicle.spriteSet)[0], changes: true }, driving, style);
  assert.equal(page.faces, 1);
  const still = draw(faces, faceOf(page), 0);
  const moved = (steps) => {
    const shown = draw(faces, faceOf(page), steps);
    let count = 0;
    for (let i = 0; i < still.pixels.length; i++) if (still.pixels[i] !== shown.pixels[i]) count++;
    return count;
  };
  // Full throttle from 1.5 s: past a turn's sixteenth the picture has turned, and the engine stands on the graph.
  const turned = moved(120);
  // Five whole turns of the picture later it stands as at rest again, while the free revving, repeating its second
  // turn of 6 s, stands 2 s into it at full throttle once more: the engine's line and marks alone.
  const revving = moved(5 * 64 * 6);
  assert.ok(revving > 0 && revving < turned);
});
