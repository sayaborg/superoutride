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
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createSelectionFlow } from '../../src/shell/selection-flow.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';
import { SERIES_SLIDE_STEPS } from '../../src/shell/series-screen.js';
import { createPreRaceScreen, preRaceCardOf } from '../../src/shell/prerace-screen.js';
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
  const series = await loadSeriesCatalog(content, vehicles, pictures, music);
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

  // TITLE: PRESS START, then the mode line for the rest of the page.
  flow.title();
  await capture('title-press-start');
  send('CONFIRM');
  await capture('title');
  send('CONFIRM');
  // TRIAL, a DEV series with race tracks: its title track plays and SELECT MUSIC offers both tracks and MUSIC OFF.
  const trial = series.series.find((s) => s.id === 'trial');
  while (screen.wallpaper !== trial.image) send('RIGHT');
  await capture('select-series');
  assert.equal(titleTrack, 'placeholder-two');
  // Halfway through a slide to the next series, then back to TRIAL.
  screen.command('RIGHT');
  for (let i = 0; i < SERIES_SLIDE_STEPS / 2; i++) screen.tick();
  await capture('select-series-slide');
  for (let i = 0; i < SERIES_SLIDE_STEPS / 2; i++) screen.tick();
  send('LEFT');
  send('CONFIRM');
  await capture('select-class');
  send('CONFIRM');
  await capture('select-vehicle');
  send('CONFIRM');
  await capture('select-music');
  send('LEFT');
  await capture('select-music-off');
  send('CONFIRM');
  assert.equal(requested?.seriesId, 'trial');
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
    if (i === 2) await capture('select-vehicle-tsukuba');
    requested = null;
    send('CONFIRM');
    assert.equal(requested?.classId, classId);
    assert.equal(requested.track, null);
    assert.equal(titleTrack, 'placeholder-one');
  }

  // The PRE-RACE card of the last request, 911 CUP: its course map from the compiled course, halfway loaded.
  const course = await loadDeliveredCourse(content, 'tsukuba', await loadSurfaceMaterials(content));
  const card = createPreRaceScreen(
    frame,
    text,
    () => {},
    preRaceCardOf(requested, series, courses),
    () => {},
  );
  card.facts({ map: createCourseMap(course), field: 16, bikes: false, slot: 16, best: null });
  card.progress(0.6);
  screen = card.screen;
  await capture('prerace');
  const map = createCourseMap(course);
  assert.ok(Math.abs(map.lengthMeters - 2045) < 100, `TSUKUBA's lap is ${map.lengthMeters} m`);
  assert.ok(map.checkpoints.length > 0);

  // Inside a series the wallpaper stays: through the screen host, CONFIRM on SELECT CLASS draws SELECT VEHICLE on the
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
  await save('wallpaper-vehicle');
  // BACK returns to SELECT CLASS on the next frame too.
  commands.push('BACK');
  frames(1);
  assert.deepEqual(brightness, [TRANSITION_STEPS, TRANSITION_STEPS]);
});
