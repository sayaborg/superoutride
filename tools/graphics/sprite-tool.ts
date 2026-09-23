import { readSpritePaletteRgb555 } from './sprite-source-compiler.js';
import { mustGet } from '../../src/shell/dom.js';
import type { SpriteAsset } from '../../src/image/sprite.js';
import type { SpriteSourceRecipe } from './sprite-source-compiler.js';
import { PNG } from 'pngjs';
import { CURRENT_FOCAL_LENGTH_PIXELS, pixelsPerMeterAtDepth } from '../../src/view/display-scale.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { rgba, unpackRgba } from '../../src/image/rgb555.js';
import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { readSpriteLodAsset, selectSpriteLevel, SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { drawScaledSprite } from '../../src/view/sprite.js';
import { generateSpritePalette } from './sprite-palette.js';
import { decodeSpritePng, SPRITE_PNG_BYTE_LIMIT } from './sprite-png.js';
import {
  SpriteSession,
  SPRITE_EDITOR_PIXEL_LIMIT,
  SPRITE_EDITOR_AXIS_LIMIT,
  SPRITE_SESSION_BYTE_LIMIT,
} from './sprite-session.js';

const el = mustGet<HTMLElement>;
const input = mustGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
const canvas = mustGet<HTMLCanvasElement>('source'),
  context = canvas.getContext('2d')!;
const surface = new SoftwareSurface(320, 240),
  preview = mustGet<HTMLCanvasElement>('preview').getContext('2d')!;
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
let session: SpriteSession | undefined,
  asset: SpriteAsset | undefined,
  request = 0,
  pending = false,
  gesture: { start: { x: number; y: number }; previous: string[]; pointer: number } | undefined;
const number = (id: string) => {
  if (!input(id).value.trim()) throw new Error(`${input(id).labels?.[0]?.textContent ?? id} is required.`);
  const value = Number(input(id).value);
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
  const text = input('palette').value.trim();
  if (!text) return [];
  const values = text.split(/[\s,]+/).filter(Boolean);
  if (values.some((value) => !/^(?:0x[\da-f]+|\d+)$/i.test(value)))
    throw new Error('Use decimal or 0x-prefixed RGB555 values.');
  return readSpritePaletteRgb555(values.map(Number));
}
function readSettings(): { recipe: SpriteSourceRecipe } {
  return {
    recipe: {
      format: 'superoutride.sprite-source',
      version: 2,
      name: input('name').value,
      crop: crop(),
      widthMeters: number('meters'),
      anchor: { x: number('anchor-x'), y: number('anchor-y') },
      paletteRgb555: readPalette(),
    },
  };
}
function writeSettings({ recipe }: { recipe: SpriteSourceRecipe | null }) {
  const values = {
    name: recipe!.name,
    'crop-x': recipe!.crop.x,
    'crop-y': recipe!.crop.y,
    'crop-width': recipe!.crop.width,
    'crop-height': recipe!.crop.height,
    meters: recipe!.widthMeters ?? '',
    'anchor-x': recipe!.anchor.x,
    'anchor-y': recipe!.anchor.y,
    palette: recipe!.paletteRgb555.map(hex).join(', '),
  };
  for (const [id, value] of Object.entries(values)) input(id).value = String(value);
}
const hex = (value: number) => `0x${value.toString(16).padStart(4, '0')}`;
function controls() {
  mustGet<HTMLButtonElement | HTMLFieldSetElement>('settings').disabled = !session || pending;
  mustGet<HTMLButtonElement | HTMLFieldSetElement>('mask').disabled = !session || pending;
  mustGet<HTMLButtonElement | HTMLFieldSetElement>('undo').disabled = !session?.canUndo;
  mustGet<HTMLButtonElement | HTMLFieldSetElement>('redo').disabled = !session?.canRedo;
  for (const id of ['source-recipe', 'master-export', 'lod-export'])
    mustGet<HTMLButtonElement | HTMLFieldSetElement>(id).disabled = !asset || pending;
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
  canvas.style.width = `${image.width * Number(input('zoom').value)}px`;
  canvas.style.height = `${image.height * Number(input('zoom').value)}px`;
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.pixels.buffer as ArrayBuffer), image.width, image.height),
    0,
    0,
  );
  context.lineWidth = 1 / Number(input('zoom').value);
  for (const [getRect, color] of [
    [crop, '#77ffe0'],
    [selection, '#fff'],
  ] as const) {
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
      level = asset.levels[k]!;
    const stats = drawScaledSprite(surface, asset, 160, 200, ppm);
    metrics = `${asset.name} · ${asset.width} × ${asset.height} master · ${asset.levels.length} levels\nFrame: ${asset.worldWidthMeters.toFixed(3)} × ${(asset.height / SPRITE_SOURCE_TEXELS_PER_METER).toFixed(3)} m · ${ppm.toFixed(2)} screen px/m\nLOD ${k}: ${level.width} × ${level.height} · ${stats.outputSamples} samples · anchor at (160, 200)`;
  }
  preview.putImageData(new ImageData(new Uint8ClampedArray(surface.pixels.buffer as ArrayBuffer), 320, 240), 0, 0);
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
function attempt(action: () => unknown) {
  try {
    el('error').textContent = '';
    action();
  } catch (error) {
    el('error').textContent = error instanceof Error ? error.message : String(error);
  }
  controls();
}
function compile() {
  asset = undefined;
  controls();
  const { recipe } = readSettings();
  session!.updateSettings(recipe);
  const products = session!.compile();
  asset = readSpriteLodAsset(products.lod);
  el('status').textContent =
    `Built ${products.master.width} × ${products.master.height} master and ${products.lod.levels.length} LOD levels.`;
  drawPreview();
  controls();
  return products;
}
function install(next: SpriteSession, label: string) {
  session = next;
  asset = undefined;
  gesture = undefined;
  writeSettings(session.settings);
  for (const [id, value] of Object.entries({ 'mask-x': 0, 'mask-y': 0, 'mask-width': 1, 'mask-height': 1 }))
    input(id).value = String(value);
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
async function open(load: () => Promise<{ next: SpriteSession; label: string }>) {
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
      el('error').textContent = error instanceof Error ? error.message : String(error);
      el('status').textContent = 'Could not open file. The previous session is retained.';
    }
  } finally {
    if (current === request) {
      pending = false;
      controls();
    }
  }
}
async function pngSession(bytes: Uint8Array, name: string, example = false) {
  const image = await decodeSpritePng(bytes, PNG, SPRITE_EDITOR_PIXEL_LIMIT, SPRITE_EDITOR_AXIS_LIMIT);
  const rect = { x: 0, y: 0, width: image.width, height: image.height };
  const recipe: SpriteSourceRecipe = {
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
    const response = await fetch(new URL('./sprite-source-example.png', import.meta.url));
    if (!response.ok) throw new Error(`Example could not load (${response.status}).`);
    return pngSession(new Uint8Array(await response.arrayBuffer()), 'COLOR STUDY', true);
  }),
);
for (const [id, limit, load] of [
  [
    'png-file',
    SPRITE_PNG_BYTE_LIMIT,
    async (file: File) => pngSession(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.png$/i, '')),
  ],
  [
    'session-file',
    SPRITE_SESSION_BYTE_LIMIT,
    async (file: File) => ({
      next: SpriteSession.fromDocument(JSON.parse(await file.text())),
      label: 'Session restored, including original pixels, mask and recipes.',
    }),
  ],
] as const)
  el(id).addEventListener('change', () => {
    const file = mustGet<HTMLInputElement>(id).files?.[0];
    input(id).value = '';
    if (file)
      open(async () => {
        if (file.size > limit) throw new Error(`File exceeds ${limit / 1024 / 1024} MiB.`);
        return load(file);
      });
  });
