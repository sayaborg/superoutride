import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { COURSE_IMAGE_SOURCE_RECIPE, compileCourseImageSources } from '../../dist/compiler/course-image-source.js';
import { createCourseProject } from '../../dist/authoring/course-project.js';
import { readCourseDocument, saveCourseDocument } from '../../dist/course/course-document.js';
import { readSpriteLodAsset, drawScaledSprite, SPRITE_TRANSPARENT } from '../../dist/graphics/sprite.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { SoftwareSurface, rgba } from '../../dist/graphics/software-surface.js';
import { imageInput, savedImageInput } from '../helpers/course-image-input.mjs';

const fixtureText = await readFile(new URL('../fixtures/linked-linear.course.json', import.meta.url), 'utf8');
const documentWith = (images) => {
  const document = JSON.parse(fixtureText);
  document.assets = images.map((image) => image.reference);
  for (const section of document.sections) section.assetIds = document.assets.map((asset) => asset.id);
  return document;
};
const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result));
  return result.value;
};
const failures = (result, codes, serialized = false) => {
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    codes,
  );
  if (!serialized) assert.ok(Object.isFrozen(result) && Object.isFrozen(result.diagnostics));
  for (const diagnostic of result.diagnostics) {
    assert.equal(diagnostic.kind, 'asset');
    assert.equal('path' in diagnostic, false, 'external byte errors are not fictitious document pointers');
    if (!serialized) assert.ok(Object.isFrozen(diagnostic) && Object.isFrozen(diagnostic.assetIndices));
  }
  return result.diagnostics;
};
const compile = (images) =>
  compileCourseDocument(
    documentWith(images),
    images.map((image) => image.input),
  );

test('saved images resolve once into the canonical reference graph with shared owned indexed sources', async () => {
  const image = imageInput('constructor'),
    alias = { ...image, reference: { ...image.reference, id: '共用/~' } };
  const document = documentWith([image, alias]);
  const course = ok(await compileCourseDocument(document, [image.input]));
  assert.equal(course.assets.length, 2);
  assert.notEqual(course.assets[0], course.assets[1]);
  assert.equal(course.assets[0].source, course.assets[1].source);
  assert.deepEqual(course.assets[0].source, image.source);
  for (const section of course.sections) {
    assert.equal(section.assets[0], course.assets[0]);
    assert.equal(section.assets[1], course.assets[1]);
  }
  assert.equal(course.links[0].destination.section.assets[0], course.assets[0]);
  const seen = new Set();
  function frozen(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    assert.ok(Object.isFrozen(value));
    assert.equal(value instanceof Map || value instanceof Set || ArrayBuffer.isView(value), false);
    Object.values(value).forEach(frozen);
  }
  frozen(course);
  assert.throws(() => {
    course.assets[0].source.levels[0].indices[0] = 1;
  }, TypeError);
  assert.throws(() => {
    course.assets[0].source.levels[0].paletteRgb555.push(3);
  }, TypeError);
  const again = ok(await compileCourseDocument(document, [image.input]));
  assert.deepEqual(again.identity, course.identity);
  assert.notEqual(again.assets[0].source, course.assets[0].source);
});

test('source bytes are copied before digest suspension and no caller-owned image state is published', async () => {
  const image = imageInput(),
    document = documentWith([image]),
    inputs = [image.input];
  const expected = structuredClone(image.source);
  const pending = compileCourseDocument(document, inputs);
  image.input.bytes.fill(0);
  inputs.length = 0;
  document.assets[0].id = 'changed';
  document.sections[0].assetIds.length = 0;
  image.source.levels[0].indices.fill(0);
  const product = ok(await pending);
  assert.deepEqual(product.assets[0].source, expected);
  assert.equal(product.entry.assets[0], product.assets[0]);
  assert.equal(product.assets[0].id, 'image');
});

test('admitted source uses the ordinary sprite reader and actual blitter with opaque black and transparency', async () => {
  const image = imageInput(),
    product = ok(await compile([image]));
  const asset = readSpriteLodAsset(product.assets[0].source),
    target = new SoftwareSurface(4, 2);
  const background = rgba(2, 3, 4);
  target.clear(background);
  const result = drawScaledSprite(target, asset, 2, 1.5, 40);
  assert.equal(result.writtenPixels, 6);
  assert.equal(asset.worldWidthMeters, 0.1);
  assert.equal(asset.levels[0].pixels[0], SPRITE_TRANSPARENT);
  assert.notEqual(asset.levels[0].pixels[1], SPRITE_TRANSPARENT);
  assert.deepEqual(
    [...target.pixels],
    image.source.levels[0].indices.map((index) =>
      index ? rgb555ToRgba(image.source.levels[0].paletteRgb555[index - 1]) : background,
    ),
  );
  asset.levels[0].pixels.fill(0);
  assert.deepEqual(product.assets[0].source, image.source, 'decoded consumer workspace cannot mutate the source');
});

