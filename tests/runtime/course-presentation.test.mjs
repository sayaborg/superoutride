import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { parseCourseDocument, readCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { createCourseGroundSource } from '../../dist/groundmap/course-ground-source.js';
import { createBandSurfaceReader } from '../../dist/physics/band-surface-reader.js';
import { presentationDocument } from '../helpers/course-presentation-documents.mjs';
import { savedImageInput } from '../helpers/course-image-input.mjs';

const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result));
  return result.value;
};
const compile = async ({ document, inputs }) => ok(await compileCourseDocument(document, inputs));
const at = (s) => ({ kind: 'absolute', s });
const failure = (result, code, location) => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.equal(result.diagnostics[0].kind, 'input');
  assert.equal(result.diagnostics[0].code, code);
  if (location) assert.equal(result.diagnostics[0].path, location);
};

test('v4 distinguishes explicitly absent presentation from complete saved content and rejects implicit migrations', async () => {
  const fixture = await presentationDocument();
  for (const version of [1, 2, 3]) {
    const document = structuredClone(fixture.document);
    document.version = version;
    failure(readCourseDocument(document), 'unsupported_version', '/version');
  }
  for (const key of ['presentation', 'assetIds']) {
    const document = structuredClone(fixture.document);
    delete document.sections[0][key];
    failure(readCourseDocument(document), 'invalid_shape', `/sections/0/${key}`);
  }
  const saved = ok(saveCourseDocument(fixture.document));
  assert.deepEqual(ok(parseCourseDocument(saved)), fixture.document);
  const geometryOnly = structuredClone(fixture.document);
  geometryOnly.sections.forEach((section) => {
    section.presentation = null;
  });
  assert.equal(ok(await compileCourseDocument(geometryOnly, fixture.inputs)).entry.presentation, null);
});

test('ground, environment and shared scenery resolve canonical references with immutable ownership', async () => {
  const fixture = await presentationDocument(),
    product = await compile(fixture),
    p = product.entry.presentation;
  assert.equal(p.ground.partition, product.entry.bandPartition);
  assert.equal(p.ground.bands[0].band, product.entry.bandPartition.bands[0]);
  assert.equal(p.ground.bands[0].sections[0].paint.asset, product.assets[0]);
  assert.equal(p.environments[0].background.asset, product.assets[2]);
  assert.equal(p.scenery[0].instance, product.sceneryInstances[0]);
  assert.equal(p.scenery[0].instance.asset, product.assets[1]);
  assert.equal(product.sections[1].presentation.scenery[0].instance, p.scenery[0].instance);
  const seen = new Set();
  function frozen(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.ok(Object.isFrozen(value));
    assert.equal(value instanceof Map || ArrayBuffer.isView(value), false);
    Object.values(value).forEach(frozen);
  }
  frozen(product);
  assert.throws(() => {
    p.ground.bands[0].sections[0].paint.phaseS = 5;
  }, TypeError);
  fixture.document.sections[0].presentation.ground.baseRgb555 = 0;
  assert.equal(p.ground.baseRgb555, 0x1111);
  const reopened = await compile({
    document: ok(parseCourseDocument(ok(saveCourseDocument(fixture.document)))),
    inputs: fixture.inputs,
  });
  assert.notEqual(reopened.identity.buildSha256, product.identity.buildSha256);
});

test('source paint preserves 40-texel metric phase, transparency, opaque black and static A/B without changing pixels', async () => {
  const fixture = await presentationDocument();
  const paint = fixture.document.sections[0].presentation.ground.bands[0].sections[0].paint;
  paint.alternate = { paletteRgb555: [0, 0x001f, 0x7fff], spanS: 10, spanL: 2 };
  const product = await compile(fixture),
    source = createCourseGroundSource(product.entry.presentation.ground);
  assert.equal(source.sample(0.0125, 0.0125), 0x1111);
  assert.equal(source.sample(0.0125, 0.0375), 0);
  assert.equal(source.sample(1.0125, 1.0625), 0x7c00);
  assert.equal(source.sample(11.0125, 1.0625), 0x001f);
  assert.equal(source.sample(0.0125, -0.0125), 0x7fff, 'negative stripe index wraps to alternate B');
  assert.deepEqual(product.assets[0].source, fixture.images[0].source, 'variant mapping never edits the master');
  assert.throws(() => source.sample(0, 12), RangeError);
  assert.throws(() => source.sample(-0.001, 0), RangeError);
  assert.throws(() => source.sample('0', 0), TypeError);
});

