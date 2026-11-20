import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures, mainPicture } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { loadFrontEndSelection } from '../../src/content/front-end-selection.js';
import { compileTilePicture } from '../../src/image/tile-picture.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { drawPlaneRow } from '../../src/view/scaled-plane.js';
import { createSelectionFlow, SERIES_FADE_SECONDS } from '../../src/shell/selection-flow.js';
import { CARD_STEPS, DEMO, SERIES_SCALE, ZOOM_CENTRE } from '../../src/shell/card-rows.js';
import { CARD, createCardFaces } from '../../src/shell/card-face.js';
import { CARD_STYLES } from '../../src/shell/card-styles.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';

const content = await readDeliveredContent();
const { vehicles, driving } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const pictures = await loadScreenPictures(content);
const music = await loadMusic(content, TEXT_COLUMNS);
const series = await loadSeriesCatalog(content, vehicles, pictures, music);
const delivered = await loadFrontEndSelection(content, series, pictures, music);
const courses = await loadCourseIndex(content);
const tiles = await loadTextTiles(content);
const club = series.series.find((s) => s.id === 'tsukuba-clubman');
// TSUKUBA CLUBMAN's card on SELECT SERIES, after the ARCADE TRIBUTE series, and its picture.
const clubAt = delivered.seriesRow(true).findIndex((entry) => entry.series === club);
const clubPicture = delivered.seriesRow(true)[clubAt].picture;
// SELECT SERIES' cards: the series, FREE PLAY last; and FREE PLAY's series, whose classes are of any course and vehicle.
const seriesNames = delivered.seriesRow(true).map((entry) => entry.name);
const freePlay = series.series.find((s) => s.id === 'free-play');

// A selection over the delivered content, its devices recording what the rows asked for. `frontEnd` may add a series
// without a document beside the delivered one.
function selection({ dev = true, frontEnd = delivered } = {}) {
  const log = { music: [], runs: [], shown: 0, engines: [] };
  const flow = createSelectionFlow(
    {
      courses,
      series,
      frontEnd,
      vehicles,
      driving,
      music,
      player: openPlayerRecord(null),
      dev,
      mainPicture: mainPicture(pictures),
      cardStyle: { current: () => CARD_STYLES[0], step: () => {} },
    },
    {
      frame: createLogicalFrame(),
      text: createTextLayer(tiles),
      faces: createCardFaces(tiles, () => CARD_STYLES[0]),
      present: () => {},
      show: () => log.shown++,
      activate: () => {},
      demo: { draw: () => false, tick: () => {}, enter: () => {}, leave: () => {} },
      engine: (engine) => log.engines.push(engine.powertrain.engineRpm),
      run: (request, back) => log.runs.push({ request, back }),
      setVolume: () => {},
      audition: () => () => {},
      music: {
        play: (track) => log.music.push(['play', track?.id ?? null]),
        fadeOut: (seconds) => log.music.push(['fade', seconds]),
      },
    },
  );
  const { screen } = flow;
  // Ticks until every motion has ended, returning what a held command did.
  const settle = () => {
    const held = [];
    for (let i = 0; i < 200 && !screen.resting; i++) held.push(screen.tick());
    return held.filter(Boolean);
  };
  // One command, then the motion it starts: what the command did.
  const send = (command) => {
    const response = screen.command(command);
    settle();
    return response;
  };
  const names = () => screen.row.cards.map((card) => card.name);
  // The list card's entries.
  const items = () => screen.row.cards[screen.index].items.map((item) => item.name);
  flow.title();
  return { flow, screen, log, send, settle, names, items };
}

