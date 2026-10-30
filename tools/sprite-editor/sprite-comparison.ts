import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { readSpriteLodAsset, type SpriteLevel, type SpriteLodAsset } from '../../src/image/sprite.js';
import { imagePathIn } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { boardShadow } from '../graphics/board-shadow.js';
import { placedOriginalBody } from '../graphics/sprite-basis.js';
import { maskedSource, type SpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteImport } from './sprite-importer.js';
import type { UsedPicture } from './sprite-pictures.js';

/** The open source as the import screen read and imported it. */
export interface OpenSource {
  readonly name: string;
  readonly recipe: SpriteRecipe;
  /** The revision the recipe was read at, which an edit of it carries. */
  readonly revision: number;
  readonly image: SourceImage;
  /** The importer's key of the PNG's bytes. */
  readonly key: string;
  readonly made: SpriteImport | null;
}

/** One picture of the comparison: its extent and base point in master texels and its pixels, drawn to that extent. */
interface Picture {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly canvas: OffscreenCanvas;
}

/** A frame of palette slots with its base point, as a shadow is. */
interface SlotFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: readonly number[];
}

const LABELS = ['1 ROM extract', '2 Original', '3 Original placed', '4 Saved PNG', '5 Product master'] as const;
/** The largest extent of a picture at automatic zoom, in screen pixels. */
const AUTO_SIZE = { width: 300, height: 360 } as const;
/** The road's color behind the pictures, in place of the checkerboard. */
const ROAD = '#6b6b6b';

/**
 * The five pictures of an original or product picture at one scale, their base points aligned: (1) the ROM extract,
 * which this build does not raise; (2) the original course image and its shadow; (3) the original body placed by the
 * product recipe through `basedOn.transform`, with the board shadow the recipe casts; (4) the saved PNG's crop, mask
 * applied; (5) the product master and its shadow. Each is drawn at a whole-number zoom over a checkerboard or the road's
 * color with the base point, the ground row, the collision lines (each width about the base point) and the original's
 * outline (picture 3's), and two chosen of them are overlaid or toggled by click or Space. A click on a picture says
 * to `pick` the texel it falls on, in whole texels from the base point's.
 */
