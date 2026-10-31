import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import {
  importedImageFiles,
  maskedSource,
  defaultSpriteAnchor,
  readSpriteRecipe,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import type { SourceImage, SpriteCrop } from '../graphics/sprite-source-compiler.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import type { SpriteImport, SpriteImporter } from './sprite-importer.js';
import type { OpenSource } from './sprite-comparison.js';
import { createSpritePreview, PREVIEW_DEPTH } from './sprite-preview.js';
import { make } from '../browser-shared/dom.js';
import { imageNameOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import { confirmField, drawField, finiteNumber, pointerDrag } from '../browser-shared/pending-edit.js';

type Tool = 'crop' | 'hide' | 'show' | 'anchor';
const TOOLS: readonly Tool[] = ['crop', 'hide', 'show', 'anchor'];
/** Screen pixels per source pixel in the source view. */
const ZOOM = 4;

/**
 * Import: a source PNG and its recipe under `sprite-sources/`. The source shows its crop, mask and anchor; dragging on
 * it with a tool edits the recipe (one step each); the master is imported by the sprite operations and previewed with
 * the product's drawing. A course image is written as its named file. The page opens a source by name (`open`); a new
 * source is opened and said to `added`. Each showing is said to `shown`.
 */
export function mountSourceView(
  element: HTMLElement,
  context: EditorContext,
  importInWorker: SpriteImporter,
  added: (name: string) => void,
  shown: (source: OpenSource | null) => void,
) {
  const title = make('h2', 'Import');
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
    title,
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
  const empty = make('p', 'No source is open: choose one, or name a new source and choose its PNG.', { class: 'hint' });
  panes.before(empty);
  const previewPane = make('div');
  previewPane.append(preview.canvas, make('br'), field('Depth (m)', depth), ' ', writeCourse);
  panes.append(canvas, previewPane);

  // The open source: its recipe as saved (and the revision it was read at), its decoded image and what was imported
  // from them (the master, its levels and their asset).
  let opened: string | null = null,
    name: string | null = null,
    recipe: SpriteRecipe | null = null,
    recipeRevision = 0,
    // The source the recipe is of: the open one once its reading is done.
    recipeName: string | null = null,
    image: SourceImage | null = null,
    decodedKey: string | null = null,
    decoded: SourceImage | null = null,
    made: SpriteImport | null = null;
  // A rectangle being dragged on the source, shown before the recipe changes.
  let drag: Drag | null = null;
  const recipePath = () => `${SPRITE_SOURCES_DIRECTORY}/${name}.json`;
  /** The open recipe as read, which an edit begins from. */
  // Each field's shown value and the recipe reading it was drawn from, which its edit is made from.
  const drawnFrom = new Map<HTMLElement, RecipeReading | null>();
  const reading = (): RecipeReading | null =>
    recipe && recipeName
      ? { name: recipeName, path: `${SPRITE_SOURCES_DIRECTORY}/${recipeName}.json`, recipe, revision: recipeRevision }
      : null;
  /** One edit of the recipe `from` was read as. */
  const save = (from: RecipeReading, next: SpriteRecipe, label: string) =>
    context.replace(from.path, next, from.revision, `${label} (${from.name})`);

  const draw = () => {
    if (!image || !recipe) return;
    canvas.width = image.width * ZOOM;
    canvas.height = image.height * ZOOM;
    const graphics = canvas.getContext('2d')!;
    const data = new ImageData(image.width, image.height);
    // A pixel the recipe's mask hides (import's `maskedSource`) is shown dimmed.
    const masked = maskedSource(image, recipe.mask);
    for (let i = 0; i < image.pixels.length; i++) {
      const { r, g, b, a } = unpackRgba(image.pixels[i]!);
      const hidden = unpackRgba(masked.pixels[i]!).a < a;
      data.data.set(hidden ? [r >> 2, g >> 2, b >> 2, 255] : [r, g, b, a], i * 4);
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
  // The import's levels are compiled once, in the worker; a redraw or a depth only draws them.
  const drawPreview = () => {
    if (!made || !recipe) return;
    const { master, lod, asset } = made;
    const levels = preview.draw([{ asset, palette: master.defaultPalette }], Number(depth.value));
    note.textContent = `${master.name}: ${master.width} × ${master.height} master, ${lod.levels.length} levels; at ${depth.value} m level ${levels[0]}.`;
  };

  const show = async () => {
    name = opened && context.paths().includes(`${SPRITE_SOURCES_DIRECTORY}/${opened}.png`) ? opened : null;
    title.textContent = name ? `Import: ${name}` : 'Import';
    if (!name) {
      recipe = image = made = null;
      panes.hidden = true;
      empty.hidden = false;
      shown(null);
      return;
    }
    // The open source stays as it was while it is read again, so what is typed or pressed meanwhile is not lost; the
    // new reading replaces it whole. Another source puts the last one's away at once: nothing typed, dragged or pressed
    // meanwhile edits it.
    if (name !== recipeName) {
      recipe = image = made = recipeName = null;
      drawnFrom.clear();
      panes.hidden = true;
    }
    try {
      const bytes = await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${name}.png`);
      const key = `${name} ${await contentDigest(bytes)}`;
      if (key !== decodedKey) {
        decoded = await decodeSpritePng(bytes, PNG);
        decodedKey = key;
      }
      const read = await context.readFile(recipePath());
      const nextRecipe = readSpriteRecipe(JSON.parse(new TextDecoder().decode(read.bytes)));
      image = decoded;
      recipe = nextRecipe;
      recipeName = name;
      recipeRevision = read.revision;
    } catch (error) {
      recipe = image = made = null;
      note.textContent = `${name}: ${error instanceof Error ? error.message : error}`;
    }
    if (recipe && image)
      try {
        made = await importInWorker(decodedKey!, image, recipe, name);
      } catch (error) {
        made = null;
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
        drawField(
          input,
          values[key as keyof typeof fields],
          reading(),
          drawnFrom,
          (held, next) => held.path === next.path && context.follows(next.path, held.revision, next.revision),
        );
      // The master carries the palette its import chose, so the color rule runs once for both.
      swatches.replaceChildren(...(made ? made.master.palettes[made.master.defaultPalette]!.colors : []).map(swatch));
      automatic.disabled = recipe.palettes === null;
    }
    // Without an open source there is nothing to show but how to add one.
    panes.hidden = !recipe;
    empty.hidden = !!recipe;
    draw();
    drawPreview();
    shown(
      recipe && image && recipeName && decodedKey
        ? { name: recipeName, recipe, revision: recipeRevision, image, key: decodedKey, made }
        : null,
    );
  };
  let showing = Promise.resolve();
  const refresh = () => (showing = showing.then(show));
  context.subscribe(() => void refresh());
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
    // A new source is made from no file: its edits carry the revisions found.
    context.setFile(`${base}.png`, bytes, context.revision(`${base}.png`), `Add source ${chosen}`);
    context.replace(
      `${base}.json`,
      {
        format: SPRITE_RECIPE_FORMAT,
        version: SPRITE_RECIPE_VERSION,
        crop: { x: 0, y: 0, width: decodedNew.width, height: decodedNew.height },
        widthMeters: decodedNew.width / SPRITE_SOURCE_TEXELS_PER_METER,
        anchor: defaultSpriteAnchor(decodedNew.width),
        mask: [],
        palettes: null,
      } satisfies SpriteRecipe,
      context.revision(`${base}.json`),
      `Add recipe ${chosen}`,
    );
    newName.value = '';
    opened = chosen;
    added(chosen);
    void refresh();
  });

  // Fields are saved when confirmed.
  const recipeField = <T>(
    input: HTMLInputElement | HTMLSelectElement,
    parse: (text: string) => T | null,
    apply: (current: SpriteRecipe, value: T) => SpriteRecipe,
    label: string,
  ) =>
    confirmField(
      input,
      parse,
      (value, from) => from && save(from, apply(from.recipe, value), label),
      () => drawnFrom.get(input) ?? null,
      () => void refresh(),
    );
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
    const from = reading();
    if (from && image && decodedKey) {
      const chosen = { ...from.recipe, palettes: null };
      importInWorker(decodedKey, image, chosen, from.name).then(
        ({ master: generated }) => {
          const first = from.recipe.palettes ? Object.keys(from.recipe.palettes)[0]! : 'original';
          const original = generated.palettes[generated.defaultPalette]!.colors;
          save(from, { ...from.recipe, palettes: { ...from.recipe.palettes, [first]: original } }, 'Generate palette');
        },
        (error: Error) => (note.textContent = `${from.name}: ${error.message}`),
      );
    }
  });
  automatic.addEventListener('click', () => {
    const from = reading();
    if (from) save(from, { ...from.recipe, palettes: null }, 'Palette from each import');
  });
  clearMask.addEventListener('click', () => {
    const from = reading();
    if (from) save(from, { ...from.recipe, mask: [] }, 'Clear mask');
  });
  writeCourse.addEventListener('click', () => {
    if (!made || !recipe) return;
    const { master } = made;
    const files = importedImageFiles(recipe, master);
    // A picture of the same name in the originals' place is an original, which no page writes.
    const paths = context.paths();
    const original = files.map((file) => imagePathIn(paths, imageNameOfPath(file.path)!)).find(inOriginalsPlace);
    if (original) {
      note.textContent = `content/${original} is an original picture, which no page writes; give the source another name.`;
      return;
    }
    // The picture and its reflection are one edit.
    // The images are made from the source, not from the images they replace: the edit carries the revisions found.
    context.setFiles(
      files.map((file) => [file.path, file.bytes, context.revision(file.path)] as const),
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
      const from = reading();
      if (!image || !from) return null;
      const { x, y } = at(event);
      return { x0: x, y0: y, x1: x, y1: y, from };
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
      if (!image) return;
      const { from } = pending,
        rect = clip(rectangle(pending), image);
      if (tool === 'anchor')
        save(from, { ...from.recipe, anchor: { ...from.recipe.anchor, x: pending.x1 } }, 'Set anchor');
      else if (!rect) return;
      else if (tool === 'crop') save(from, { ...from.recipe, crop: rect }, 'Set crop');
      else
        save(
          from,
          { ...from.recipe, mask: [...from.recipe.mask, { ...rect, hidden: tool === 'hide' }] },
          tool === 'hide' ? 'Hide' : 'Show',
        );
    },
  });
  return {
    /** Open the sprite source `name`, or none. */
    open(next: string | null) {
      opened = next;
      return refresh();
    },
  };
}

/** A recipe as the view read it: its source's name, its path and the revision an edit made from it carries. */
interface RecipeReading {
  readonly name: string;
  readonly path: string;
  readonly recipe: SpriteRecipe;
  readonly revision: number;
}

/** A drag on the source: where it started and where it is, in source pixels, and the recipe it began from. */
interface Drag {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly from: RecipeReading;
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

function swatch(color: number, slot: number): HTMLElement {
  const { r, g, b } = unpackRgba(rgb555ToRgba(color));
  const box = make('span', '', { class: 'swatch', title: `${slot}: ${color}` });
  if (slot) box.style.background = `rgb(${r} ${g} ${b})`;
  return box;
}