for (const id of settingIds) el(id).addEventListener('input', edited);
el('generate').addEventListener('click', () =>
  attempt(() => {
    input('palette').value = generateSpritePalette(session!.image, crop(), number('colors')).map(hex).join(', ');
    edited();
  }),
);
el('anchor-bottom').addEventListener('click', () =>
  attempt(() => {
    const rect = crop();
    input('anchor-x').value = String(rect.x + (rect.width - 1) / 2);
    input('anchor-y').value = String(rect.y + rect.height - 1);
    edited();
  }),
);
for (const [id, hide] of [
  ['hide', true],
  ['restore', false],
] as const)
  el(id).addEventListener('click', () =>
    attempt(() => {
      if (session!.mask(selection(), hide)) edited();
    }),
  );
for (const method of ['undo', 'redo'] as const)
  el(method).addEventListener('click', () =>
    attempt(() => {
      if (session![method]()) edited();
    }),
  );
for (const id of ['zoom', 'mask-x', 'mask-y', 'mask-width', 'mask-height'])
  el(id).addEventListener('input', drawSource);
const point = (event: PointerEvent) => {
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
    previous: ['mask-x', 'mask-y', 'mask-width', 'mask-height'].map((id) => input(id).value),
    pointer: event.pointerId,
  };
  canvas.setPointerCapture(event.pointerId);
  updateSelection(event);
});
function updateSelection(event: PointerEvent) {
  if (!gesture || gesture.pointer !== event.pointerId) return;
  const end = point(event),
    start = gesture.start;
  for (const [id, value] of Object.entries({
    'mask-x': Math.min(start.x, end.x),
    'mask-y': Math.min(start.y, end.y),
    'mask-width': Math.abs(end.x - start.x) + 1,
    'mask-height': Math.abs(end.y - start.y) + 1,
  }))
    input(id).value = String(value);
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
    ['mask-x', 'mask-y', 'mask-width', 'mask-height'].forEach((id, i) => (input(id).value = gesture!.previous[i]!));
  gesture = undefined;
  drawSource();
};
canvas.addEventListener('pointercancel', cancelSelection);
canvas.addEventListener('lostpointercapture', cancelSelection);
el('compile').addEventListener('click', () => attempt(compile));
function download(name: string, document: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document) + '\n'], { type: 'application/json' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const basename = () =>
  input('name')
    .value.replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'sprite';
el('save').addEventListener('click', () =>
  attempt(() => {
    compile();
    download(`${basename()}.session.json`, session!.toDocument());
  }),
);
for (const [id, key] of [
  ['master-export', 'master'],
  ['lod-export', 'lod'],
] as const)
  el(id).addEventListener('click', () =>
    attempt(() => {
      const products = session!.products;
      if (!products) throw new Error('Build the current settings before export.');
      download(`${basename()}.${key}.json`, products[key]);
    }),
  );
for (const [id, key] of [['source-recipe', 'recipe']] as const)
  el(id).addEventListener('click', () =>
    attempt(() => {
      if (!session!.products) throw new Error('Build the current settings before export.');
      download(`${basename()}.${id}.json`, session!.settings[key]);
    }),
  );
for (const id of ['depth', 'distance'])
  el(id).addEventListener('input', () =>
    attempt(() => {
      if (id === 'distance') input('depth').value = input(id).value;
      else input('distance').value = input(id).value;
      drawPreview();
    }),
  );
drawPreview();
controls();
