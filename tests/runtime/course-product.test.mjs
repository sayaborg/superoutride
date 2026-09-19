import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { PNG } from 'pngjs';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { courseBoundaryAt } from '../../dist/course/course-bands.js';
import { readCourseImages } from '../../tools/course/read-course-images.mjs';
import { installBrowserDom } from '../helpers/browser-dom.mjs';

const file = new URL('../../content/courses/linear.course.json', import.meta.url);
const document = JSON.parse(await readFile(file, 'utf8'));
const images = await readCourseImages(document.assets, new URL('../../content/images/', import.meta.url).pathname);

test('saved rows follow varying boundaries, retain canonical assets, and reject excessive expansion', async () => {
  const result = await compileCourseDocument(document, images);
  assert.equal(result.ok, true);
  const section = result.value.entry;
  const row = document.sections[0].presentation.sceneryRows[0];
  const boundary = section.boundaries.find((b) => b.id === row.boundaryId);
  const placements = section.presentation.scenery.filter((p) => JSON.parse(p.id)[1] === row.id);
  assert.ok(placements.length > 50);
  for (let i = 0; i < placements.length; i += 1) {
    const p = placements[i];
    assert.equal(p.l, courseBoundaryAt(boundary, p.anchor.s) - row.offset);
    assert.equal(
      p.instance.asset,
      result.value.assets.find((a) => a.id === row.assetId),
    );
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.instance));
    if (i) assert.ok(Math.abs(p.anchor.s - placements[i - 1].anchor.s - row.spacing) < 1e-9);
  }
  assert.equal(new Set(section.presentation.scenery.map((p) => p.instance)).size, section.presentation.scenery.length);
  const invalid = structuredClone(document);
  invalid.sections[0].presentation.sceneryRows[0].spacing = 0.001;
  const rejected = await compileCourseDocument(invalid, images);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some((d) => d.code === 'resource_limit'));
});

test('production CLI renders saved car and bike scenes at curves and strip edges', async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'course-product-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const [s, l, vehicle] of [
    [180, 0, 'TESTAROSSA'],
    [1200, 17, 'VFR750R'],
  ]) {
    const output = path.join(temporary, `${vehicle}.png`);
    const report = JSON.parse(
      execFileSync(
        process.execPath,
        [
          'tools/course/course.mjs',
          'render',
          file.pathname,
          '--s',
          String(s),
          '--l',
          String(l),
          '--vehicle',
          vehicle,
          '--out',
          output,
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(report.ok, true);
    assert.equal(report.render.stats.groundMapBaked, false);
    assert.equal(report.render.stats.groundMapMaxLevel, 0);
    const png = PNG.sync.read(await readFile(output));
    assert.deepEqual([png.width, png.height], [320, 240]);
    assert.ok(new Set(png.data).size > 10);
  }
});

test('actual browser root loads saved content and runs input, recovery, vehicle selection and frame rendering', async (t) => {
  const dom = installBrowserDom(t, '?mode=trial');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url.pathname);
    return new Response(await readFile(url));
  });
  const create = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => {
    const element = create(tag);
    element.remove = () => {};
    element.append = (...children) => element.children.push(...children);
    return element;
  };
  dom.elements.get('game').insertAdjacentElement = () => {};
  await import('../../dist/main-course.js');
  assert.equal(requests.filter((url) => url.endsWith('.course.json')).length, 1);
  assert.equal(requests.filter((url) => url.includes('/images/')).length, images.length);
  assert.ok(requests.every((url) => !url.includes('ground-pages')));
  dom.win.emit('keydown', { code: 'ArrowUp', preventDefault() {} });
  dom.frame(17);
  dom.frame(34);
  dom.elements
    .get('vehicle-selector-buttons')
    .children.find((e) => e.textContent === 'RC30')
    .emit('click');
  dom.win.emit('keydown', { code: 'Backspace', preventDefault() {} });
  dom.frame(51);
  assert.ok(dom.calls.filter((c) => c[0] === 'putImageData').length >= 4);
});