test('PRESS START leads to SELECT SERIES, whose last card is FREE PLAY, and BACK returns row by row', () => {
  const { screen, log, send, names, items } = selection();
  assert.equal(screen.row.kind, 'title');
  assert.equal(send('BACK'), null);
  assert.equal(send('CONFIRM'), 'start');
  // SELECT SERIES: the series pictures and FREE PLAY, then the series' world, which a single class, the class's one
  // course and a single vehicle still show.
  assert.equal(screen.row.kind, 'series');
  assert.deepEqual(names(), seriesNames);
  // SELECT SERIES stands on the demo alone, its main picture FREE PLAY's card (K, 2026-11-19).
  assert.equal(screen.row.world, DEMO);
  assert.equal(screen.wallpaper, null);
  for (let i = 0; i < clubAt; i++) assert.equal(send('RIGHT'), 'slide');
  assert.equal(send('CONFIRM'), 'confirm');
  assert.deepEqual(
    names(),
    club.classes.map((c) => c.title),
  );
  assert.equal(screen.row.world, clubPicture);
  assert.equal(screen.wallpaper, screen.row.world);
  // A class's card and a course's are silent; a vehicle's, at rest in focus, revs its engine and is heard.
  for (let i = 0; i < 100; i++) screen.tick();
  assert.equal(send('CONFIRM'), 'confirm');
  assert.deepEqual(names(), [courses.find((c) => c.id === club.classes[0].course).name]);
  assert.equal(screen.row.world, clubPicture);
  for (let i = 0; i < 100; i++) screen.tick();
  assert.ok(!screen.vehicleDriven && log.engines.length === 0);
  assert.equal(send('CONFIRM'), 'confirm');
  assert.equal(screen.row.cards.length, club.classes[0].vehicles.length);
  assert.ok(!screen.vehicleDriven);
  for (let i = 0; i < 150; i++) screen.tick();
  assert.ok(screen.vehicleDriven);
  assert.equal(log.engines.length, 150);
  assert.ok(log.engines.at(-1) > 2 * log.engines[0], 'full throttle from 1.5 s');
  assert.equal(send('CONFIRM'), 'entry');
  const [{ request }] = log.runs;
  assert.deepEqual(
    [request.seriesId, request.classId, request.session, request.track],
    [club.id, club.classes[0].id, 'RACE', null],
  );
  for (const name of ['SELECT COURSE', 'SELECT CLASS']) {
    assert.equal(send('BACK'), 'back', name);
    assert.equal(screen.row.world, clubPicture);
  }
  assert.equal(send('BACK'), 'back');
  assert.equal(screen.row.kind, 'series');
  assert.equal(screen.index, clubAt);
  // FREE PLAY, the last card, the main world: zoomed into as a series is, then its six classes, SELECT COURSE (every
  // offered course, in the course index's order) and SELECT VEHICLE (every vehicle), all in the main world.
  for (let i = clubAt; i < seriesNames.length - 1; i++) send('RIGHT');
  assert.equal(names()[screen.index], 'FREE PLAY');
  assert.equal(screen.row.cards[screen.index].picture, undefined);
  assert.equal(send('CONFIRM'), 'confirm');
  assert.deepEqual(names(), ['SOLO', 'TRAFFIC', 'RACE', 'RACE + TRAFFIC', 'CHASE', 'CHASE + TRAFFIC']);
  assert.equal(screen.row.world, null);
  send('CONFIRM');
  assert.deepEqual(
    names(),
    courses.map((c) => c.name),
  );
  send('CONFIRM');
  assert.equal(screen.row.cards.length, vehicles.length);
  assert.equal(screen.row.world, null);
  send('CONFIRM');
  assert.deepEqual(
    [log.runs.at(-1).request.seriesId, log.runs.at(-1).request.classId, log.runs.at(-1).request.courseId],
    ['free-play', 'solo', courses[0].id],
  );
  assert.equal(log.runs.at(-1).request.track, courses[0].raceTracks[0] ?? null);
  for (const name of ['SELECT COURSE', 'SELECT CLASS', 'SELECT SERIES']) assert.equal(send('BACK'), 'back', name);
  assert.equal(screen.index, seriesNames.length - 1);
  // SETTINGS: one list card, which PAUSE opens, standing on what SELECT SERIES stands on; CONTROLS and CLEAR RECORDS
  // open their own rows.
  assert.equal(send('PAUSE'), 'confirm');
  assert.deepEqual(names(), ['SETTINGS']);
  assert.equal(screen.row.world, DEMO);
  assert.equal(items().length, 14);
  assert.deepEqual(items().slice(-2), ['CONTROLS', 'CLEAR RECORDS']);
  // A value's CONFIRM does nothing.
  assert.equal(send('CONFIRM'), null);
  for (let i = 0; i < 12; i++) assert.equal(send('DOWN'), 'move');
  send('CONFIRM');
  assert.deepEqual(names(), ['CONTROLS']);
  send('BACK');
  assert.equal(items()[screen.item], 'CONTROLS');
  send('DOWN');
  send('CONFIRM');
  assert.deepEqual(names(), ['NO', 'YES']);
  send('CONFIRM');
  assert.equal(items()[screen.item], 'CLEAR RECORDS');
  // BACK returns to where SETTINGS was opened, as it was.
  assert.equal(send('BACK'), 'back');
  assert.deepEqual([screen.row.kind, screen.index], ['series', seriesNames.length - 1]);
  assert.equal(send('BACK'), 'back');
  assert.equal(screen.row.kind, 'title');
});

