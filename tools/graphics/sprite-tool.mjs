import { PNG } from '../../dist/tools/graphics/png-codec.mjs';
import { CURRENT_FOCAL_LENGTH_PIXELS, pixelsPerMeterAtDepth } from '../../dist/core/presentation-scale.js';
import { SoftwareSurface, rgba, unpackRgba } from '../../dist/graphics/software-surface.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import {
  readSpriteLodAsset,
  readSpritePaletteRgb555,
  drawScaledSprite,
  selectSpriteLevel,
  SPRITE_SOURCE_TEXELS_PER_METER,
} from '../../dist/graphics/sprite.js';
import { generateSpritePalette } from '../../dist/graphics/sprite-palette.js';
import { decodeSpritePng, SPRITE_PNG_BYTE_LIMIT } from './sprite-png.mjs';
import {
  SpriteSession,
  SPRITE_EDITOR_PIXEL_LIMIT,
  SPRITE_EDITOR_AXIS_LIMIT,
  SPRITE_SESSION_BYTE_LIMIT,
} from './sprite-session.mjs';

const el = (id) => document.getElementById(id);
const canvas = el('source'),
  context = canvas.getContext('2d');
const surface = new SoftwareSurface(320, 240),
  preview = el('preview').getContext('2d');
const settingIds = [
  'name',
  'crop-x',
  'crop-y',
  'crop-width',
  'crop-height',
  'meters',
  'anchor-x',
  'anchor-y',
  'palette',
];
let session,
  asset,
  request = 0,
  pending = false,
  gesture;