export function createComparison(context: EditorContext, pick: (dx: number, dy: number) => void) {
  const element = make('div', '', { class: 'comparison' });
  const zoom = make('select');
  zoom.append(
    make('option', 'auto', { value: '0' }),
    ...[1, 2, 3, 4, 6, 8].map((z) => make('option', `${z}×`, { value: String(z) })),
  );
  const background = make('select');
  background.append(make('option', 'checkerboard', { value: 'checker' }), make('option', 'road', { value: 'road' }));
  const first = make('select'),
    second = make('select'),
    mode = make('select');
  mode.append(make('option', 'overlay', { value: 'overlay' }), make('option', 'toggle', { value: 'toggle' }));
  const panes = make('div', '', { class: 'comparison-panes' });
  const compare = make('canvas', '', { class: 'comparison-pane', tabindex: '0' });
  const compareLabel = make('div', '', { class: 'hint' });
  const comparePane = make('figure');
  comparePane.append(compare, compareLabel);
  const controls = make('p');
  const labelled = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  controls.append(
    labelled('Zoom', zoom),
    ' ',
    labelled('Behind', background),
    ' ',
    labelled('Compare', first),
    ' ',
    labelled('with', second),
    ' ',
    mode,
  );
  element.append(controls, panes);
  element.hidden = true;

  let pictures: (Picture | null)[] = [];
  let widths: readonly number[] = [];
  let outline: SlotFrame | null = null;
  let showingSecond = false;
  const originals = new Map<string, Promise<SpriteLodAsset | null>>();
  const readOriginal = (name: string) => {
    const path = imagePathIn(context.paths(), name);
    const key = `${path} ${context.revision(path)}`;
    if (!originals.has(key))
      originals.set(
        key,
        context.store
          .read(path)
          .then((bytes) => readSpriteLodAsset(JSON.parse(new TextDecoder().decode(bytes))))
          .catch(() => null),
      );
    return originals.get(key)!;
  };

  const draw = () => {
    const shown = pictures.filter((p): p is Picture => p !== null);
    if (!shown.length) return;
    const half = Math.max(0, ...widths) * 20;
    const left = Math.max(half, ...shown.map((p) => p.anchorX + 0.5)),
      right = Math.max(half, ...shown.map((p) => p.width - p.anchorX - 0.5)),
      top = Math.max(...shown.map((p) => p.anchorY + 0.5)),
      bottom = Math.max(0, ...shown.map((p) => p.height - p.anchorY - 0.5));
    const z =
      Number(zoom.value) ||
      Math.max(1, Math.floor(Math.min(AUTO_SIZE.height / (top + bottom), AUTO_SIZE.width / (left + right))));
    const width = Math.ceil((left + right) * z) + 2,
      height = Math.ceil((top + bottom) * z) + 2;
    // A picture's own pane picks a texel; the compared pane's click toggles it.
    const paint = (canvas: HTMLCanvasElement, layers: readonly Picture[], pickable = true) => {
      canvas.width = width;
      canvas.height = height;
      if (pickable)
        canvas.onclick = (event) => {
          const box = canvas.getBoundingClientRect();
          pick(
            Math.round(((event.clientX - box.left) * width) / box.width / z - left),
            Math.round(((event.clientY - box.top) * height) / box.height / z - top),
          );
        };
      const graphics = canvas.getContext('2d')!;
      graphics.imageSmoothingEnabled = false;
      if (background.value === 'road') {
        graphics.fillStyle = ROAD;
        graphics.fillRect(0, 0, width, height);
      } else
        for (let y = 0; y < height; y += 8)
          for (let x = 0; x < width; x += 8) {
            graphics.fillStyle = (x + y) % 16 ? '#3a3f46' : '#2a2e34';
            graphics.fillRect(x, y, 8, 8);
          }
      layers.forEach((picture, i) => {
        graphics.globalAlpha = i ? 0.5 : 1;
        graphics.drawImage(
          picture.canvas,
          Math.round((left - picture.anchorX - 0.5) * z),
          Math.round((top - picture.anchorY - 0.5) * z),
          Math.round(picture.width * z),
          Math.round(picture.height * z),
        );
      });
      graphics.globalAlpha = 1;
      // The original's outline: each edge between a texel of picture 3's body and one outside it.
      if (outline) {
        const frame = outline;
        const x0 = Math.round((left - frame.anchorX - 0.5) * z),
          y0 = Math.round((top - frame.anchorY - 0.5) * z);
        const at = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < frame.width && y < frame.height && frame.indices[y * frame.width + x]! > 0;
        graphics.fillStyle = '#ff4fd8';
        for (let y = 0; y <= frame.height; y++)
          for (let x = 0; x <= frame.width; x++) {
            if (at(x, y) !== at(x - 1, y)) graphics.fillRect(x0 + x * z, y0 + y * z, 1, z);
            if (at(x, y) !== at(x, y - 1)) graphics.fillRect(x0 + x * z, y0 + y * z, z, 1);
          }
      }
      // The base point, the ground row through it and the collision lines.
      const ax = Math.round(left * z),
        ay = Math.round(top * z);
      graphics.strokeStyle = '#ffd33d';
      graphics.beginPath();
      graphics.moveTo(0, ay + 0.5);
      graphics.lineTo(width, ay + 0.5);
      graphics.moveTo(ax + 0.5, ay - 8);
      graphics.lineTo(ax + 0.5, ay + 8);
      graphics.stroke();
      graphics.strokeStyle = '#ff7b72';
      graphics.beginPath();
      for (const w of widths)
        for (const side of [-1, 1]) {
          const x = Math.round((left + side * w * 20) * z) + 0.5;
          graphics.moveTo(x, 0);
          graphics.lineTo(x, height);
        }
      graphics.stroke();
    };
    panes.replaceChildren(
      ...pictures.map((picture, i) => {
        const figure = make('figure');
        if (picture) {
          const canvas = make('canvas', '', { class: 'comparison-pane' });
          paint(canvas, [picture]);
          figure.append(canvas);
        } else figure.append(make('div', 'Not raised in this build', { class: 'hint comparison-missing' }));
        figure.append(make('div', LABELS[i]!, { class: 'hint' }));
        return figure;
      }),
      comparePane,
    );
    const a = pictures[Number(first.value)] ?? null,
      b = pictures[Number(second.value)] ?? null;
    comparePane.hidden = !a || !b || a === b;
    if (a && b) {
      const both = mode.value === 'overlay';
      paint(compare, both ? [a, b] : [showingSecond ? b : a], false);
      compareLabel.textContent = both
        ? `${a.label} under ${b.label} at half opacity`
        : `${showingSecond ? b.label : a.label}: click or Space for ${showingSecond ? a.label : b.label}`;
    }
  };
  // The two pictures compared, as last chosen: 3 and 5 at first. A picture that is not shown is not offered.
  const wanted = ['2', '4'];
  const fillChoices = () =>
    [first, second].forEach((select, i) => {
      select.replaceChildren(
        ...pictures.flatMap((picture, j) => (picture ? [make('option', LABELS[j]!, { value: String(j) })] : [])),
      );
      select.value = wanted[i]!;
    });
  for (const control of [zoom, background, mode]) control.addEventListener('change', draw);
  [first, second].forEach((select, i) =>
    select.addEventListener('change', () => {
      wanted[i] = select.value;
      draw();
    }),
  );
  const flip = () => {
    if (mode.value !== 'toggle') return;
    showingSecond = !showingSecond;
    draw();
  };
  compare.addEventListener('click', flip);
  compare.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
      event.preventDefault();
      flip();
    }
  });

  return {
    element,
    /** Show `picture`'s pictures, with its open source when it has one; a general picture shows none. */
    async show(picture: UsedPicture | null, source: OpenSource | null) {
      const original = picture?.original ? await readOriginal(picture.original) : null;
      if (!picture || picture.kind === 'general' || !original) {
        element.hidden = true;
        pictures = [];
        return;
      }
      const two = levelPicture(LABELS[1], original.levels[0]!);
      pictures = [null, two];
      outline = null;
      widths = picture.widths;
      // A product's master: the open source's import, else its saved image.
      const level =
        source?.made?.asset.levels[0] ?? (picture.kind === 'product' ? picture.asset?.levels[0] : undefined);
      if (picture.kind === 'product' && source && level) {
        const body = spriteLayers(original.levels[0]!).body;
        const placed = placedOriginalBody(source.recipe, level, body);
        const caster = { width: level.width, height: level.height, anchorX: level.anchorX, anchorY: level.anchorY };
        const three = framePicture(
          LABELS[2],
          { ...caster, indices: placed.indices },
          original.palettes[original.defaultPalette]!.colors,
          source.recipe.shadow ? shadowFrame(boardShadow({ ...caster, levels: [{ indices: placed.indices }] })) : null,
        );
        outline = { ...caster, indices: placed.indices };
        pictures.push(three, pngPicture(LABELS[3], source, level), levelPicture(LABELS[4], level));
      }
      element.hidden = false;
      fillChoices();
      draw();
    },
  };
}

