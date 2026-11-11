import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { compileFrontEndSelection, FRONT_END_SELECTION_FORMAT } from '../../src/content/front-end-selection.js';

const DOCUMENT = 'content/front-end/selection.json';
const track = (id) => Object.freeze({ id });
const music = [track('placeholder-one'), track('placeholder-two')];
const series = (id, dev = false) =>
  Object.freeze({
    id,
    dev,
    title: id.toUpperCase(),
    description: `${id} described`,
    music: { title: music[0] },
    classes: [],
  });
// A listed series' entry: one with a document names nothing, one without names its title track, title and description.
const listed = (id, music = null) =>
  music === null
    ? { id, music, title: null, description: null }
    : { id, music, title: id.toUpperCase(), description: `${id} described` };
const picture = (columns = 40, rows = 30, opaque = true) => Object.freeze({ columns, rows, opaque });
const catalog = (...all) => Object.freeze({ series: all, seriesClass: () => null });
const document = (seriesEntries) => ({ ...FRONT_END_SELECTION_FORMAT, series: seriesEntries });
// The selection admitted as the build admits it: the selection, or the one diagnostic's path and message.
const admitted = (
  value,
  { all = [series('club')], pictures = new Map([['club', picture()]]), tracks = music } = {},
) => {
  const result = compileFrontEndSelection(
    { id: 'selection', path: DOCUMENT, value },
    catalog(...all),
    pictures,
    tracks,
  );
  return result.ok ? result.value : { path: result.diagnostics[0].path, message: result.diagnostics[0].message };
};

test('the authored selection lists the series', async () => {
  const value = JSON.parse(await readFile(new URL(`../../${DOCUMENT}`, import.meta.url), 'utf8'));
  // Every listed series has its screen picture, so SELECT SERIES shows them all, in the list's order, one with a
  // document takes its track from it, and one without names a delivered track.
  const authored = async (directory) =>
    (await readdir(new URL(`../../content/${directory}/`, import.meta.url)))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  const selection = admitted(value, {
    all: (await authored('series')).map((name) => series(name.slice(0, -'.series'.length))),
    pictures: new Map((await authored('screen-pictures')).map((id) => [id, picture()])),
    tracks: (await authored('music')).map(track),
  });
  assert.deepEqual(
    selection.seriesRow(false).map((s) => s.id),
    value.series.map((entry) => entry.id),
  );
  assert.equal(selection.unpictured, 0);
});

test('a listed series shows once its picture exists, and the series admit only what is whole', () => {
  // A series with no picture yet is passed over and counted; one with no document yet names its title track.
  const selection = admitted(
    document([listed('club'), listed('tribute', 'placeholder-two'), listed('later', 'placeholder-one')]),
    {
      all: [series('club'), series('lab', true)],
      pictures: new Map([
        ['club', picture()],
        ['tribute', picture()],
        ['lab', picture()],
      ]),
    },
  );
  assert.deepEqual(
    selection.seriesRow(false).map((s) => [s.id, s.series?.id ?? null, s.titleTrack.id, s.name, s.description]),
    [
      ['club', 'club', 'placeholder-one', 'CLUB', 'club described'],
      ['tribute', null, 'placeholder-two', 'TRIBUTE', 'tribute described'],
    ],
  );
  // DEV series follow the list with dev=1.
  assert.deepEqual(
    selection.seriesRow(true).map((s) => s.id),
    ['club', 'tribute', 'lab'],
  );
  assert.equal(selection.unpictured, 1);

  // Each failure names what fails.
  assert.deepEqual(admitted(document([])), { path: '/series', message: 'Series club is not listed' });
  assert.deepEqual(admitted(document([listed('club', 'placeholder-one')])), {
    path: '/series/0/music',
    message: 'Series club takes its title track, title and description from its document',
  });
  assert.deepEqual(admitted(document([listed('club'), listed('new')])), {
    path: '/series/1/music',
    message: 'Series new has no document yet and names its title track, title and description',
  });
  assert.deepEqual(admitted(document([listed('club'), listed('new', 'none')])), {
    path: '/series/1/music',
    message: 'Unknown track none',
  });
  assert.deepEqual(admitted(document([listed('club'), { ...listed('new', 'placeholder-one'), title: null }])), {
    path: '/series/1/title',
    message: 'Series new has no document yet and names its title track, title and description',
  });
  assert.deepEqual(admitted(document([listed('club')]), { pictures: new Map([['club', picture(36, 14)]]) }), {
    path: '/series/0/id',
    message: 'The picture club is an opaque 40×30-tile picture',
  });
  assert.deepEqual(
    admitted(document([listed('club'), listed('lab')]), {
      all: [series('club'), series('lab', true)],
    }),
    { path: '/series/1/id', message: 'DEV series lab is not listed' },
  );
});
