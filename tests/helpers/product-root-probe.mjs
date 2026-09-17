import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { SelectorElement as Element } from './fake-selector-dom.mjs';

// Runs the actual compiled composition root with browser-shaped host boundaries. Not a browser engine.
const mode = process.argv[2];
const repo = fileURLToPath(new URL('../..', import.meta.url));
const prefix = `https://fixture.test/build/${'c'.repeat(40)}/`;
const ids = [
  'game',
  'sound-toggle',
  'tire-sound-toggle',
  'tire-component-controls',
  'sound-volume',
  'sound-tuning',
  'engine-volume',
  'tire-volume',
  'tire-tuning',
  'dev-panel',
  'vehicle-selector-buttons',
  'camera-selector-buttons',
  'steering-offset-selector-buttons',
  'max-steer-selector-buttons',
  'steering-response-selector-buttons',
  'tire-friction-selector-buttons',
];
const elements = new Map(ids.map((id) => [id, new Element()]));
let frames = 0,
  time = 0,
  sequence = 0,
  calls = 0;
const animation = new Map();
const ctx = new Proxy(
  {
    measureText: (text) => ({ width: text.length * 4 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (image) => {
      assert.ok(image.data.some((value) => value !== 0));
      frames++;
    },
  },
  { get: (object, key) => object[key] ?? (() => {}) },
);
elements.get('game').getContext = () => ctx;
const document = new Element();
document.body = new Element();
document.body.append = (...nodes) => document.body.children.push(...nodes);
document.createElement = (tag) => {
  const element = new Element(tag);
  element.append = (...nodes) => element.children.push(...nodes);
  element.remove = () => {
    document.body.children = document.body.children.filter((x) => x !== element);
  };
  return element;
};
document.getElementById = (id) => elements.get(id) ?? document.body.children.find((e) => e.id === id) ?? null;
document.querySelectorAll = () => [elements.get('vehicle-selector-buttons'), elements.get('camera-selector-buttons')];
document.documentElement = new Element();
const window = new Element();
window.innerWidth = 1200;
window.innerHeight = 800;
const bindings = JSON.parse(await readFile(resolve(repo, '.test-assets/ground-pages/bindings.json')));
const catalog = {
  kind: 'ground-map-catalog',
  version: 1,
  encoding: 'gzip',
  bindings: Object.fromEntries(Object.entries(bindings).map(([id, digest]) => [`CONTENT_${id}`, digest])),
};
catalog.bindings.circuit = JSON.parse(await readFile(resolve(repo, '.test-assets/ground-pages/circuit-binding.json')));
Object.assign(
  catalog.bindings,
  JSON.parse(await readFile(resolve(repo, '.test-assets/ground-pages/other-bindings.json'))),
);
let failFirst = true;
const sandbox = createContext({
  console,
  document,
  window,
  navigator: { maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false }),
  location: { search: `?mode=${mode}`, reload() {} },
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Float32Array,
  Float64Array,
  ArrayBuffer,
  DataView,
  crypto: globalThis.crypto,
  structuredClone,
  AbortController,
  AbortSignal,
  DOMException,
  ReadableStream,
  TransformStream,
  DecompressionStream,
  setTimeout,
  clearTimeout,
  performance: { now: () => time },
  requestAnimationFrame: (cb) => {
    animation.set(++sequence, cb);
    return sequence;
  },
  cancelAnimationFrame: (id) => animation.delete(id),
  async fetch(url, init) {
    assert.equal(this, undefined, 'preserve the native browser fetch receiver');
    init.signal.throwIfAborted();
    calls++;
    assert.ok(String(url).startsWith(prefix + 'ground-pages/'));
    if (failFirst) {
      failFirst = false;
      throw new Error('simulated initial delivery failure');
    }
    const file = String(url).split('/').at(-1);
    const bytes =
      file === 'catalog.json'
        ? JSON.stringify(catalog)
        : await readFile(resolve(repo, '.test-assets/ground-pages', file.replace(/\.gz$/, '')));
    const result = new Response(file.endsWith('.gz') ? gzipSync(bytes) : bytes);
    Object.defineProperty(result, 'url', { value: String(url) });
    return result;
  },
});
const modules = new Map();
async function load(url) {
  if (modules.has(url)) return modules.get(url);
  assert.ok(url.startsWith(prefix));
  const pending = (async () => {
    const source = await readFile(resolve(repo, 'dist', url.slice(prefix.length)), 'utf8');
    return new SourceTextModule(source, {
      context: sandbox,
      identifier: url,
      initializeImportMeta(meta) {
        meta.url = url;
      },
    });
  })();
  modules.set(url, pending);
  return pending;
}
const root = await load(
  prefix + (mode === 'linear' ? 'main-linear.js' : mode === 'branching' ? 'main.js' : 'main-circuit.js'),
);
await root.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
await root.evaluate();
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!predicate() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
  assert.ok(predicate());
}
await until(() => document.getElementById('ground-loading').children[0].textContent.includes('could not load'));
assert.equal(frames, 0);
assert.equal(animation.size, 0);
const panel = document.getElementById('ground-loading');
assert.equal(panel.children[1].hidden, false);
panel.children[1].click();
await until(() => frames > 0);
assert.equal(panel.hidden, true);
assert.equal(animation.size, 1);
const replacements = ['RC30', 'F110'];
for (const name of replacements) {
  elements
    .get('vehicle-selector-buttons')
    .children.find((element) => element.textContent === name)
    .click();
  const before = frames;
  const [id, callback] = animation.entries().next().value;
  animation.delete(id);
  callback(time); // No elapsed time: replacement must render using the recovered player's camera.
  await until(() => frames === before + 1);
}
for (let i = 0; i < 20; i++) {
  await until(() => animation.size > 0);
  const [id, callback] = animation.entries().next().value;
  animation.delete(id);
  time += 17;
  callback(time);
}
await until(() => panel.hidden);
assert.ok(frames >= 20);
window.emit('pagehide', { persisted: false });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(animation.size, 0);
console.log(JSON.stringify({ mode, frames, requests: calls, initialFailureRetry: true, replacements, disposed: true }));
