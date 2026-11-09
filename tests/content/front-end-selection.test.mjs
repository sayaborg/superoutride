import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { compileFrontEndSelection, FRONT_END_SELECTION_FORMAT } from '../../src/content/front-end-selection.js';

const DOCUMENT = 'content/front-end/selection.json';
const track = (id) => Object.freeze({ id });
const music = [track('placeholder-one'), track('placeholder-two')];
const series = (id, dev = false) => Object.freeze({ id, dev, music: { title: music[0] }, classes: [] });
const picture = (columns = 40, rows = 30, opaque = true) => Object.freeze({ columns, rows, opaque });
const catalog = (...all) => Object.freeze({ series: all, seriesClass: () => null });
const document = (seriesEntries, originals) => ({
  ...FRONT_END_SELECTION_FORMAT,
  series: seriesEntries,
  originals,
});
// The selection admitted as the build admits it: the selection, or the one diagnostic's path and message.
const admitted = (
  value,
  { all = [series('club')], pictures = new Map([['club', picture()]]), tracks = music, courses = [] } = {},
) => {
  const result = compileFrontEndSelection(
    { id: 'selection', path: DOCUMENT, value },
    catalog(...all),
    pictures,
    tracks,
    courses,
  );
  return result.ok ? result.value : { path: result.diagnostics[0].path, message: result.diagnostics[0].message };
};

test('the authored selection lists the series and groups every course of the course texts once', async () => {
  const value = JSON.parse(await readFile(new URL(`../../${DOCUMENT}`, import.meta.url), 'utf8'));
  const texts = JSON.parse(await readFile(new URL('../../content/course-texts.json', import.meta.url), 'utf8'));
  // The groups hold the course texts' courses, each once and in their order, TSUKUBA last.
  assert.deepEqual(
    value.originals.flatMap((group) => group.courses),
    texts.courses.map((course) => course.id),
  );
  // Every listed series has its screen picture, so SELECT SERIES shows them all, in the list's order, and one without a
  // document names a delivered track.
  const authored = async (directory) =>
    (await readdir(new URL(`../../content/${directory}/`, import.meta.url)))
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  const selection = admitted(value, {
    all: [series('tsukuba-clubman')],
    pictures: new Map((await authored('screen-pictures')).map((id) => [id, picture()])),
    tracks: (await authored('music')).map(track),
    courses: ['tsukuba', 'outrun-a'],
  });
  assert.deepEqual(
    selection.seriesRow(false).map((s) => s.id),
    value.series.map((entry) => entry.id),
  );
  assert.equal(selection.unpictured, 0);
  assert.deepEqual(
    selection.groups(new Set(['tsukuba'])).map((group) => [group.title, group.courses]),
    [['SUPER OUTRIDE', ['tsukuba']]],
  );
});

test('a listed series shows once its picture exists, and the series and groups admit only what is whole', () => {
  // A series with no picture yet is passed over and counted; one with no document yet names its title track.
  const selection = admitted(
    document(
      [
        { id: 'club', music: null },
        { id: 'tribute', music: 'placeholder-two' },
        { id: 'later', music: 'placeholder-one' },
      ],
      [
        { title: 'OUTRUN', courses: ['outrun-a', 'outrun-b'] },
        { title: 'OWN', courses: ['tsukuba'] },
      ],
    ),
    {
      all: [series('club'), series('lab', true)],
      pictures: new Map([
        ['club', picture()],
        ['tribute', picture()],
        ['lab', picture()],
      ]),
      courses: ['outrun-a', 'outrun-a-product', 'tsukuba'],
    },
  );
  assert.deepEqual(
    selection.seriesRow(false).map((s) => [s.id, s.series?.id ?? null, s.titleTrack.id]),
    [
      ['club', 'club', 'placeholder-one'],
      ['tribute', null, 'placeholder-two'],
    ],
  );
  // DEV series follow the list with dev=1.
  assert.deepEqual(
    selection.seriesRow(true).map((s) => s.id),
    ['club', 'tribute', 'lab'],
  );
  assert.equal(selection.unpictured, 1);
  // A course not delivered is passed over; a product course stands after its original.
  assert.deepEqual(
    selection.groups(new Set(['outrun-a', 'outrun-a-product', 'tsukuba'])).map((g) => g.courses),
    [['outrun-a', 'outrun-a-product'], ['tsukuba']],
  );
  assert.equal(selection.groupOf('outrun-a-product').title, 'OUTRUN');
  assert.deepEqual(
    selection.groups(new Set(['tsukuba'])).map((g) => g.title),
    ['OWN'],
  );

  // Each failure names what fails.
  const groups = [{ title: 'OWN', courses: ['tsukuba'] }];
  assert.deepEqual(admitted(document([], groups)), { path: '/series', message: 'Series club is not listed' });
  assert.deepEqual(admitted(document([{ id: 'club', music: 'placeholder-one' }], groups)), {
    path: '/series/0/music',
    message: 'Series club takes its title track from its document',
  });
  assert.deepEqual(
    admitted(
      document(
        [
          { id: 'club', music: null },
          { id: 'new', music: null },
        ],
        groups,
      ),
    ),
    {
      path: '/series/1/music',
      message: 'Series new has no document yet and names its title track',
    },
  );
  assert.deepEqual(
    admitted(
      document(
        [
          { id: 'club', music: null },
          { id: 'new', music: 'none' },
        ],
        groups,
      ),
    ),
    {
      path: '/series/1/music',
      message: 'Unknown track none',
    },
  );
  assert.deepEqual(
    admitted(document([{ id: 'club', music: null }], groups), { pictures: new Map([['club', picture(36, 14)]]) }),
    { path: '/series/0/id', message: 'The picture club is an opaque 40×30-tile picture' },
  );
  assert.deepEqual(
    admitted(
      document(
        [
          { id: 'club', music: null },
          { id: 'lab', music: null },
        ],
        groups,
      ),
      {
        all: [series('club'), series('lab', true)],
      },
    ),
    { path: '/series/1/id', message: 'DEV series lab is not listed' },
  );
  assert.deepEqual(admitted(document([{ id: 'club', music: null }], groups), { courses: ['tsukuba', 'outrun-a'] }), {
    path: '/originals',
    message: 'Course outrun-a is in no group',
  });
  assert.deepEqual(
    admitted(
      document(
        [{ id: 'club', music: null }],
        [
          { title: 'OWN', courses: ['tsukuba'] },
          { title: 'MORE', courses: ['tsukuba'] },
        ],
      ),
    ),
    { path: '/originals/1/courses/0', message: 'Course tsukuba is in two groups' },
  );
});