const number = (id) => {
  if (!el(id).value.trim()) throw new Error(`${el(id).labels[0]?.textContent ?? id} is required.`);
  const value = Number(el(id).value);
  if (!Number.isFinite(value)) throw new Error('Enter finite numeric values.');
  return value;
};
const crop = () => ({
  x: number('crop-x'),
  y: number('crop-y'),
  width: number('crop-width'),
  height: number('crop-height'),
});
const selection = () => ({
  x: number('mask-x'),
  y: number('mask-y'),
  width: number('mask-width'),
  height: number('mask-height'),
});
function readPalette() {
  const text = el('palette').value.trim();
  if (!text) return [];
  const values = text.split(/[\s,]+/).filter(Boolean);
  if (values.some((value) => !/^(?:0x[\da-f]+|\d+)$/i.test(value)))
    throw new Error('Use decimal or 0x-prefixed RGB555 values.');
  return readSpritePaletteRgb555(values.map(Number));
}
function readSettings() {
  return {
    recipe: {
      format: 'superoutride.sprite-source',
      version: 2,
      name: el('name').value,
      crop: crop(),
      widthMeters: number('meters'),
      anchor: { x: number('anchor-x'), y: number('anchor-y') },
      paletteRgb555: readPalette(),
    },
  };
}
function writeSettings({ recipe }) {
  const values = {
    name: recipe.name,
    'crop-x': recipe.crop.x,
    'crop-y': recipe.crop.y,
    'crop-width': recipe.crop.width,
    'crop-height': recipe.crop.height,
    meters: recipe.widthMeters ?? '',
    'anchor-x': recipe.anchor.x,
    'anchor-y': recipe.anchor.y,
    palette: recipe.paletteRgb555.map(hex).join(', '),
  };
  for (const [id, value] of Object.entries(values)) el(id).value = value;
}
const hex = (value) => `0x${value.toString(16).padStart(4, '0')}`;
function controls() {
  el('settings').disabled = !session || pending;
  el('mask').disabled = !session || pending;
  el('undo').disabled = !session?.canUndo;
  el('redo').disabled = !session?.canRedo;
  for (const id of ['source-recipe', 'master-export', 'lod-export']) el(id).disabled = !asset || pending;
}
function swatches() {
  el('swatches').replaceChildren();
  try {
    for (const [index, value] of readPalette().entries()) {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.title = index === 0 ? '0: transparent (unused palette entry)' : `${index}: ${hex(value)}`;
      swatch.setAttribute('aria-label', swatch.title);
      if (index !== 0) {
        const { r, g, b } = unpackRgba(rgb555ToRgba(value));
        swatch.style.backgroundColor = `rgb(${r} ${g} ${b})`;
      }
      el('swatches').append(swatch);
    }
  } catch {
    /* Invalid editing text is reported on build; no stale swatches. */
  }
}
function drawSource() {
  if (!session) return;
  const image = session.image;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.style.width = `${image.width * Number(el('zoom').value)}px`;
  canvas.style.height = `${image.height * Number(el('zoom').value)}px`;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.pixels.buffer), image.width, image.height), 0, 0);
  context.lineWidth = 1 / Number(el('zoom').value);
  for (const [getRect, color] of [
    [crop, '#77ffe0'],
    [selection, '#fff'],
  ]) {
    try {
      const { x, y, width, height } = getRect();
      context.strokeStyle = color;
      context.strokeRect(x, y, width, height);
    } catch {
      /* A field can be temporarily empty during editing. */
    }
  }
}
function drawPreview() {
  surface.clear(rgba(28, 42, 54));
  let metrics = 'Build to preview the current image.';
  if (asset) {
    const depth = number('depth');
    if (depth < 2.5 || depth > 200) throw new Error('Preview depth must be 2.5–200 m.');
    const ppm = pixelsPerMeterAtDepth(CURRENT_FOCAL_LENGTH_PIXELS, depth);
    const k = selectSpriteLevel(asset, ppm),
      level = asset.levels[k];
    const stats = drawScaledSprite(surface, asset, 160, 200, ppm);
    metrics = `${asset.name} · ${asset.width} × ${asset.height} master · ${asset.levels.length} levels\nFrame: ${asset.worldWidthMeters.toFixed(3)} × ${(asset.height / SPRITE_SOURCE_TEXELS_PER_METER).toFixed(3)} m · ${ppm.toFixed(2)} screen px/m\nLOD ${k}: ${level.width} × ${level.height} · ${stats.outputSamples} samples · anchor at (160, 200)`;
  }
  preview.putImageData(new ImageData(new Uint8ClampedArray(surface.pixels.buffer), 320, 240), 0, 0);
  el('metrics').textContent = metrics;
}
function edited() {
  asset = undefined;
  session?.updateSettings(null);
  el('status').textContent = 'Changes not built. Build again to update the preview and exports.';
  el('error').textContent = '';
  controls();
  swatches();
  drawSource();
  drawPreview();
}
function attempt(action) {
  try {
    el('error').textContent = '';
    action();
  } catch (error) {
    el('error').textContent = error.message;
  }
  controls();
}
function compile() {
  asset = undefined;
  controls();
  const { recipe } = readSettings();
  session.updateSettings(recipe);
  const products = session.compile();
  asset = readSpriteLodAsset(products.lod);
  el('status').textContent =
    `Built ${products.master.width} × ${products.master.height} master and ${products.lod.levels.length} LOD levels.`;
  drawPreview();
  controls();
  return products;
}
function install(next, label) {
  session = next;
  asset = undefined;
  gesture = undefined;
  writeSettings(session.settings);
  for (const [id, value] of Object.entries({ 'mask-x': 0, 'mask-y': 0, 'mask-width': 1, 'mask-height': 1 }))
    el(id).value = value;
  el('source-size').textContent = `${session.dimensions.width} × ${session.dimensions.height} source pixels`;
  canvas.style.display = 'block';
  el('empty').hidden = true;
  el('error').textContent = '';
  el('status').textContent = label;
  const products = session.products;
  if (products) asset = readSpriteLodAsset(products.lod);
  controls();
  drawSource();
  swatches();
  attempt(drawPreview);
}
async function open(load) {
  const current = ++request;
  pending = true;
  gesture = undefined;
  controls();
  el('status').textContent = 'Opening…';
  el('error').textContent = '';
  try {
    const { next, label } = await load();
    if (current === request) install(next, label);
  } catch (error) {
    if (current === request) {
      el('error').textContent = error.message;
      el('status').textContent = 'Could not open file. The previous session is retained.';
    }
  } finally {
    if (current === request) {
      pending = false;
      controls();
    }
  }
}
async function pngSession(bytes, name, example = false) {
  const image = await decodeSpritePng(bytes, PNG, SPRITE_EDITOR_PIXEL_LIMIT, SPRITE_EDITOR_AXIS_LIMIT);
  const rect = { x: 0, y: 0, width: image.width, height: image.height };
  const recipe = {
    format: 'superoutride.sprite-source',
    version: 2,
    name,
    crop: rect,
    widthMeters: example ? 2.4 : null,
    anchor: { x: (image.width - 1) / 2, y: image.height - 1 },
    paletteRgb555: example ? generateSpritePalette(image, rect, 15) : [],
  };
  const next = new SpriteSession(image, recipe);
  if (example) next.compile();
  return {
    next,
    label: example
      ? 'Example loaded and built. Try hiding a rectangle or changing the size.'
      : 'PNG loaded. Set its known crop width and palette, then build.',
  };
}
el('example').addEventListener('click', () =>
  open(async () => {
    const response = await fetch(new URL('../../dist/tools/graphics/sprite-source-example.png', import.meta.url));
    if (!response.ok) throw new Error(`Example could not load (${response.status}).`);
    return pngSession(new Uint8Array(await response.arrayBuffer()), 'COLOR STUDY', true);
  }),
);
for (const [id, limit, load] of [
  [
    'png-file',
    SPRITE_PNG_BYTE_LIMIT,
    async (file) => pngSession(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.png$/i, '')),
  ],
  [
    'session-file',
    SPRITE_SESSION_BYTE_LIMIT,
    async (file) => ({
      next: SpriteSession.fromDocument(JSON.parse(await file.text())),
      label: 'Session restored, including original pixels, mask and recipes.',
    }),
  ],
])
  el(id).addEventListener('change', () => {
    const file = el(id).files[0];
    el(id).value = '';
    if (file)
      open(async () => {
        if (file.size > limit) throw new Error(`File exceeds ${limit / 1024 / 1024} MiB.`);
        return load(file);
      });
  });