test('appearance profiles and half-open Band edges are independent of physical bindings and declaration order', async () => {
  const fixture = await presentationDocument('linear'),
    section = fixture.document.sections[0];
  section.presentation.ground.bands[0].sections[0].paint.phaseL = -0.03125;
  section.presentation.ground.bands[0].sections.push({ anchor: at(50), paint: null });
  section.presentation.ground.bands[1].sections[0].paint.assetId = 'sky';
  const product = await compile(fixture),
    p = product.entry.presentation,
    source = createCourseGroundSource(p.ground);
  const surfaces = createBandSurfaceReader(product.entry.bandPartition, product.entry.physicalBindings);
  assert.equal(source.sample(0.0125, -0.000001), 0);
  assert.equal(source.sample(0.0125, 0), 0x001f, 'shared edge belongs to the right Band');
  assert.equal(source.sample(0.0125, 0.000001), 0x001f);
  assert.equal(source.sample(0.0125, -4.000001), 0x1111);
  assert.equal(source.sample(0.0125, -4), 0);
  assert.equal(source.sample(0.0125, 5.999999), 0x001f);
  assert.equal(source.sample(50, -0.0125), 0x1111, 'profile change owns its station');
  assert.equal(source.sample(0.0125, 6), 0x1111, 'outer right Band edge reveals base');
  assert.equal(surfaces.sample(0.0125, -0.0125).material, surfaces.sample(0.0125, 0.0125).material);
  const physics = product.entry.physicalBindings;
  section.presentation.ground.bands.reverse();
  section.bands.reverse();
  section.assetIds.reverse();
  fixture.document.assets.reverse();
  fixture.inputs.reverse();
  const reordered = await compile(fixture),
    other = createCourseGroundSource(reordered.entry.presentation.ground);
  for (const s of [0.0125, 49.9875, 50, 50.0125])
    for (const l of [-4, -0.0125, 0, 0.0125, 6]) assert.equal(other.sample(s, l), source.sample(s, l));
  assert.deepEqual(reordered.entry.physicalBindings, physics);
});

test('stamp placement rounds positive and negative half cells toward positive and applies ordered opaque coverage', async () => {
  const fixture = await presentationDocument(),
    p = fixture.document.sections[0].presentation;
  p.ground.bands[0].sections[0].paint = null;
  p.ground.stamps = [-0.0375, -0.0125, 0.0125, 0.0375].map((l, i) => ({
    id: `stamp-${i}`,
    assetId: 'stamp',
    anchor: at(10 + i),
    l,
  }));
  let product = await compile(fixture),
    stamps = product.entry.presentation.ground.stamps;
  assert.deepEqual(
    stamps.map((stamp) => stamp.gridL),
    [-1, 0, 1, 2],
  );
  assert.deepEqual(
    stamps.map((stamp) => stamp.gridS),
    [400, 440, 480, 520],
  );
  let source = createCourseGroundSource(product.entry.presentation.ground);
  assert.equal(source.sample(10.0125, -0.0125), 0x7fff);
  assert.equal(source.sample(10.0125, 0.0125), 0x1111);
  assert.equal(source.sample(10.0375, 0.0125), 0, 'opaque black overwrites the base');
  p.ground.stamps.push({ id: 'later', assetId: 'stamp', anchor: at(10.025), l: 0 });
  product = await compile(fixture);
  source = createCourseGroundSource(product.entry.presentation.ground);
  assert.equal(source.sample(10.0375, 0.0125), 0x7fff, 'later opaque stamp wins');
  assert.equal(product.entry.presentation.ground.stamps[0].asset, product.assets[3]);
});

test('primitive placements replay geometry edits while numeric paint phases retain their saved meaning', async () => {
  const fixture = await presentationDocument('linear'),
    p = fixture.document.sections[0].presentation;
  const anchor = { kind: 'primitive', primitiveId: 'approach', fraction: 0.5 };
  p.ground.stamps = [{ id: 'anchored', assetId: 'stamp', anchor, l: 0 }];
  p.scenery[0].anchor = anchor;
  p.ground.bands[0].sections[0].paint.phaseS = -2.5;
  const first = await compile(fixture),
    stamp = first.entry.presentation.ground.stamps[0];
  assert.equal(stamp.anchor.primitive, first.entry.primitives[0]);
  assert.equal(stamp.anchor.s, 50);
  assert.equal(first.entry.presentation.scenery[0].anchor.primitive, first.entry.primitives[0]);
  fixture.document.sections[0].primitives[0].length = 120;
  const next = await compile(fixture),
    nextStamp = next.entry.presentation.ground.stamps[0];
  assert.equal(nextStamp.anchor.s, 60);
  assert.equal(nextStamp.gridS - stamp.gridS, 400);
  assert.equal(next.entry.presentation.ground.bands[0].sections[0].paint.phaseS, -2.5);
  assert.notEqual(next.identity.buildSha256, first.identity.buildSha256);
});

