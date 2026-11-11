import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { CLASS_TITLE, loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { loadFrontEndSelection } from '../../src/content/front-end-selection.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createSelectionFlow } from '../../src/shell/selection-flow.js';
import { CARD_STEPS } from '../../src/shell/card-rows.js';
import { createCardFaces } from '../../src/shell/card-face.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';
import { createPreRaceScreen, preRaceCardOf } from '../../src/shell/prerace-screen.js';
import { createRunScreen, createRunScreenState } from '../../src/shell/run-screen.js';
import { COURSE_DOCUMENT_LIMITS, COURSE_TEXT_LIMITS } from '../../src/course/course-limits.js';
import { SESSION_NAMES } from '../../src/shell/run-request.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import { createCourseMap } from '../../src/course/course-map.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createScreenHost, TRANSITION_STEPS } from '../../src/shell/screen-host.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

// The screens smoke: the front end's rows and screens render headlessly through the same screens the page shows, from
// the delivered content. Each drawn frame is saved to `dist/screens/<name>.png` at twice the frame's size, as the
// reference mockups are drawn, for inspection by eye; no test compares their pixels.
test('the front end screens render from the delivered content', async () => {
  const content = await readDeliveredContent();
  const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const pictures = await loadScreenPictures(content);
  const frame = createLogicalFrame();
  const tiles = await loadTextTiles(content);
  const text = createTextLayer(tiles);
  const player = openPlayerRecord(null);
  const music = await loadMusic(content, TEXT_COLUMNS);
  const courses = await loadCourseIndex(content);
  const series = await loadSeriesCatalog(content, vehicles, pictures, music);
  const frontEnd = await loadFrontEndSelection(content, series, pictures, music);
  let screen = null,
    host = null,
    requested = null;
  const flow = createSelectionFlow(
    {
      courses,
      series,
      frontEnd,
      vehicles,
      freePlay: await loadFreePlayRules(content),
      music,
      player,
      dev: true,
      logo: pictures.get('title-logo'),
    },
    {
      frame,
      text,
      faces: createCardFaces(tiles),
      present: () => {},
      show: (next) => (host ? host.show(next) : (screen = next)),
      activate: () => {},
      demo: { draw: () => false, tick: () => {}, enter: () => {}, leave: () => {} },
      setVolume: () => {},
      audition: () => () => {},
      music: { play: () => {}, fadeOut: () => {} },
      run: (request) => (requested = request),
    },
  );

  const directory = new URL('../../dist/screens/', import.meta.url);
  await mkdir(directory, { recursive: true });
  // Save the frame at twice its size, as the mockups are drawn.
  const save = async (name) => {
    assert.ok(
      frame.pixels.some((pixel) => pixel !== 0),
      `${name} drew nothing`,
    );
    const png = new PNG({ width: frame.width * 2, height: frame.height * 2 });
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        const { r, g, b } = unpackRgba(rgb555ToRgba(frame.pixels[(y >> 1) * frame.width + (x >> 1)]));
        png.data.set([r, g, b, 255], (y * png.width + x) * 4);
      }
    await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(png));
  };
  // Draw the current screen and save it.
  const capture = async (name) => {
    screen.render();
    await save(name);
  };
  // The motion under way, to its end.
  const settle = () => {
    for (let i = 0; i < 200 && !screen.resting; i++) screen.tick();
  };
  // Each command, then the motion it starts, to its end.
  const send = (...commands) =>
    commands.forEach((command) => {
      screen.command(command);
      settle();
    });
  // A command, then `steps` fixed steps into the motion it starts.
  const partway = (command, steps) => {
    screen.command(command);
    for (let i = 0; i < steps; i++) screen.tick();
  };

  flow.title();
  await capture('title');
  // Halfway through the line thinning from TITLE to MAIN MENU.
  partway('CONFIRM', CARD_STEPS.thin / 2);
  await capture('thinning');
  settle();
  await capture('main-menu');
  send('CONFIRM');
  await capture('select-series');
  // The series listed before one with a document deny CONFIRM; on to the first with one.
  const playable = frontEnd.seriesRow(true).findIndex((entry) => entry.series !== null);
  for (let i = 0; i < playable; i++) send('RIGHT');
  // Halfway through the zoom into the series' world.
  partway('CONFIRM', CARD_STEPS.zoom / 2);
  await capture('zoom');
  settle();
  await capture('select-class');
  send('CONFIRM');
  await capture('select-vehicle');
  send('CONFIRM');
  assert.equal(requested?.session, 'RACE');
  // The run requests its course's first race track.
  assert.equal(requested.track, 'enduro-racer-in-game');

  // In a series the PRE-RACE card stands on the series' picture at once: through the screen host, it is current on the
  // next frame at full brightness.
  let now = 0;
  const pending = [],
    brightness = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => pending.push(callback);
  globalThis.cancelAnimationFrame = () => {};
  const page = { addEventListener: () => {}, hidden: false, location: { reload: () => {} } };
  host = createScreenHost(
    page,
    page,
    { setRoute() {}, menuCommands: () => [], menuSound() {}, setBrightness: (eighths) => brightness.push(eighths) },
    screen,
  );
  for (let i = 0; i < 2 * TRANSITION_STEPS; i++) {
    now += SIM_DT * 1000;
    pending.splice(0).forEach((callback) => callback(now));
  }
  const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
  const card = createPreRaceScreen(
    frame,
    text,
    () => {},
    preRaceCardOf(requested, series, courses),
    () => {},
  );
  card.facts({ map: createCourseMap(course), field: 16, bikes: false, slot: 16, best: undefined });
  card.progress(0.6);
  host.show(card.screen);
  assert.equal(host.screen, card.screen);
  screen = card.screen;
  await capture('prerace');
  const map = createCourseMap(course);
  assert.ok(Math.abs(map.lengthMeters - 2045) < 100, `TSUKUBA's lap is ${map.lengthMeters} m`);
  assert.ok(map.checkpoints.length > 0);
  host = null;

  // RESULT over a run's stopped frame, here the series' picture.
  const state = createRunScreenState(() => {});
  state.finish();
  screen = createRunScreen(
    state,
    {
      tick() {},
      draw: () => (pictures.get('tsukuba-clubman').draw(frame, 0, 0), { writeHud() {}, present() {} }),
      result: () => ({
        outcome: 'GOAL',
        standing: { rank: 3, count: 16 },
        raceSeconds: 291.234,
        laps: null,
        bestLapSeconds: 57.123,
        record: null,
      }),
      end: () => false,
    },
    frame,
    text,
    { retry() {}, changeVehicle() {}, select() {}, title() {} },
  );
  await capture('result');

  // FREE PLAY's rows and SETTINGS.
  flow.title();
  send('CONFIRM', 'RIGHT', 'CONFIRM');
  await capture('rules');
  send('CONFIRM');
  await capture('select-course');
  send('CONFIRM');
  await capture('free-play-vehicle');
  send('BACK', 'BACK', 'BACK', 'RIGHT', 'CONFIRM');
  await capture('settings');
  send('LEFT', 'CONFIRM');
  await capture('clear-records');
});

