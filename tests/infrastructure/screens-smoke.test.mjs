import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { compileSeriesCatalog } from '../../src/content/series-catalog.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createSelectionFlow } from '../../src/shell/selection-flow.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';
import { SERIES_SLIDE_STEPS } from '../../src/shell/series-screen.js';
import { VEHICLE_PAGE_STEPS } from '../../src/shell/vehicle-page.js';
import { createPreRaceScreen, preRaceCardOf } from '../../src/shell/prerace-screen.js';
import { CLASS_TITLE_CODE_UNITS } from '../../src/content/series-catalog.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { SESSION_NAMES } from '../../src/shell/run-request.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import { createCourseMap } from '../../src/view/course-map.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { createScreenHost, TRANSITION_STEPS } from '../../src/shell/screen-host.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

// The screens smoke: the front end's screens render headlessly through the same screens the page shows, from the
// delivered content. Each drawn frame is saved to `dist/screens/<name>.png` at twice the frame's size, as the reference
// mockups are drawn, for inspection by eye; no test compares their pixels.
test('the front end screens render from the delivered content', async () => {
  const content = await readDeliveredContent();
  const { vehicles, driving } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const pictures = await loadScreenPictures(content);
  const frame = createLogicalFrame();
  const text = createTextLayer(await loadTextTiles(content));
  // A fresh player record, kept in no storage.
  const player = openPlayerRecord(null);
  const music = await loadMusic(content, TEXT_COLUMNS);
  const courses = await loadCourseIndex(content);
  // The delivered series and the test series of the driving scenarios (never delivered), a DEV series with race tracks.
  const testSeries = new URL('../scenarios/run-rules.series.json', import.meta.url);
  const sources = [
    ...(await Promise.all(
      content.manifest.files
        .filter((file) => file.kind === 'series')
        .map(async (file) => ({
          id: file.id,
          path: file.path,
          value: await content.json('series', file.id),
          sha256: file.sha256,
        })),
    )),
    {
      id: 'scenario-rules',
      path: testSeries.pathname,
      value: JSON.parse(await readFile(testSeries, 'utf8')),
      sha256: '',
    },
  ];
  const series = requireLoaded(
    compileSeriesCatalog(
      sources,
      content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id),
      vehicles,
      pictures,
      music,
    ),
  );
  // Until the screen host joins at the end, the shown screen is current at once.
  let screen = null,
    host = null,
    requested = null,
    titleTrack = null;
  const flow = createSelectionFlow(
    {
      courses,
      series,
      vehicles,
      driving,
      freePlay: await loadFreePlayRules(content),
      music,
      player,
      dev: true,
      vehicleSha256: new Map(),
      logo: pictures.get('title-logo'),
    },
    {
      frame,
      text,
      present: () => {},
      vehicleSound: () => {},
      show: (next) => (host ? host.show(next) : (screen = next)),
      activate: () => {},
      titleBackground: { draw: () => false, tick: () => {}, enter: () => {}, leave: () => {} },
      setVolume: () => {},
      audition: () => () => {},
      titleMusic: (track) => (titleTrack = track?.id ?? null),
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
  // Each command, then the fixed steps a slide or other change takes.
  const send = (...commands) =>
    commands.forEach((command) => {
      screen.command(command);
      for (let i = 0; i < SERIES_SLIDE_STEPS; i++) screen.tick();
    });

  // TITLE: PRESS START, then its line (SERIES, FREE PLAY, SETTINGS) for the rest of the page.
  flow.title();
  await capture('title-press-start');
  send('CONFIRM');
  await capture('title');
  send('CONFIRM');
  // The test series, a DEV series with race tracks: its title track plays and SELECT MUSIC offers both tracks and MUSIC
  // OFF. It stands on TSUKUBA CLUBMAN's picture, so its title track tells them apart.
  const rules = series.series.find((s) => s.id === 'scenario-rules');
  while (screen.wallpaper !== rules.image || titleTrack !== rules.music.title.id) send('RIGHT');
  await capture('select-series');
  assert.equal(titleTrack, 'placeholder-two');
  // Halfway through a slide to the next series, then back to the test series.
  screen.command('RIGHT');
  for (let i = 0; i < SERIES_SLIDE_STEPS / 2; i++) screen.tick();
  await capture('select-series-slide');
  for (let i = 0; i < SERIES_SLIDE_STEPS / 2; i++) screen.tick();
  send('LEFT');
  send('CONFIRM');
  await capture('select-class');
  send('CONFIRM');
  // SELECT SESSION: RACE, then TIME ATTACK with the class's record (none yet), and back to RACE.
  await capture('select-session');
  send('RIGHT');
  await capture('select-session-attack');
  send('LEFT', 'CONFIRM');
  await capture('select-vehicle');
  // The next pages, DRIVETRAIN and CHASSIS, each after the page before's time.
  for (const page of ['drivetrain', 'chassis']) {
    for (let i = 0; i < VEHICLE_PAGE_STEPS; i++) screen.tick();
    await capture(`select-vehicle-${page}`);
  }
  send('CONFIRM');
  await capture('select-music');
  send('LEFT');
  await capture('select-music-off');
  send('CONFIRM');
  assert.equal(requested?.seriesId, 'scenario-rules');
  assert.equal(requested.session, 'RACE');
  assert.equal(requested.track, null);
  // TSUKUBA CLUBMAN has no race tracks: the run starts from SELECT VEHICLE with MUSIC OFF, for each of its classes.
  // Each class screen starts from the class chosen last, so one RIGHT reaches the next class.
  for (const [i, classId] of ['production-750', 'gti-cup', '911-cup'].entries()) {
    flow.title();
    send('CONFIRM');
    while (titleTrack !== 'placeholder-one') send('LEFT');
    if (i === 0) await capture('select-series-tsukuba');
    send('CONFIRM');
    if (i === 0) await capture('select-class-tsukuba');
    send(...(i > 0 ? ['RIGHT'] : []), 'CONFIRM');
    // TIME ATTACK for 911 CUP, RACE for the others.
    send(...(i === 2 ? ['RIGHT'] : []), 'CONFIRM');
    if (i === 2) await capture('select-vehicle-tsukuba');
    requested = null;
    send('CONFIRM');
    assert.equal(requested?.classId, classId);
    assert.equal(requested.session, i === 2 ? 'TIME_ATTACK' : 'RACE');
    assert.equal(requested.track, null);
    assert.equal(titleTrack, 'placeholder-one');
  }

  // The PRE-RACE card of the last request, 911 CUP's TIME ATTACK: its course map from the compiled course, halfway loaded.
  const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
  const card = createPreRaceScreen(
    frame,
    text,
    () => {},
    preRaceCardOf(requested, series, courses),
    () => {},
  );
  card.facts({ map: createCourseMap(course), field: 1, bikes: false, slot: 16, best: null });
  card.progress(0.6);
  screen = card.screen;
  await capture('prerace');
  const map = createCourseMap(course);
  assert.ok(Math.abs(map.lengthMeters - 2045) < 100, `TSUKUBA's lap is ${map.lengthMeters} m`);
  assert.ok(map.checkpoints.length > 0);

  // Inside a series the wallpaper stays: through the screen host, CONFIRM on SELECT CLASS draws SELECT SESSION on the
  // next frame, at full brightness.
  let now = 0;
  const pending = [],
    commands = [],
    brightness = [];
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (callback) => pending.push(callback);
  globalThis.cancelAnimationFrame = () => {};
  const frames = (count) => {
    for (let i = 0; i < count; i++) {
      now += SIM_DT * 1000;
      pending.splice(0).forEach((callback) => callback(now));
    }
  };
  const page = { addEventListener: () => {}, hidden: false, location: { reload: () => {} } };
  flow.title();
  send('CONFIRM', 'CONFIRM');
  const classScreen = screen;
  host = createScreenHost(
    page,
    page,
    {
      setRoute() {},
      menuCommands: () => commands.splice(0),
      menuSound() {},
      setBrightness: (eighths) => brightness.push(eighths),
    },
    classScreen,
  );
  frames(2 * TRANSITION_STEPS);
  assert.equal(host.screen, classScreen);
  await save('wallpaper-class');
  brightness.length = 0;
  commands.push('CONFIRM');
  frames(1);
  assert.notEqual(host.screen, classScreen);
  assert.deepEqual(brightness, [TRANSITION_STEPS]);
  await save('wallpaper-session');
  // BACK returns to SELECT CLASS on the next frame too.
  commands.push('BACK');
  frames(1);
  assert.deepEqual(brightness, [TRANSITION_STEPS, TRANSITION_STEPS]);

  // FREE PLAY's SELECT VEHICLE offers every vehicle: each one in turn draws each of its pages, so a catalog that grows
  // past what the screen's lines hold fails here.
  // Without the screen host, the shown screen is current at once again.
  host = null;
  flow.title();
  send('RIGHT', 'CONFIRM', 'CONFIRM');
  // CONFIRM records the shown vehicle and BACK returns to it, so each vehicle offered is named once.
  const shown = new Set();
  for (let k = 0; k < vehicles.length; k++) {
    send('CONFIRM', 'BACK');
    const id = player.settings.latestSelections.vehicle;
    shown.add(id);
    for (let page = 0; page < 3; page++) {
      screen.render();
      for (let i = 0; i < VEHICLE_PAGE_STEPS; i++) screen.tick();
    }
    if (id === vehicles.at(-1).compiledVehicle.id) await capture('select-vehicle-free-play');
    send('RIGHT');
  }
  assert.equal(shown.size, vehicles.length, 'FREE PLAY did not offer every vehicle');
});

// The PRE-RACE card writes its lines from column 17: the longest names and facts the readers admit fit them, so a card
// never throws while it draws. Nothing is saved.
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
    title: 'W'.repeat(CLASS_TITLE_CODE_UNITS),
    session,
    courseName: 'W'.repeat(COURSE_DOCUMENT_LIMITS.nameCodeUnits),
    laps: RUN_RULE_LIMITS.laps,
  });
  // Every delivered course's FREE PLAY card, from the course index alone.
  for (const course of await loadCourseIndex(content))
    draw({ background: null, title: 'FREE PLAY', session: null, courseName: course.name, laps: RUN_RULE_LIMITS.laps });
});