test('PAUSE opens SETTINGS from any row, on what that row stands on, and BACK or PAUSE returns to that row as it was', () => {
  const { screen, send, items } = selection();
  // From TITLE, in the main world.
  assert.equal(send('PAUSE'), 'confirm');
  assert.deepEqual([screen.row.cards[0].name, screen.row.world], ['SETTINGS', null]);
  assert.equal(send('PAUSE'), 'back');
  assert.equal(screen.row.kind, 'title');
  // From a series' world, in that world; an entry chosen in CONTROLS or CLEAR RECORDS still leads back to the row.
  send('CONFIRM');
  for (let i = 0; i < clubAt; i++) send('RIGHT');
  send('CONFIRM');
  send('RIGHT');
  const at = screen.index;
  send('PAUSE');
  assert.equal(screen.row.world, clubPicture);
  for (let i = 0; i < 12; i++) send('DOWN');
  send('CONFIRM');
  assert.deepEqual([screen.row.cards[0].name, screen.row.world], ['CONTROLS', clubPicture]);
  assert.equal(send('PAUSE'), 'back');
  assert.deepEqual([screen.row.world, screen.index], [clubPicture, at]);
  send('PAUSE');
  assert.equal(items()[screen.item], 'MASTER');
  assert.equal(send('BACK'), 'back');
  assert.deepEqual(
    [screen.row.world, screen.index, screen.row.cards[at].name],
    [clubPicture, at, club.classes[at].title],
  );
});

test('LEFT and RIGHT wrap a row of three or more and shake one of one or two; UP and DOWN change only values', () => {
  const { screen, send, items } = selection();
  send('CONFIRM');
  // Three cards or more wrap.
  assert.ok(seriesNames.length >= 3);
  assert.equal(send('LEFT'), 'slide');
  assert.equal(screen.index, seriesNames.length - 1);
  assert.equal(send('RIGHT'), 'slide');
  assert.equal(screen.index, 0);
  // UP and DOWN on a card without a value do nothing and move no card.
  assert.equal(send('UP'), null);
  assert.equal(send('DOWN'), null);
  assert.equal(screen.index, 0);
  // SETTINGS' CLEAR RECORDS?: two cards, which do not wrap.
  send('PAUSE');
  for (let i = 0; i < 13; i++) send('DOWN');
  send('CONFIRM');
  assert.equal(send('LEFT'), null);
  assert.equal(screen.index, 0);
  assert.equal(send('RIGHT'), 'move');
  assert.equal(send('RIGHT'), null);
  assert.equal(screen.index, 1);
  // A shake changes nothing, and a command during it waits for its end: the last one alone.
  screen.command('RIGHT');
  assert.equal(screen.resting, false);
  assert.equal(screen.command('RIGHT'), null);
  assert.equal(screen.command('LEFT'), null);
  const held = [];
  while (!screen.resting) held.push(screen.tick());
  assert.deepEqual(held.filter(Boolean), ['move']);
  assert.equal(screen.index, 0);
  // The one-card CONTROLS row shakes either way.
  send('BACK');
  send('UP');
  send('CONFIRM');
  assert.equal(send('RIGHT'), null);
  assert.equal(send('LEFT'), null);
  assert.equal(screen.index, 0);
  // In a list card UP and DOWN choose an entry, stopping at its ends, and LEFT and RIGHT change its value.
  send('BACK');
  assert.equal(send('UP'), 'move');
  assert.equal(items()[screen.item], 'CARD DESIGN');
  assert.equal(send('UP'), 'move');
  assert.equal(items()[screen.item], 'SLOW DOWN');
  const item = () => screen.row.cards[0].items[screen.item];
  const before = item().line();
  assert.equal(send('LEFT'), 'move');
  assert.notEqual(item().line(), before);
  for (let i = 0; i < 12; i++) send('UP');
  assert.equal(screen.item, 0);
  assert.equal(send('UP'), null);
});