test('all missing digests are reported with every referring declaration, while drafts remain saveable', async () => {
  const a = imageInput('a'),
    b = imageInput('b'),
    alias = { ...a, reference: { ...a.reference, id: 'alias' } };
  const document = documentWith([a, b, alias]);
  assert.deepEqual(ok(readCourseDocument(document)), document);
  assert.equal(typeof ok(saveCourseDocument(document)), 'string');
  const diagnostics = failures(await compileCourseDocument(document), ['asset_missing', 'asset_missing']);
  assert.deepEqual(
    diagnostics.map((d) => d.assetIndices),
    [[0, 2], [1]],
  );
  assert.deepEqual(
    diagnostics.map((d) => d.sha256),
    [a.reference.sha256, b.reference.sha256],
  );
});

test('duplicate and undeclared byte inputs fail explicitly without publishing an otherwise valid graph', async () => {
  const a = imageInput('a'),
    b = imageInput('b');
  failures(await compileCourseDocument(documentWith([a]), [a.input, a.input, b.input]), [
    'asset_duplicate',
    'asset_unreferenced',
  ]);
  failures(await compileCourseDocument(documentWith([]), [a.input]), ['asset_unreferenced']);
});

test('independent digest, UTF-8/JSON and image failures aggregate in document order', async () => {
  const mismatch = imageInput('mismatch');
  mismatch.input.bytes[0] ^= 1;
  const malformed = savedImageInput('parse', new Uint8Array([0xff, 0xc0]));
  const invalid = savedImageInput('invalid', { ...imageInput().source, width: 0 });
  const images = [mismatch, malformed, invalid];
  const diagnostics = failures(
    await compileCourseDocument(documentWith(images), images.map((i) => i.input).reverse()),
    ['asset_digest_mismatch', 'asset_parse_failure', 'asset_invalid_image'],
  );
  assert.deepEqual(
    diagnostics.map((d) => d.assetIndices),
    [[0], [1], [2]],
  );
  assert.deepEqual(
    diagnostics.map((d) => d.inputIndex),
    [2, 1, 0],
  );
  const json = savedImageInput('json', new TextEncoder().encode('{ broken'));
  failures(await compile([json]), ['asset_parse_failure']);
});

test('shared image admission retains the complete existing format, palette, lattice and metric rules', async () => {
  for (const change of [
    (s) => {
      s.crop = {};
    },
    (s) => {
      s.version = 2;
    },
    (s) => {
      s.anchorX = 'center';
    },
    (s) => {
      s.levels[0].indices.pop();
    },
    (s) => {
      s.levels[0].indices[0] = 4;
    },
    (s) => {
      s.levels[0].paletteRgb555 = [0, 0, 2];
    },
    (s) => {
      s.levels[0].paletteRgb555 = [0, 0x8000, 2];
    },
    (s) => {
      s.levels = [];
    },
  ]) {
    const source = imageInput().source;
    change(source);
    failures(await compile([savedImageInput('invalid', source)]), ['asset_invalid_image']);
  }
  const transparent = imageInput().source;
  transparent.levels[0] = { paletteRgb555: [], indices: Array(8).fill(0) };
  ok(await compile([savedImageInput('transparent', transparent)]));
});

test('resource admission bounds bytes before copying and master texels before decoded allocation', async () => {
  const image = imageInput();
  const oversized = { ...image.input, bytes: new Uint8Array(COURSE_IMAGE_SOURCE_RECIPE.maxEncodedBytes + 1) };
  failures(await compileCourseDocument(documentWith([image]), [oversized]), ['resource_limit']);
  const huge = savedImageInput('huge', { ...image.source, width: 1048577, height: 1 });
  failures(await compile([huge]), ['resource_limit']);
  const exact = new Uint8Array(COURSE_IMAGE_SOURCE_RECIPE.maxEncodedBytes).fill(32);
  exact.set(image.input.bytes);
  ok(await compile([savedImageInput('exact', exact)]));
  const many = Array.from({ length: 9 }, (_, i) => {
    const value = imageInput(`image-${i}`);
    return { ...value, input: { ...value.input, bytes: new Uint8Array(COURSE_IMAGE_SOURCE_RECIPE.maxEncodedBytes) } };
  });
  failures(await compile(many), ['resource_limit']);
});

