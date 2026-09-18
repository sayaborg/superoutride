import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { PNG as BrowserPNG } from '../../dist/tools/graphics/png-codec.mjs';
import { generateSpritePalette } from '../../dist/graphics/sprite-palette.js';
import { rgba, unpackRgba } from '../../dist/graphics/software-surface.js';
import { readSpriteLodAsset } from '../../dist/graphics/sprite.js';
import { createSpriteSourceFixture } from '../../dist/dev/fixtures/sprite-source.js';
import { SpriteSession } from '../../tools/graphics/sprite-session.mjs';
import { decodeSpritePng } from '../../tools/graphics/sprite-png.mjs';

const filter = { colorSpace: 'encoded-srgb', coverageThreshold: 0.5 };
const image = (pixels) => ({ width: pixels.length, height: 1, pixels: Uint32Array.from(pixels) });
const full = (image) => ({ x: 0, y: 0, width: image.width, height: image.height });
const recipe = (image) => ({
  format: 'superoutride.sprite-source',
  version: 1,
  name: 'STUDY',
  crop: full(image),
  widthMeters: image.width / 40,
  anchor: { x: (image.width - 1) / 2, y: image.height - 1 },
  paletteRgb555: generateSpritePalette(image, full(image), 15),
  filter,
});
const pixel = { x: 0, y: 0, width: 1, height: 1 };

test('palette generation counts only cropped visible alpha, preserves small palettes and has deterministic split ties', () => {
  const source = image([rgba(255, 0, 0), rgba(0, 0, 255), rgba(0, 255, 0), rgba(255, 255, 255, 0)]);
  assert.deepEqual(generateSpritePalette(source, full(source), 15), [31, 992, 31744]);
  assert.deepEqual(generateSpritePalette(source, full(source), 2), [0x0210, 0x7c00]);
  const reversed = image([...source.pixels].reverse());
  assert.deepEqual(generateSpritePalette(reversed, full(reversed), 2), [0x0210, 0x7c00]);
  assert.deepEqual(generateSpritePalette(source, { x: 1, y: 0, width: 1, height: 1 }, 15), [31]);
  const weighted = image([rgba(255, 0, 0), rgba(0, 0, 255, 85), rgba(0, 255, 0, 0)]);
  assert.deepEqual(generateSpritePalette(weighted, full(weighted), 1), [0x5c08]);
  const empty = image([rgba(255, 255, 255, 0)]);
  assert.deepEqual(generateSpritePalette(empty, full(empty), 15), []);
  for (const count of [0, 16, 1.5, NaN]) assert.throws(() => generateSpritePalette(source, full(source), count));
  assert.throws(() => generateSpritePalette(source, { ...full(source), x: 1 }, 15));
  assert.throws(() => generateSpritePalette({ ...source, pixels: new Uint32Array(1) }, full(source), 15));
});

test('mask edits preserve original straight alpha, undo/redo causality and invalidate completed products', () => {
  const source = image([rgba(255, 0, 0, 128), rgba(0, 0, 255), rgba(0, 255, 0, 0)]);
  const original = structuredClone(source),
    session = new SpriteSession(source, recipe(source), filter);
  const initial = session.compile();
  assert.ok(session.products);
  assert.equal(session.mask(pixel, true), true);
  assert.equal(session.products, null);
  assert.deepEqual(unpackRgba(session.image.pixels[0]), { r: 255, g: 0, b: 0, a: 0 });
  assert.equal(session.mask(pixel, true), false, 'no-op must not add an undo step');
  assert.ok(session.undo());
  assert.deepEqual(session.image, original);
  assert.deepEqual(session.compile(), initial);
  assert.equal(session.canUndo, false);
  assert.ok(session.redo());
  session.mask(pixel, false);
  assert.deepEqual(session.image, original);
  assert.ok(session.undo());
  assert.equal(unpackRgba(session.image.pixels[0]).a, 0);
  session.mask({ ...pixel, x: 1 }, true);
  assert.equal(session.canRedo, false, 'new edit drops redo');
  assert.deepEqual(source, original, 'input source is never edited');
  source.pixels[0] = 0;
  session.mask(pixel, false);
  assert.equal(session.image.pixels[0], original.pixels[0], 'session owns its original');
  session.compile();
  session.updateSettings({ ...recipe(original), widthMeters: 0 }, filter);
  assert.equal(session.products, null);
  assert.throws(() => session.compile());
  assert.equal(session.products, null, 'failed compile cannot expose prior products');
});

