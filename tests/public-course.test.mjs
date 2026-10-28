import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodeContentStore } from '../tools/build/node-content-store.ts';
import { createLayeredStore } from '../tools/authoring/layered-store.ts';
import { derivePublicPictures, publicPictureStore } from '../tools/public-pictures/derive.ts';
import { readPublicPictureTable, PUBLIC_TABLE_PATH } from '../tools/public-pictures/table.ts';
import { scalePublicPicture, mirrorPublicPicture } from '../tools/public-pictures/scaled-picture.ts';
import { readSpriteLodAsset } from '../src/image/sprite.ts';
import { encodeContentJson } from '../src/content/content-manifest.ts';
import { courseElementLeaves, expansionWork } from '../src/course/course-repeat.ts';

const store = createNodeContentStore();
const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

test('public course derives only picture references and body widths and follows original edits', async () => {
  const sourceBytes = await store.read('courses/enduro-racer.course.json');
  const source = json(sourceBytes);
  const changed = structuredClone(source);
  changed.sections[0].profile[0].y += 0.25;
  const overlay = createLayeredStore(
    store,
    new Map([['courses/enduro-racer.course.json', encodeContentJson(changed)]]),
  );
  const files = await derivePublicPictures(overlay);
  const derived = json(files.get('courses/enduro-racer-public.course.json'));
  assert.equal(derived.name, 'ENDURO RACER PUBLIC');
  assert.equal(derived.sections[0].profile[0].y, changed.sections[0].profile[0].y);
  const expected = structuredClone(changed);
  expected.name = derived.name;
  for (let i = 0; i < expected.sections.length; i++) {
    const old = [...courseElementLeaves(expected.sections[i].sprites, '', expansionWork(100000))];
    const next = [...courseElementLeaves(derived.sections[i].sprites, '', expansionWork(100000))];
    assert.equal(old.length, next.length);
    const visited = new Set();
    for (let j = 0; j < old.length; j++) {
      const a = old[j].element,
        b = next[j].element;
      if (visited.has(a)) continue;
      visited.add(a);
      assert.equal(b.image, `public-${a.image}`);
      assert.equal(b.body === null, a.body === null);
      if (a.image === 'enduror-1064a' && a.body) assert.equal(b.body.width, 0.9);
      if (a.image === 'enduror-10456' && a.body) assert.equal(b.body.width, a.body.width);
      assert.ok(files.has(`images/${b.image}.json`));
      a.image = b.image;
      if (a.body) a.body.width = b.body.width;
    }
  }
  assert.deepEqual(derived, expected);
  assert.deepEqual(await store.read('courses/enduro-racer.course.json'), sourceBytes);
  const visible = await publicPictureStore(store);
  const names = await visible.list('courses');
  assert.equal(names[names.indexOf('enduro-racer.course.json') + 1], 'enduro-racer-public.course.json');
});

test('public anchor corrections preserve the source and mirrored frames reverse the corrected anchor', async () => {
  const table = readPublicPictureTable(json(await store.read(PUBLIC_TABLE_PATH)));
  const asset = readSpriteLodAsset(json(await store.read('images/enduror-1064a.json')));
  const settings = { ...table.pictures['enduror-1064a'], height: 6, anchor: { x: 55, y: 100 }, anchorHeight: null };
  const { master } = scalePublicPicture(asset, settings);
  assert.ok(Math.abs((master.anchorY + 0.5) / 40 - 6) < 1 / 40);
  assert.equal(master.anchorX, (55.5 * master.width) / asset.width - 0.5);
  const mirrored = mirrorPublicPicture(master);
  assert.equal(mirrored.anchorX, master.width - 1 - master.anchorX);
  assert.deepEqual(mirrorPublicPicture(mirrored).levels, master.levels);
  assert.equal(asset.anchorY, asset.height - 0.5);
  const raised = scalePublicPicture(asset, { ...settings, anchorHeight: 0.5 }).master;
  assert.equal(raised.height - 0.5 - raised.anchorY, 20);
  assert.ok(Math.abs((raised.anchorY + 0.5) / 40 - 6) < 2 / 40);
});

test('public table rejects ambiguous names and unrecognized settings', async () => {
  const table = json(await store.read(PUBLIC_TABLE_PATH));
  table.pictures['enduror-103ca'].name = table.pictures['enduror-10398'].name;
  assert.throws(() => readPublicPictureTable(table));
});