function shadowFrame(shadow: ReturnType<typeof boardShadow>): SlotFrame {
  return { ...shadow, indices: shadow.levels[0]!.indices };
}

/** A course image level: its body in its colors over its shadow. */
function levelPicture(label: string, level: SpriteLevel): Picture {
  const { body, shadow } = spriteLayers(level);
  return framePicture(label, body, level.paletteRgb555, shadow);
}

/** A frame of slots in `colors` over a shadow, dark and half transparent, in one frame holding both. */
function framePicture(label: string, body: SlotFrame, colors: readonly number[], shadow: SlotFrame | null): Picture {
  const dx = shadow ? Math.round(body.anchorX - shadow.anchorX) : 0,
    dy = shadow ? Math.round(body.anchorY - shadow.anchorY) : 0;
  const left = Math.min(0, dx),
    top = Math.min(0, dy);
  const width = Math.max(body.width, shadow ? dx + shadow.width : 0) - left,
    height = Math.max(body.height, shadow ? dy + shadow.height : 0) - top;
  const data = new ImageData(width, height);
  if (shadow)
    shadow.indices.forEach((slot, i) => {
      if (slot)
        data.data.set(
          [0, 0, 0, 110],
          ((dy - top + Math.floor(i / shadow.width)) * width + dx - left + (i % shadow.width)) * 4,
        );
    });
  body.indices.forEach((slot, i) => {
    if (!slot) return;
    const { r, g, b } = unpackRgba(rgb555ToRgba(colors[slot]!));
    data.data.set([r, g, b, 255], ((Math.floor(i / body.width) - top) * width + (i % body.width) - left) * 4);
  });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return { label, width, height, anchorX: body.anchorX - left, anchorY: body.anchorY - top, canvas };
}

/** The saved PNG's crop with its mask applied, at its own pixels, in the master's frame. */
function pngPicture(label: string, source: OpenSource, level: SpriteLevel): Picture {
  const { recipe } = source;
  const masked = maskedSource(source.image, recipe.mask);
  const data = new ImageData(recipe.crop.width, recipe.crop.height);
  for (let y = 0; y < recipe.crop.height; y++)
    for (let x = 0; x < recipe.crop.width; x++) {
      const sx = recipe.crop.x + x,
        sy = recipe.crop.y + y;
      if (sx >= masked.width || sy >= masked.height) continue;
      const { r, g, b, a } = unpackRgba(masked.pixels[sy * masked.width + sx]!);
      data.data.set([r, g, b, a], (y * recipe.crop.width + x) * 4);
    }
  const canvas = new OffscreenCanvas(recipe.crop.width, recipe.crop.height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return {
    label,
    width: level.width,
    height: (recipe.crop.height * level.width) / recipe.crop.width,
    anchorX: level.anchorX,
    anchorY: level.anchorY,
    canvas,
  };
}
