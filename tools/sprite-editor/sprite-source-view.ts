import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import {
  importedImageFiles,
  defaultSpriteAnchor,
  readSpriteRecipe,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import type { SourceImage, SpriteCrop } from '../graphics/sprite-source-compiler.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { createSpriteImporter } from './sprite-importer.js';
import { createSpritePreview, PREVIEW_DEPTH } from './sprite-preview.js';
import { make } from '../browser-shared/dom.js';
import { imageNameOfPath, imagePathIn, ORIGINALS_PLACE } from '../authoring/content-places.js';
import { confirmField, finiteNumber, pointerDrag } from '../browser-shared/pending-edit.js';

type Tool = 'crop' | 'hide' | 'show' | 'anchor';
const TOOLS: readonly Tool[] = ['crop', 'hide', 'show', 'anchor'];
/** Screen pixels per source pixel in the source view. */
const ZOOM = 4;

/**
 * Import: a source PNG and its recipe under `sprite-sources/`. The source shows its crop, mask and anchor; dragging on
 * it with a tool edits the recipe (one step each); the master is imported by the sprite operations and previewed with
 * the product's drawing. A course image is written as its named file.
 */
export function mountSourceView(element: HTMLElement, context: EditorContext) {
  const source = make('select');
  const newName = make('input', '', { placeholder: 'new source name' });
  const newFile = make('input', '', { type: 'file', accept: 'image/png' });
  const fields = {
    widthMeters: make('input', '', { type: 'number', step: 'any', size: '6' }),
    cropX: make('input', '', { type: 'number', step: '1' }),
    cropY: make('input', '', { type: 'number', step: '1' }),
    cropWidth: make('input', '', { type: 'number', step: '1' }),
    cropHeight: make('input', '', { type: 'number', step: '1' }),
    anchorX: make('input', '', { type: 'number', step: 'any' }),
  };
  const tools = make('span');
  let tool: Tool = 'crop';
  for (const name of TOOLS) {
    const button = make('button', name, { type: 'button', 'data-tool': name });
    button.addEventListener('click', () => {
      tool = name;
      for (const other of tools.children) other.classList.toggle('active', other === button);
    });
    tools.append(button, ' ');
  }
  (tools.firstChild as HTMLElement).classList.add('active');
  const generate = make('button', 'Generate palette', { type: 'button' });
  const automatic = make('button', 'Palette from each import', { type: 'button' });
  const clearMask = make('button', 'Clear mask', { type: 'button' });
  const swatches = make('span', '', { class: 'swatches' });
  const canvas = make('canvas', '', { class: 'sprite-source' });
  const depth = make('input', '', {
    type: 'range',
    min: String(PREVIEW_DEPTH.min),
    max: '40',
    step: '0.5',
    value: '6',
  });
  const preview = createSpritePreview();
  const writeCourse = make('button', 'Write course image', { type: 'button' });
  const note = make('p', '', { role: 'status' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  element.append(
    make('h2', 'Import'),
    field('Source', source),
    ' ',
    newName,
    ' ',
    newFile,
    make('p'),
    field('Width (m)', fields.widthMeters),
    ' ',
    field('Crop x', fields.cropX),
    field('y', fields.cropY),
    field('width', fields.cropWidth),
    field('height', fields.cropHeight),
    ' ',
    field('Anchor x', fields.anchorX),
    make('p'),
    'Drag on the source: ',
    tools,
    clearMask,
    make('p'),
    generate,
    ' ',
    automatic,
    ' ',
    swatches,
    make('div', '', { class: 'sprite-panes' }),
    note,
  );
  const panes = element.querySelector<HTMLElement>('.sprite-panes')!;
  const empty = make('p', 'No source is open: name a new source and choose its PNG.', { class: 'hint' });
  panes.before(empty);
  const previewPane = make('div');
  previewPane.append(preview.canvas, make('br'), field('Depth (m)', depth), ' ', writeCourse);
  panes.append(canvas, previewPane);

  // The open source: its recipe as saved, its decoded image and the master imported from them.
  let name: string | null = null,
    recipe: SpriteRecipe | null = null,
    image: SourceImage | null = null,
    decodedKey: string | null = null,
    decoded: SourceImage | null = null,
    master: SpriteLodDocument | null = null;
  // A rectangle being dragged on the source, shown before the recipe changes.
  let drag: Drag | null = null;
  // Imports run in a worker, the showings one after another.
  const importInWorker = createSpriteImporter();
  const recipePath = () => `${SPRITE_SOURCES_DIRECTORY}/${name}.json`;
  const save = (next: SpriteRecipe, label: string) => context.replace(recipePath(), next, `${label} (${name})`);

  const draw = () => {
    if (!image || !recipe) return;
    canvas.width = image.width * ZOOM;
    canvas.height = image.height * ZOOM;
    const graphics = canvas.getContext('2d')!;
    const data = new ImageData(image.width, image.height);
    const hidden = maskedAlpha(image, recipe);
    for (let i = 0; i < image.pixels.length; i++) {
      const { r, g, b, a } = unpackRgba(image.pixels[i]!);
      data.data.set(hidden[i] ? [r >> 2, g >> 2, b >> 2, 255] : [r, g, b, a], i * 4);
    }
    const scratch = new OffscreenCanvas(image.width, image.height);
    scratch.getContext('2d')!.putImageData(data, 0, 0);
    graphics.imageSmoothingEnabled = false;
    graphics.fillStyle = '#20262e';
    graphics.fillRect(0, 0, canvas.width, canvas.height);
    graphics.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    const outline = (rect: SpriteCrop, color: string) => {
      graphics.strokeStyle = color;
      graphics.strokeRect(rect.x * ZOOM + 0.5, rect.y * ZOOM + 0.5, rect.width * ZOOM - 1, rect.height * ZOOM - 1);
    };
    outline(recipe.crop, '#77ffe0');
    if (drag) outline(rectangle(drag), '#ffffff');
    // The base point: across at the anchor, down at its ground row (the row's centre) when the recipe names one, else at
    // the crop's bottom edge, where the picture stands.
    const ax = (recipe.anchor.x + 0.5) * ZOOM,
      ay = (recipe.anchor.y === undefined ? recipe.crop.y + recipe.crop.height : recipe.anchor.y + 0.5) * ZOOM;
    graphics.strokeStyle = '#ffd33d';
    graphics.beginPath();
    graphics.moveTo(ax - 6, ay);
    graphics.lineTo(ax + 6, ay);
    graphics.moveTo(ax, ay - 6);
    graphics.lineTo(ax, ay + 6);
    graphics.stroke();
  };
  const drawPreview = () => {
    if (!master || !recipe) return;
    const lod = compileSpriteLod(master);
    const asset = readSpriteLodAsset(lod);
    const levels = preview.draw([{ asset, palette: master.defaultPalette }], Number(depth.value));
    note.textContent = `${master.name}: ${master.width} × ${master.height} master, ${lod.levels.length} levels; at ${depth.value} m level ${levels[0]}.`;
  };

  const show = async () => {
    const names = context
      .paths()
      .filter((p) => p.startsWith(`${SPRITE_SOURCES_DIRECTORY}/`) && p.endsWith('.png'))
      .map((p) => p.slice(SPRITE_SOURCES_DIRECTORY.length + 1, -'.png'.length));
    if (names.join() !== [...source.options].map((o) => o.value).join()) {
      const chosen = source.value;
      source.replaceChildren(...names.map((n) => make('option', n, { value: n })));
      if (names.includes(chosen)) source.value = chosen;
    }
    name = source.value || null;
    recipe = image = master = null;
    if (!name) {
      panes.hidden = true;
      empty.hidden = false;
      return;
    }
    try {
      const bytes = await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${name}.png`);
      const key = `${name} ${await contentDigest(bytes)}`;
      if (key !== decodedKey) {
        decodedKey = key;
        image = await decodeSpritePng(bytes, PNG);
        decoded = image;
      } else image = decoded;
      recipe = readSpriteRecipe(JSON.parse(new TextDecoder().decode(await context.store.read(recipePath()))));
      master = await importInWorker(decodedKey!, image!, recipe, name);
    } catch (error) {
      note.textContent = `${name}: ${error instanceof Error ? error.message : error}`;
    }
    if (recipe) {
      const values: Record<keyof typeof fields, string> = {
        widthMeters: String(recipe.widthMeters),
        cropX: String(recipe.crop.x),
        cropY: String(recipe.crop.y),
        cropWidth: String(recipe.crop.width),
        cropHeight: String(recipe.crop.height),
        anchorX: String(recipe.anchor.x),
      };
      for (const [key, input] of Object.entries(fields))
        if (document.activeElement !== input) input.value = values[key as keyof typeof fields];
      // The master carries the palette its import chose, so the color rule runs once for both.
      swatches.replaceChildren(...(master ? master.palettes[master.defaultPalette]!.colors : []).map(swatch));
      automatic.disabled = recipe.palettes === null;
    }
    // Without an open source there is nothing to show but how to add one.
    panes.hidden = !recipe;
    empty.hidden = !!recipe;
    draw();
    drawPreview();
  };
  let showing = Promise.resolve();
  const refresh = () => (showing = showing.then(show));
  context.subscribe(() => void refresh());
  source.addEventListener('change', () => void refresh());
  depth.addEventListener('input', drawPreview);
  void refresh();

  // A new source: its PNG and a recipe over the whole image, two steps.
  newFile.addEventListener('change', async () => {
    const file = newFile.files?.[0];
    newFile.value = '';
    const chosen = newName.value.trim();
    if (!file || !/^[a-z0-9][a-z0-9_-]*$/i.test(chosen)) {
      note.textContent = 'Name the source (letters, digits, - and _) before choosing its PNG.';
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decodedNew = await decodeSpritePng(bytes, PNG).catch((error: Error) => error);
    if (decodedNew instanceof Error) {
      note.textContent = `${file.name}: ${decodedNew.message}`;
      return;
    }
    const base = `${SPRITE_SOURCES_DIRECTORY}/${chosen}`;
    context.setFile(`${base}.png`, bytes, `Add source ${chosen}`);
    context.replace(
      `${base}.json`,
      {
        format: SPRITE_RECIPE_FORMAT,
        version: SPRITE_RECIPE_VERSION,
        crop: { x: 0, y: 0, width: decodedNew.width, height: decodedNew.height },
        widthMeters: decodedNew.width / 40,
        anchor: defaultSpriteAnchor(decodedNew.width),
        mask: [],
        palettes: null,
      } satisfies SpriteRecipe,
      `Add recipe ${chosen}`,
    );
    newName.value = '';
    source.value = chosen;
  });

  // Fields are saved when confirmed.
  const recipeField = <T>(
    input: HTMLInputElement | HTMLSelectElement,
    parse: (text: string) => T | null,
    apply: (current: SpriteRecipe, value: T) => SpriteRecipe,
    label: string,
  ) => confirmField(input, parse, (value) => recipe && save(apply(recipe, value), label));
  recipeField(fields.widthMeters, finiteNumber, (r, widthMeters) => ({ ...r, widthMeters }), 'Set width');
  for (const [key, input] of [
    ['x', fields.cropX],
    ['y', fields.cropY],
    ['width', fields.cropWidth],
    ['height', fields.cropHeight],
  ] as const)
    recipeField(input, finiteNumber, (r, value) => ({ ...r, crop: { ...r.crop, [key]: value } }), 'Set crop');
  recipeField(fields.anchorX, finiteNumber, (r, x) => ({ ...r, anchor: { ...r.anchor, x } }), 'Set anchor');
  generate.addEventListener('click', () => {
    // The generated colors replace the default palette's, keeping its name and the other palettes.
    if (recipe && image && name && decodedKey) {
      const chosen = { ...recipe, palettes: null };
      void importInWorker(decodedKey, image, chosen, name).then((generated) => {
        const first = recipe?.palettes ? Object.keys(recipe.palettes)[0]! : 'original';
        const original = generated.palettes[generated.defaultPalette]!.colors;
        if (recipe) save({ ...recipe, palettes: { ...recipe.palettes, [first]: original } }, 'Generate palette');
      });
    }
  });
  automatic.addEventListener('click', () => recipe && save({ ...recipe, palettes: null }, 'Palette from each import'));
  clearMask.addEventListener('click', () => recipe && save({ ...recipe, mask: [] }, 'Clear mask'));
  writeCourse.addEventListener('click', () => {
    if (!master || !recipe) return;
    const files = importedImageFiles(recipe, master);
    // A picture of the same name in the originals' place is an original, which no page writes.
    const paths = context.paths();
    const original = files
      .map((file) => imagePathIn(paths, imageNameOfPath(file.path)!))
      .find((path) => path.startsWith(`${ORIGINALS_PLACE}/`));
    if (original) {
      note.textContent = `content/${original} is an original picture, which no page writes; give the source another name.`;
      return;
    }
    // The picture and its reflection are one edit.
    context.setFiles(
      files.map((file) => [file.path, file.bytes] as const),
      `Write course image ${master.name}`,
    );
    note.textContent = `Wrote ${files.map((file) => `content/${file.path}`).join(' and ')}; courses use it by its name, ${master.name}.`;
  });

  // Dragging on the source with a tool: one recipe edit on release.
  const at = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - box.left) / box.width) * (image?.width ?? 0)),
      y: Math.floor(((event.clientY - box.top) / box.height) * (image?.height ?? 0)),
    };
  };
  pointerDrag<Drag>(canvas, {
    start: (event) => {
      if (!image || !recipe) return null;
      const { x, y } = at(event);
      return { x0: x, y0: y, x1: x, y1: y };
    },
    move: (pending, event) => {
      const { x, y } = at(event);
      return { ...pending, x1: x, y1: y };
    },
    show: (pending) => {
      drag = pending;
      draw();
    },
    commit: (pending) => {
      if (!recipe || !image) return;
      const rect = clip(rectangle(pending), image);
      if (tool === 'anchor') save({ ...recipe, anchor: { ...recipe.anchor, x: pending.x1 } }, 'Set anchor');
      else if (!rect) return;
      else if (tool === 'crop') save({ ...recipe, crop: rect }, 'Set crop');
      else
        save(
          { ...recipe, mask: [...recipe.mask, { ...rect, hidden: tool === 'hide' }] },
          tool === 'hide' ? 'Hide' : 'Show',
        );
    },
  });
}

/** A drag on the source: where it started and where it is, in source pixels. */
interface Drag {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The rectangle a drag spans, both corners included. */
function rectangle({ x0, y0, x1, y1 }: Drag): SpriteCrop {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1 };
}

function clip(rect: SpriteCrop, image: SourceImage): SpriteCrop | null {
  const x = Math.max(0, rect.x),
    y = Math.max(0, rect.y);
  const width = Math.min(image.width, rect.x + rect.width) - x,
    height = Math.min(image.height, rect.y + rect.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Which source pixels the recipe's mask hides. */
function maskedAlpha(image: SourceImage, recipe: SpriteRecipe): Uint8Array {
  const hidden = new Uint8Array(image.pixels.length);
  for (const rect of recipe.mask)
    for (let y = rect.y; y < Math.min(image.height, rect.y + rect.height); y++)
      hidden.fill(
        rect.hidden ? 1 : 0,
        y * image.width + rect.x,
        y * image.width + Math.min(image.width, rect.x + rect.width),
      );
  return hidden;
}

function swatch(color: number, slot: number): HTMLElement {
  const { r, g, b } = unpackRgba(rgb555ToRgba(color));
  const box = make('span', '', { class: 'swatch', title: `${slot}: ${color}` });
  if (slot) box.style.background = `rgb(${r} ${g} ${b})`;
  return box;
}
