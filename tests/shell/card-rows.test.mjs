import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { loadFrontEndSelection } from '../../src/content/front-end-selection.js';
import { compileTilePicture } from '../../src/image/tile-picture.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { drawPlaneRow } from '../../src/view/scaled-plane.js';
import { createSelectionFlow, SERIES_FADE_SECONDS } from '../../src/shell/selection-flow.js';
import { CARD_STEPS, SERIES_SCALE, ZOOM_CENTRE } from '../../src/shell/card-rows.js';
import { CARD, createCardFaces } from '../../src/shell/card-face.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';

const content = await readDeliveredContent();
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const pictures = await loadScreenPictures(content);
const music = await loadMusic(content, TEXT_COLUMNS);
const series = await loadSeriesCatalog(content, vehicles, pictures, music);
const delivered = await loadFrontEndSelection(content, series, pictures, music);
const courses = await loadCourseIndex(content);
const freePlay = await loadFreePlayRules(content);
const tiles = await loadTextTiles(content);
const club = series.series.find((s) => s.id === 'tsukuba-clubman');
// TSUKUBA CLUBMAN's card on SELECT SERIES, after the ARCADE TRIBUTE series, and its picture.
const clubAt = delivered.seriesRow(true).findIndex((entry) => entry.series === club);
const clubPicture = delivered.seriesRow(true)[clubAt].picture;