test('mask undo history is bounded by both operation count and stored bytes', () => {
  const source = image([rgba(255, 0, 0)]),
    session = new SpriteSession(source, recipe(source), filter);
  for (let i = 0; i < 40; i++) session.mask(pixel, i % 2 === 0);
  let steps = 0;
  while (session.undo()) steps++;
  assert.equal(steps, 32);
  const large = { width: 1024, height: 1024, pixels: new Uint32Array(1024 * 1024) };
  const bounded = new SpriteSession(large, null, null);
  for (let i = 0; i < 10; i++) bounded.mask(full(large), i % 2 === 0);
  steps = 0;
  while (bounded.undo()) steps++;
  assert.equal(steps, 8);
  assert.throws(() => bounded.mask({ ...pixel, x: 1024 }, true));
  assert.throws(() => new SpriteSession({ width: 4097, height: 1, pixels: new Uint32Array(4097) }, null, null));
});

test('session round trip owns portable original RGBA, restores mask and recipes, and reproduces exact products', () => {
  const source = image([rgba(17, 29, 91, 128), rgba(255, 0, 0), rgba(0, 255, 0, 0)]);
  const session = new SpriteSession(source, recipe(source), { ...filter, colorSpace: 'linear-srgb' });
  session.mask(pixel, true);
  const products = session.compile(),
    document = session.toDocument();
  const originalBytes = Uint8Array.from(atob(document.source.rgbaBase64), (c) => c.charCodeAt(0));
  assert.deepEqual([...originalBytes.subarray(0, 4)], [17, 29, 91, 128], 'session storage is endian independent RGBA');
  const restored = SpriteSession.fromDocument(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(restored.compile(), products);
  assert.deepEqual(restored.settings, session.settings);
  assert.equal(restored.canUndo, false, 'history is deliberately not saved');
  restored.mask(pixel, false);
  assert.deepEqual(restored.image, source, 'restore retains original low alpha and hidden RGB');
  document.recipe.name = 'MUTATED';
  assert.equal(restored.settings.recipe.name, 'STUDY');
  for (const change of [
    (doc) => (doc.extra = true),
    (doc) => (doc.version = 2),
    (doc) => (doc.source.width = 1e9),
    (doc) => (doc.source.rgbaBase64 = 'AAAA'),
    (doc) => (doc.hiddenBase64 = btoa('\x02\0\0')),
    (doc) => (doc.recipe.scale = 2),
    (doc) => (doc.lodRecipe.colorSpace = 'unknown'),
  ]) {
    const bad = session.toDocument();
    change(bad);
    assert.throws(() => SpriteSession.fromDocument(bad));
  }
});

test('the shipped Node and browser PNG decoders feed identical pixels into the authoring session and product reader', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('../../dist/tools/graphics/sprite-source-example.png', import.meta.url)),
  );
  const [node, browser] = await Promise.all([decodeSpritePng(bytes, PNG), decodeSpritePng(bytes, BrowserPNG)]);
  assert.deepEqual(node, createSpriteSourceFixture());
  assert.deepEqual(browser, node);
  const session = new SpriteSession(browser, recipe(browser), filter);
  const product = session.compile();
  assert.equal(product.master.levels[0].paletteRgb555.length, 15);
  const decoded = readSpriteLodAsset(product.lod);
  assert.equal(decoded.worldWidthMeters, 2.4);
  assert.equal(decoded.levels.length, 8);
  assert.deepEqual(SpriteSession.fromDocument(session.toDocument()).products, product);
  // Uint8Array subviews and low alpha must not depend on Buffer or canvas premultiplication.
  const low = PNG.sync.write({ width: 2, height: 1, data: Buffer.from([233, 49, 157, 1, 16, 31, 71, 0]) });
  const wrapped = new Uint8Array(low.length + 8);
  wrapped.set(low, 4);
  const result = await decodeSpritePng(wrapped.subarray(4, 4 + low.length), BrowserPNG);
  assert.deepEqual([...result.pixels].map(unpackRgba), [
    { r: 233, g: 49, b: 157, a: 1 },
    { r: 16, g: 31, b: 71, a: 0 },
  ]);
  await assert.rejects(decodeSpritePng(bytes, BrowserPNG, 100));
  await assert.rejects(decodeSpritePng(bytes, BrowserPNG, 1e6, 32));
  const corrupt = bytes.slice();
  corrupt[29] ^= 1;
  await assert.rejects(decodeSpritePng(corrupt, BrowserPNG));
});