test('missing and inconsistent presentation stays a semantic draft and fails before publication', async () => {
  for (const [change, code] of [
    [
      (p) => {
        p.ground.bands = [];
      },
      'appearance_binding',
    ],
    [
      (p) => {
        p.ground.bands.push(structuredClone(p.ground.bands[0]));
      },
      'appearance_binding',
    ],
    [
      (p) => {
        p.ground.bands[0].bandId = 'lost';
      },
      'unresolved_reference',
    ],
    [
      (p) => {
        p.ground.bands[0].sections = [];
      },
      'invalid_profile',
    ],
    [
      (p) => {
        p.ground.bands[0].sections[0].anchor = at(1);
      },
      'invalid_profile',
    ],
    [
      (p) => {
        p.ground.bands[0].sections[0].paint.assetId = 'lost';
      },
      'unresolved_reference',
    ],
    [
      (p) => {
        p.ground.bands[0].sections[0].paint.alternate = { paletteRgb555: [1], spanS: 1, spanL: 1 };
      },
      'appearance_binding',
    ],
    [
      (p) => {
        p.environments = [];
      },
      'invalid_profile',
    ],
    [
      (p) => {
        p.environments[0].background.horizonY = 100;
      },
      'invalid_image_role',
    ],
    [
      (p) => {
        p.environments[0].background.assetId = 'tree';
      },
      'invalid_image_role',
    ],
    [
      (p) => {
        p.scenery[0].instanceId = 'lost';
      },
      'unresolved_reference',
    ],
  ]) {
    const fixture = await presentationDocument();
    change(fixture.document.sections[0].presentation);
    ok(saveCourseDocument(fixture.document));
    failure(await compileCourseDocument(fixture.document, fixture.inputs), code);
  }
});

test('ground/background reject lower sprite pyramids and malformed placement coordinates without substituting content', async () => {
  const fixture = await presentationDocument(),
    source = structuredClone(fixture.images[0].source);
  source.levels.push({ paletteRgb555: [0], indices: [1, 1] });
  const image = savedImageInput('tile', source);
  fixture.document.assets[0] = image.reference;
  fixture.inputs[0] = image.input;
  failure(await compileCourseDocument(fixture.document, fixture.inputs), 'invalid_image_role');
  const bad = await presentationDocument();
  bad.document.sections[0].presentation.ground.stamps.push({ id: 'stamp', assetId: 'stamp', anchor: at(10), l: 0 });
  const stamp = savedImageInput('stamp', { ...bad.images[3].source, anchorX: 1e300 });
  bad.document.assets[3] = stamp.reference;
  bad.inputs[3] = stamp.input;
  failure(await compileCourseDocument(bad.document, bad.inputs), 'invalid_placement');
});

test('presentation imports are atomic and edits invalidate while retaining canonical prior source products', async () => {
  const fixture = await presentationDocument(),
    project = createCourseProject();
  const initial = ok(await project.importDocument(JSON.stringify(fixture.document), fixture.inputs)),
    state = project.getState();
  fixture.document.sections[0].presentation.ground.bands = [];
  failure(await project.importDocument(JSON.stringify(fixture.document), fixture.inputs), 'appearance_binding');
  assert.equal(project.getState(), state);
  ok(project.editDocument(fixture.document));
  failure(await project.compile(fixture.inputs), 'appearance_binding');
  assert.equal(project.getState().lastSuccessful, initial);
  assert.equal(project.exportCompiled().reason, 'stale_source');
});

test('public compiler reports actual saved presentation and source color without generating resident images', async () => {
  const fixture = await presentationDocument(),
    directory = await mkdtemp(path.join(tmpdir(), 'superoutride-presentation-'));
  try {
    const file = path.join(directory, 'course.json'),
      text = ok(saveCourseDocument(fixture.document));
    await writeFile(file, text);
    for (const input of fixture.inputs) await writeFile(path.join(directory, `${input.sha256}.json`), input.bytes);
    const run = spawnSync(process.execPath, ['tools/course/compile-course.mjs', file, '--images', directory], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout).sections[0].presentation, {
      bandBindings: 1,
      stamps: 0,
      environments: 1,
      scenery: 1,
      groundOriginRgb555: 0x1111,
    });
    assert.equal(await readFile(file, 'utf8'), text);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