test('line thinning is one implementation, shared by the rows and the background transitions', async () => {
  const imports = async (path) =>
    [...(await readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')).matchAll(/from '([^']+)'/g)].map(
      (m) => m[1],
    );
  assert.ok((await imports('shell/card-rows.ts')).includes('../view/line-thinning.js'));
  assert.ok((await imports('view/background-transition.ts')).includes('./line-thinning.js'));
});

test('the series plane covers a card at 0.7 and the frame at 1, scaled about one fixed point', () => {
  const picture = compileTilePicture({
    format: 'superoutride.tile-picture',
    version: 1,
    name: 'flat',
    columns: 40,
    patterns: [{ indices: Array(64).fill(1) }],
    palettes: [[0, 0x7fff, ...Array(14).fill(0)]],
    tiles: Array(40 * 30).fill([0, 0]),
  });
  const covered = (scale) => {
    const target = new SoftwareSurface(320, 240);
    drawPlaneRow(target, { pictures: [picture], pitch: 328, wrap: false, dim: () => false }, 0, scale, ZOOM_CENTRE, 0);
    let left = 320,
      right = -1,
      top = 240,
      bottom = -1;
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++)
        if (target.pixels[y * 320 + x] === 0x7fff) {
          [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
        }
    return [left, top, right - left + 1, bottom - top + 1];
  };
  assert.deepEqual(covered(SERIES_SCALE), [CARD.x, CARD.y, CARD.columns * 8, CARD.rows * 8]);
  assert.deepEqual(covered(1), [0, 0, 320, 240]);
});

test('SELECT SERIES plays the series in focus once it rests; the world keeps it, and only RESULT starts it again', () => {
  // A second series beside the delivered one with a document, without one yet: it shows its picture and denies CONFIRM;
  // then FREE PLAY.
  const entry = delivered.seriesRow(false).find((s) => s.series === club);
  const free = delivered.seriesRow(false).find((s) => s.series === freePlay);
  const later = Object.freeze({
    id: 'later',
    picture: entry.picture,
    series: null,
    titleTrack: music[1],
    name: 'LATER',
    description: 'A later series.',
  });
  const frontEnd = { ...delivered, seriesRow: () => [entry, later, free] };
  const { flow, screen, log, send, settle } = selection({ frontEnd });
  assert.deepEqual(log.music, [['play', null]]);
  log.music.length = 0;
  screen.command('CONFIRM');
  settle();
  for (let i = 0; i < CARD_STEPS.rest - 1; i++) screen.tick();
  assert.deepEqual(log.music, []);
  screen.tick();
  assert.deepEqual(log.music, [['play', entry.titleTrack.id]]);
  // A move fades the track out; the next series plays once the row rests again, and denies CONFIRM.
  log.music.length = 0;
  assert.equal(send('RIGHT'), 'slide');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  assert.deepEqual(log.music, [
    ['fade', SERIES_FADE_SECONDS],
    ['play', 'placeholder-two'],
  ]);
  assert.equal(send('CONFIRM'), 'deny');
  // Into the world the track plays on; out of it, on SELECT SERIES, it plays on too.
  send('LEFT');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  log.music.length = 0;
  send('CONFIRM');
  send('BACK');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  assert.ok(log.music.every(([kind, id]) => kind === 'play' && id === entry.titleTrack.id));
  // SETTINGS opened there keeps the track playing.
  log.music.length = 0;
  send('PAUSE');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  send('PAUSE');
  assert.ok(log.music.every(([kind, id]) => kind === 'play' && id === entry.titleTrack.id));
  // FREE PLAY's card plays nothing, nor its rows; back to TITLE fades out.
  log.music.length = 0;
  send('RIGHT');
  send('RIGHT');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  assert.deepEqual(log.music, [
    ['fade', SERIES_FADE_SECONDS],
    ['fade', SERIES_FADE_SECONDS],
    ['play', null],
  ]);
  send('CONFIRM');
  send('BACK');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  assert.ok(log.music.slice(3).every(([kind, id]) => kind === 'play' && id === null));
  log.music.length = 0;
  send('BACK');
  assert.deepEqual(log.music, [['fade', SERIES_FADE_SECONDS]]);
  assert.equal(screen.row.kind, 'title');
  // RESULT's way back into the world starts the series' track from its beginning.
  log.music.length = 0;
  flow.select({
    seriesId: club.id,
    classId: club.classes[0].id,
    session: 'RACE',
    vehicleId: 'x',
    color: null,
    track: null,
  });
  assert.deepEqual(log.music, [
    ['fade', 0],
    ['play', entry.titleTrack.id],
  ]);
});

test("FREE PLAY's classes run any offered course with any vehicle, which the run's class takes", () => {
  const { screen, log, send, names } = selection();
  send('CONFIRM');
  // FREE PLAY, the last card, and its CHASE class.
  send('LEFT');
  send('CONFIRM');
  for (let i = 0; i < 4; i++) send('RIGHT');
  assert.equal(names()[screen.index], 'CHASE');
  send('CONFIRM');
  const course = courses.find((c) => c.id === 'pole-position-ii-fuji');
  for (let i = 0; names()[screen.index] !== course.name; i++) assert.ok(i < 80 && send('RIGHT'));
  send('CONFIRM');
  const bike = vehicles.findIndex((v) => v.listing.form === 'bike');
  for (let i = 0; i < bike; i++) send('RIGHT');
  send('CONFIRM');
  const { request } = log.runs.at(-1);
  assert.deepEqual(
    [request.seriesId, request.classId, request.courseId, request.vehicleId, request.session],
    ['free-play', 'chase', course.id, vehicles[bike].compiledVehicle.id, 'RACE'],
  );
  // The class names no course or vehicle: the run's class on its course takes the player's.
  const chase = freePlay.classes.find((c) => c.id === 'chase');
  assert.deepEqual([chase.course, chase.vehicles, chase.chase], [null, null, { seconds: 3 }]);
});

test("RESULT's SELECT and CHANGE VEHICLE rebuild the rows above from the run, and a run outside them leads to TITLE", () => {
  const { flow, screen, send, names } = selection();
  const run = {
    seriesId: club.id,
    classId: club.classes[1].id,
    session: 'RACE',
    vehicleId: club.classes[1].vehicles[0],
    color: null,
    track: null,
  };
  flow.select(run);
  assert.deepEqual(
    names(),
    club.classes.map((c) => c.title),
  );
  assert.equal(screen.index, 1);
  send('BACK');
  assert.equal(screen.row.kind, 'series');
  flow.vehicle(run);
  assert.equal(screen.row.cards.length, club.classes[1].vehicles.length);
  send('BACK');
  assert.deepEqual(names(), [courses.find((c) => c.id === club.classes[1].course).name]);
  send('BACK');
  assert.deepEqual(
    names(),
    club.classes.map((c) => c.title),
  );
  // FREE PLAY's SELECT leads to SELECT COURSE, its class before it.
  const free = {
    seriesId: 'free-play',
    classId: 'race',
    session: 'RACE',
    courseId: 'outrun-short-b',
    vehicleId: vehicles[0].compiledVehicle.id,
    color: null,
    track: null,
  };
  flow.select(free);
  assert.equal(screen.row.cards[screen.index].name, courses.find((c) => c.id === 'outrun-short-b').name);
  send('BACK');
  assert.equal(names()[screen.index], 'RACE');
  // Without DEV, an original's course no series runs is not offered: its run leads to TITLE.
  const plain = selection({ dev: false });
  plain.flow.select(free);
  assert.equal(plain.screen.row.kind, 'title');
});