test('unique-source texel accounting admits the exact total and rejects the next image without alias double counting', async () => {
  const source = {
    ...imageInput().source,
    width: 1024,
    height: 1024,
    levels: [{ paletteRgb555: [], indices: Array(1024 * 1024).fill(0) }],
  };
  const images = Array.from({ length: 8 }, (_, i) =>
    savedImageInput(`master-${i}`, { ...source, name: `master-${i}` }),
  );
  const document = documentWith(images),
    alias = { ...images[0].reference, id: 'alias' };
  document.assets.push(alias);
  const exact = ok(
    await compileCourseDocument(
      document,
      images.map((image) => image.input),
    ),
  );
  assert.equal(exact.assets.at(-1).source, exact.assets[0].source);
  assert.equal(
    exact.assets.slice(0, 8).reduce((sum, image) => sum + image.source.width * image.source.height, 0),
    COURSE_IMAGE_SOURCE_RECIPE.maxTotalLevelTexels,
  );
  const extra = imageInput('extra');
  const result = await compile([...images, extra]);
  const diagnostics = failures(result, ['resource_limit']);
  assert.deepEqual(diagnostics[0].assetIndices, [8]);
});

test('API misuse remains TypeError/RangeError rather than authoring diagnostics', async () => {
  const reference = imageInput();
  const refs = ok(readCourseDocument(documentWith([reference]))).assets;
  await assert.rejects(compileCourseImageSources(refs, null), TypeError);
  await assert.rejects(compileCourseImageSources([], Array(1)), TypeError);
  const excess = Array(258).fill(reference.input);
  Object.defineProperty(excess, 257, {
    get() {
      throw new Error('input admission scanned beyond its count bound');
    },
  });
  const rejected = await compileCourseImageSources(refs, excess);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostics.at(-1).code, 'resource_limit');
  assert.equal(rejected.diagnostics.at(-1).inputIndex, 256);
  await assert.rejects(compileCourseImageSources(refs, [{ sha256: reference.reference.sha256, bytes: [] }]), TypeError);
  await assert.rejects(compileCourseImageSources(refs, [{ sha256: 'invalid', bytes: new Uint8Array() }]), RangeError);
  await assert.rejects(
    compileCourseImageSources(refs, [
      { sha256: reference.reference.sha256, bytes: new Uint8Array(new SharedArrayBuffer(8)) },
    ]),
    TypeError,
  );
});

test('exact saved-byte changes invalidate identity, and failed asset imports/builds preserve authoring state', async () => {
  const image = imageInput(),
    document = documentWith([image]),
    text = JSON.stringify(document);
  const project = createCourseProject();
  const original = ok(await project.importDocument(text, [image.input])),
    state = project.getState();
  failures(await project.importDocument(text), ['asset_missing']);
  assert.equal(project.getState(), state);
  assert.equal(ok(project.exportCompiled()), original);
  const spaced = savedImageInput('image', new TextEncoder().encode(JSON.stringify(image.source, null, 2)));
  const edited = documentWith([spaced]);
  ok(project.editDocument(edited));
  assert.equal(project.exportCompiled().reason, 'stale_source');
  failures(await project.compile(), ['asset_missing']);
  assert.equal(project.getState().lastSuccessful, original);
  const next = ok(await project.compile([spaced.input]));
  assert.deepEqual(next.assets[0].source, original.assets[0].source);
  assert.notEqual(next.identity.buildSha256, original.identity.buildSha256);
  const pending = project.compile([spaced.input]);
  edited.sections[0].start.x += 1;
  ok(project.editDocument(edited));
  assert.equal((await pending).reason, 'stale_source');
  assert.equal(project.getState().compiled, null);
});

test('public compiler reads digest-named saved images, preserves files and reports missing/corrupt content', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'superoutride-images-'));
  try {
    const image = imageInput(),
      document = documentWith([image]),
      text = JSON.stringify(document);
    const sourcePath = path.join(directory, 'course.json'),
      imagePath = path.join(directory, `${image.reference.sha256}.json`);
    await writeFile(sourcePath, text);
    await writeFile(imagePath, image.input.bytes);
    const run = (...extra) =>
      spawnSync(process.execPath, ['tools/course/compile-course.mjs', sourcePath, ...extra], { encoding: 'utf8' });
    const absent = run();
    assert.equal(absent.status, 1);
    failures(JSON.parse(absent.stderr), ['asset_missing'], true);
    const compiled = run('--images', directory);
    assert.equal(compiled.status, 0, compiled.stderr);
    assert.equal(JSON.parse(compiled.stdout).images[0].sha256, image.reference.sha256);
    assert.equal(await readFile(sourcePath, 'utf8'), text);
    assert.deepEqual(new Uint8Array(await readFile(imagePath)), image.input.bytes);
    await writeFile(imagePath, '{}');
    const corrupt = run('--images', directory);
    assert.equal(corrupt.status, 1);
    failures(JSON.parse(corrupt.stderr), ['asset_digest_mismatch'], true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