// The PRE-RACE card writes its lines from column 17 and the course name centred above the map: the longest names and
// facts the readers admit fit them, so a card never throws while it draws. Nothing is saved.
test('the PRE-RACE card holds the longest names and facts the readers admit', async () => {
  const content = await readDeliveredContent();
  const frame = createLogicalFrame();
  const text = createTextLayer(await loadTextTiles(content));
  // A map no course compiles to: only its length is written, the longest course's.
  const map = Object.freeze({
    centreline: [
      { east: 0, north: 0 },
      { east: 100, north: 0 },
    ],
    start: { point: { east: 0, north: 0 }, direction: { east: 1, north: 0 } },
    checkpoints: [],
    lengthMeters: COURSE_DOCUMENT_LIMITS.lengthMeters,
  });
  const facts = { map, field: RUN_RULE_LIMITS.competitors, bikes: true, slot: RUN_RULE_LIMITS.competitors };
  const draw = (card) => {
    const shown = createPreRaceScreen(
      frame,
      text,
      () => {},
      card,
      () => {},
    );
    shown.facts({ ...facts, best: 99 * 60_000 + 59_999 });
    shown.screen.render();
  };
  const session = Object.values(SESSION_NAMES).reduce((a, b) => (b.length > a.length ? b : a));
  draw({
    background: null,
    title: `${'W'.repeat(CLASS_TITLE.columns)} ${'W'.repeat(CLASS_TITLE.columns)}`.slice(0, 40),
    session,
    courseName: 'W'.repeat(COURSE_TEXT_LIMITS.nameCodeUnits),
    laps: RUN_RULE_LIMITS.laps,
  });
  // Every delivered course's FREE PLAY card, from the course index alone.
  for (const course of await loadCourseIndex(content))
    draw({ background: null, title: 'FREE PLAY', session: null, courseName: course.name, laps: RUN_RULE_LIMITS.laps });
});