// A selection over the delivered content, its devices recording what the rows asked for. `frontEnd` may add a series
// without a document beside the delivered one.
function selection({ dev = true, frontEnd = delivered } = {}) {
  const log = { music: [], runs: [], shown: 0 };
  const flow = createSelectionFlow(
    {
      courses,
      series,
      frontEnd,
      vehicles,
      freePlay,
      music,
      player: openPlayerRecord(null),
      dev,
      logo: pictures.get('title-logo'),
    },
    {
      frame: createLogicalFrame(),
      text: createTextLayer(tiles),
      faces: createCardFaces(tiles),
      present: () => {},
      show: () => log.shown++,
      activate: () => {},
      demo: { draw: () => false, tick: () => {}, enter: () => {}, leave: () => {} },
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
  flow.title();
  return { flow, screen, log, send, settle, names };
}

test('the rows lead from TITLE through SERIES, FREE PLAY and SETTINGS, and BACK returns row by row', () => {
  const { screen, log, send, names } = selection();
  assert.equal(screen.row.kind, 'title');
  assert.equal(send('BACK'), null);
  assert.equal(send('CONFIRM'), 'start');
  assert.deepEqual(names(), ['SERIES', 'FREE PLAY', 'SETTINGS']);
  // SERIES: the series pictures, then the series' world, which a single class and a single vehicle still show.
  assert.equal(send('CONFIRM'), 'confirm');
  assert.equal(screen.row.kind, 'series');
  assert.equal(screen.row.world, null);
  for (let i = 0; i < clubAt; i++) assert.equal(send('RIGHT'), 'slide');
  assert.equal(send('CONFIRM'), 'confirm');
  assert.deepEqual(
    names(),
    club.classes.map((c) => c.title),
  );
  assert.equal(screen.row.world, clubPicture);
  assert.equal(screen.wallpaper, screen.row.world);
  assert.equal(send('CONFIRM'), 'confirm');
  assert.equal(screen.row.cards.length, club.classes[0].vehicles.length);
  assert.equal(send('CONFIRM'), 'entry');
  const [{ request }] = log.runs;
  assert.deepEqual(
    [request.seriesId, request.classId, request.session, request.track],
    [club.id, club.classes[0].id, 'RACE', null],
  );
  assert.equal(send('BACK'), 'back');
  assert.equal(screen.row.world, clubPicture);
  assert.equal(send('BACK'), 'back');
  assert.equal(screen.row.kind, 'series');
  assert.equal(send('BACK'), 'back');
  assert.deepEqual(names(), ['SERIES', 'FREE PLAY', 'SETTINGS']);
  // FREE PLAY: RULES, SELECT ORIGINAL, SELECT COURSE and SELECT VEHICLE, in the main world.
  send('RIGHT');
  send('CONFIRM');
  assert.deepEqual(names(), ['RIVALS', 'POOL', 'TRAFFIC', 'LAPS']);
  send('CONFIRM');
  assert.deepEqual(
    names(),
    delivered.groups(new Set(courses.map((c) => c.id))).map((g) => g.title),
  );
  send('CONFIRM');
  assert.equal(screen.row.cards[0].name, 'ENDURO RACER');
  send('CONFIRM');
  assert.equal(screen.row.cards.length, vehicles.length);
  assert.equal(screen.row.world, null);
  send('CONFIRM');
  assert.equal(log.runs.at(-1).request.courseId, 'enduro-racer');
  assert.equal(log.runs.at(-1).request.track, null);
  for (const name of ['SELECT COURSE', 'SELECT ORIGINAL', 'RULES', 'MAIN MENU'])
    assert.equal(send('BACK'), 'back', name);
  // SETTINGS: a card a setting; CONTROLS and CLEAR RECORDS open their own rows.
  send('RIGHT');
  send('CONFIRM');
  assert.equal(names().length, 12);
  assert.deepEqual(names().slice(-2), ['CONTROLS', 'CLEAR RECORDS']);
  // A value card's CONFIRM does nothing.
  assert.equal(send('CONFIRM'), null);
  send('LEFT');
  send('LEFT');
  send('CONFIRM');
  assert.deepEqual(names(), ['CONTROLS']);
  send('BACK');
  assert.equal(screen.row.cards[screen.index].name, 'CONTROLS');
  send('RIGHT');
  send('CONFIRM');
  assert.deepEqual(names(), ['NO', 'YES']);
  send('CONFIRM');
  assert.equal(screen.row.cards[screen.index].name, 'CLEAR RECORDS');
  send('BACK');
  assert.equal(send('BACK'), 'back');
  assert.equal(screen.row.kind, 'title');
});

test('LEFT and RIGHT wrap a row of three or more and shake one of one or two; UP and DOWN change only values', () => {
  const { screen, send } = selection();
  send('CONFIRM');
  // Three cards wrap.
  assert.equal(send('LEFT'), 'move');
  assert.equal(screen.index, 2);
  assert.equal(send('RIGHT'), 'move');
  assert.equal(screen.index, 0);
  // UP and DOWN on a card without a value do nothing and move no card.
  assert.equal(send('UP'), null);
  assert.equal(send('DOWN'), null);
  assert.equal(screen.index, 0);
  // SETTINGS' CLEAR RECORDS?: two cards, which do not wrap.
  send('LEFT');
  send('CONFIRM');
  send('LEFT');
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
  send('LEFT');
  send('CONFIRM');
  assert.equal(send('RIGHT'), null);
  assert.equal(send('LEFT'), null);
  assert.equal(screen.index, 0);
  // A value changes with UP and DOWN.
  send('BACK');
  send('LEFT');
  assert.equal(screen.row.cards[screen.index].name, 'SLOW DOWN');
  const before = screen.row.cards[screen.index].line();
  assert.equal(send('DOWN'), 'move');
  assert.notEqual(screen.row.cards[screen.index].line(), before);
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
  // A second series beside the delivered one with a document, without one yet: it shows its picture and denies CONFIRM.
  const entry = delivered.seriesRow(false).find((s) => s.series === club);
  const later = Object.freeze({ id: 'later', picture: entry.picture, series: null, titleTrack: music[1] });
  const frontEnd = { ...delivered, seriesRow: () => [entry, later] };
  const { flow, screen, log, send, settle } = selection({ frontEnd });
  send('CONFIRM');
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
  // Back to MAIN MENU it fades out; FREE PLAY and SETTINGS play nothing.
  log.music.length = 0;
  send('BACK');
  send('RIGHT');
  send('CONFIRM');
  send('BACK');
  send('RIGHT');
  send('CONFIRM');
  for (let i = 0; i < CARD_STEPS.rest; i++) screen.tick();
  assert.deepEqual(log.music, [['fade', SERIES_FADE_SECONDS]]);
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

test("FREE PLAY's RULES are kept as chosen and cut to the course when the run is requested", () => {
  const { screen, log, send, names } = selection();
  send('CONFIRM');
  send('RIGHT');
  send('CONFIRM');
  // RIVALS stops at 15 and LAPS at the most any offered course allows; POOL and TRAFFIC wrap.
  for (let i = 0; i < 20; i++) send('UP');
  send('RIGHT');
  assert.equal(send('DOWN'), 'move');
  send('RIGHT');
  send('UP');
  send('RIGHT');
  const most = Math.max(...courses.map((c) => c.maxLaps));
  for (let i = 0; i < most + 5; i++) send('UP');
  const values = () => screen.row.cards.map((card) => card.line());
  const chosen = values();
  assert.deepEqual(chosen, ['15', 'BIKES', 'LOW', String(most)]);
  // A circuit takes as many laps as it allows and as many rivals as its grid holds; a LINEAR course one lap.
  send('CONFIRM');
  const groups = names();
  const pick = (title, id) => {
    for (let i = 0; screen.row.cards[screen.index].name !== title; i++) assert.ok(i < 50 && send('RIGHT'), title);
    send('CONFIRM');
    const course = courses.find((c) => c.id === id);
    for (let i = 0; screen.row.cards[screen.index].name !== course.name; i++) assert.ok(i < 50 && send('RIGHT'), id);
    send('CONFIRM');
    send('CONFIRM');
    send('BACK');
    send('BACK');
    return log.runs.at(-1).request;
  };
  assert.ok(groups.includes('POLE POSITION II'));
  const circuit = courses.find((c) => c.id === 'pole-position-ii-fuji');
  const fuji = pick('POLE POSITION II', 'pole-position-ii-fuji');
  assert.deepEqual(
    [fuji.lapCount, fuji.rivalCount, fuji.rivalPool, fuji.traffic],
    [Math.min(most, circuit.maxLaps), Math.min(15, circuit.gridSlots - 1), 'BIKES', 'LOW'],
  );
  const outrun = pick('OUTRUN', 'outrun-a');
  assert.equal(outrun.lapCount, 1);
  // Choosing courses and vehicles changed no rule.
  send('BACK');
  assert.deepEqual(values(), chosen);
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
  assert.deepEqual(
    names(),
    club.classes.map((c) => c.title),
  );
  const free = {
    courseId: 'outrun-b',
    lapCount: 1,
    rivalCount: 0,
    rivalPool: 'ALL',
    traffic: 'OFF',
    vehicleId: vehicles[0].compiledVehicle.id,
    color: null,
    track: null,
  };
  flow.select(free);
  assert.equal(screen.row.cards[screen.index].name, courses.find((c) => c.id === 'outrun-b').name);
  send('BACK');
  assert.equal(screen.row.cards[screen.index].name, 'OUTRUN');
  // Without DEV, an original's course is not offered: its run leads to TITLE.
  const plain = selection({ dev: false });
  plain.flow.select(free);
  assert.equal(plain.screen.row.kind, 'title');
});