for (const id of settingIds) el(id).addEventListener('input', edited);
el('generate').addEventListener('click', () =>
  attempt(() => {
    el('palette').value = generateSpritePalette(session.image, crop(), number('colors')).map(hex).join(', ');
    edited();
  }),
);
el('anchor-bottom').addEventListener('click', () =>
  attempt(() => {
    const rect = crop();
    el('anchor-x').value = rect.x + (rect.width - 1) / 2;
    el('anchor-y').value = rect.y + rect.height - 1;
    edited();
  }),
);
for (const [id, hide] of [
  ['hide', true],
  ['restore', false],
])
  el(id).addEventListener('click', () =>
    attempt(() => {
      if (session.mask(selection(), hide)) edited();
    }),
  );
for (const method of ['undo', 'redo'])
  el(method).addEventListener('click', () =>
    attempt(() => {
      if (session[method]()) edited();
    }),
  );
for (const id of ['zoom', 'mask-x', 'mask-y', 'mask-width', 'mask-height'])
  el(id).addEventListener('input', drawSource);
const point = (event) => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width)),
    ),
    y: Math.max(
      0,
      Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height)),
    ),
  };
};
canvas.addEventListener('pointerdown', (event) => {
  if (!session || pending || event.button !== 0) return;
  gesture = {
    start: point(event),
    previous: ['mask-x', 'mask-y', 'mask-width', 'mask-height'].map((id) => el(id).value),
    pointer: event.pointerId,
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelection(event);
});
function updateSelection(event) {
  if (!gesture || gesture.pointer !== event.pointerId) return;
  const end = point(event),
    start = gesture.start;
  for (const [id, value] of Object.entries({
    'mask-x': Math.min(start.x, end.x),
    'mask-y': Math.min(start.y, end.y),
    'mask-width': Math.abs(end.x - start.x) + 1,
    'mask-height': Math.abs(end.y - start.y) + 1,
  }))
    el(id).value = value;
  drawSource();
}
canvas.addEventListener('pointermove', updateSelection);
canvas.addEventListener('pointerup', (event) => {
  if (gesture?.pointer !== event.pointerId) return;
  updateSelection(event);
  gesture = undefined;
  canvas.releasePointerCapture(event.pointerId);
});
const cancelSelection = () => {
  if (gesture)
    ['mask-x', 'mask-y', 'mask-width', 'mask-height'].forEach((id, i) => (el(id).value = gesture.previous[i]));
  gesture = undefined;
  drawSource();
};
canvas.addEventListener('pointercancel', cancelSelection);
canvas.addEventListener('lostpointercapture', cancelSelection);
el('compile').addEventListener('click', () => attempt(compile));
function download(name, document) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document) + '\n'], { type: 'application/json' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const basename = () =>
  el('name')
    .value.replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'sprite';
el('save').addEventListener('click', () =>
  attempt(() => {
    compile();
    download(`${basename()}.session.json`, session.toDocument());
  }),
);
for (const [id, key] of [
  ['master-export', 'master'],
  ['lod-export', 'lod'],
])
  el(id).addEventListener('click', () =>
    attempt(() => {
      const products = session.products;
      if (!products) throw new Error('Build the current settings before export.');
      download(`${basename()}.${key}.json`, products[key]);
    }),
  );
for (const [id, key] of [['source-recipe', 'recipe']])
  el(id).addEventListener('click', () =>
    attempt(() => {
      if (!session.products) throw new Error('Build the current settings before export.');
      download(`${basename()}.${id}.json`, session.settings[key]);
    }),
  );
for (const id of ['depth', 'distance'])
  el(id).addEventListener('input', () =>
    attempt(() => {
      if (id === 'distance') el('depth').value = el(id).value;
      else el('distance').value = el(id).value;
      drawPreview();
    }),
  );
drawPreview();
controls();
