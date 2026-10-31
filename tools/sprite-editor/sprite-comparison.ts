import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import {
  readSpriteLodAsset,
  SPRITE_SOURCE_TEXELS_PER_METER,
  type SpriteLevel,
  type SpriteLodAsset,
  type SpriteShadowDocument,
} from '../../src/image/sprite.js';
import { imagePathIn } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import type { BoardShadowCaster } from '../graphics/board-shadow.js';
import { placedOriginalBody } from '../graphics/sprite-basis.js';
import { maskedSource, type SpriteRecipe } from '../graphics/sprite-import.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import type { SourceImage } from '../graphics/sprite-source-compiler.js';
import type { SpriteImport } from './sprite-importer.js';
import { pictureAsset, placedPicture, type UsedPicture } from './sprite-pictures.js';

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
/** A collision width's half, in master texels: the lines stand that far each side of the base point. */
const halfWidth = (width: number) => (width * SPRITE_SOURCE_TEXELS_PER_METER) / 2;
/** One tile of the checkerboard behind the pictures, 8-pixel squares. */
const checkerTile = () => {
  const tile = new OffscreenCanvas(16, 16);
  const graphics = tile.getContext('2d')!;
  graphics.fillStyle = '#2a2e34';
  graphics.fillRect(0, 0, 16, 16);
  graphics.fillStyle = '#3a3f46';
  graphics.fillRect(8, 0, 8, 8);
  graphics.fillRect(0, 8, 8, 8);
  return tile;
};
/** Let the page draw and take input before more work: each part of a showing is a task of its own. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

/**
 * The five pictures of an original or product picture at one scale, their base points aligned: (1) the ROM extract,
 * which this build does not raise; (2) the original course image and its shadow; (3) the original body placed by the
 * product recipe through its piece's `transform`, with the board shadow the recipe casts; (4) the saved PNG's crop, mask
 * applied; (5) the product master and its shadow. Each is drawn at a whole-number zoom over a checkerboard or the road's
 * color with the base point, the ground row, the collision lines (each width about the base point) and the original's
 * outline (picture 3's), and two chosen of them are overlaid or toggled by click or Space. A click on a picture says
 * to `pick` the texel it falls on, in whole texels from the base point's; dragging a collision line moves both about
 * the base point and says the width (m) to `resize` on release. Pictures 2 and 5 are drawn in a chosen palette where
 * they have it.
 */
export function createComparison(
  context: EditorContext,
  pick: (dx: number, dy: number) => void,
  resize: (width: number) => void,
  castShadow: (caster: BoardShadowCaster) => Promise<SpriteShadowDocument>,
) {
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

  const checker = checkerTile();
  let pictures: (Picture | null)[] = [];
  let widths: readonly number[] = [];
  let outline: SlotFrame | null = null;
  let showingSecond = false;
  // The collision lines' width while they are dragged, in metres, and the pane they are dragged on.
  let dragged: number | null = null,
    dragging: HTMLCanvasElement | null = null;
  // Each picture's pane, kept from drawing to drawing so a drag outlives a redraw.
  const figures = LABELS.map((label) => {
    const figure = make('figure');
    const canvas = make('canvas', '', { class: 'comparison-pane' });
    const missing = make('div', 'Not raised in this build', { class: 'hint comparison-missing' });
    figure.append(canvas, missing, make('div', label, { class: 'hint' }));
    return { figure, canvas, missing };
  });
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
    // A drag in progress keeps its pane as it is until release.
    if (!shown.length || dragging) return;
    const shownWidths = dragged === null ? widths : [dragged];
    const half = halfWidth(Math.max(0, ...widths, ...shownWidths));
    const left = Math.max(half, ...shown.map((p) => p.anchorX + 0.5)),
      right = Math.max(half, ...shown.map((p) => p.width - p.anchorX - 0.5)),
      top = Math.max(...shown.map((p) => p.anchorY + 0.5)),
      bottom = Math.max(0, ...shown.map((p) => p.height - p.anchorY - 0.5));
    const z =
      Number(zoom.value) ||
      Math.max(1, Math.floor(Math.min(AUTO_SIZE.height / (top + bottom), AUTO_SIZE.width / (left + right))));
    const width = Math.ceil((left + right) * z) + 2,
      height = Math.ceil((top + bottom) * z) + 2;
    // The original's outline, once for every pane: each edge between a texel of picture 3's body and one outside it.
    const edges =
      outline &&
      outlinePath(
        outline,
        Math.round((left - outline.anchorX - 0.5) * z),
        Math.round((top - outline.anchorY - 0.5) * z),
        z,
      );
    // A picture's own pane picks a texel; the compared pane's click toggles it.
    const paint = (canvas: HTMLCanvasElement, layers: readonly Picture[], pickable = true) => {
      canvas.width = width;
      canvas.height = height;
      if (pickable) {
        // Where the pointer is, in texels from the base point.
        const at = (event: PointerEvent) => {
          const box = canvas.getBoundingClientRect();
          return {
            x: ((event.clientX - box.left) * width) / box.width / z - left,
            y: ((event.clientY - box.top) * height) / box.height / z - top,
          };
        };
        canvas.onpointerdown = (event) => {
          // A press within a few screen pixels of a collision line drags the lines.
          const { x } = at(event);
          if (!widths.some((w) => Math.abs(Math.abs(x) - halfWidth(w)) * z <= 6)) return;
          dragging = canvas;
          canvas.setPointerCapture(event.pointerId);
        };
        canvas.onpointermove = (event) => {
          if (dragging !== canvas) return;
          // Both lines move by whole texels: the width is twice the distance, to a texel.
          dragged = Math.round(Math.abs(at(event).x) * 2) / SPRITE_SOURCE_TEXELS_PER_METER;
          paint(canvas, layers);
        };
        canvas.onpointerup = (event) => {
          const { x, y } = at(event);
          if (dragging !== canvas) return pick(Math.round(x), Math.round(y));
          dragging = null;
          const width = dragged;
          dragged = null;
          if (width) resize(width);
          draw();
        };
      }
      const graphics = canvas.getContext('2d')!;
      graphics.imageSmoothingEnabled = false;
      graphics.fillStyle = background.value === 'road' ? ROAD : graphics.createPattern(checker, 'repeat')!;
      graphics.fillRect(0, 0, width, height);
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
      if (edges) {
        graphics.fillStyle = '#ff4fd8';
        graphics.fill(edges);
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
      for (const w of shownWidths)
        for (const side of [-1, 1]) {
          const x = Math.round((left + side * halfWidth(w)) * z) + 0.5;
          graphics.moveTo(x, 0);
          graphics.lineTo(x, height);
        }
      graphics.stroke();
    };
    panes.replaceChildren(
      ...pictures.map((picture, i) => {
        const { figure, canvas, missing } = figures[i]!;
        canvas.hidden = !picture;
        missing.hidden = !!picture;
        if (picture) paint(canvas, [picture]);
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

  // Each showing is numbered: one that a later showing overtook while it worked is dropped.
  let showings = 0;

  /**
   * A baked picture's pictures: 2 its pieces' originals composed through their transforms at its master's extent, 3
   * the same over the board shadow the recipe casts, and 4 and 5 as any product's.
   */
  const showBaked = async (
    picture: UsedPicture,
    source: OpenSource | null,
    palette: string | null,
    current: () => boolean,
  ) => {
    const level = source?.made?.asset.levels[0];
    const placed = source && level ? await placedPicture(context, picture, { recipe: source.recipe, level }) : null;
    if (!current()) return;
    if (!source || !level || !placed) {
      element.hidden = true;
      pictures = [];
      return;
    }
    const frame = placed.frame;
    const caster = { width: frame.width, height: frame.height, anchorX: frame.anchorX, anchorY: frame.anchorY };
    let bakedShadow: SlotFrame | null = null;
    const made = await inTasks(current, [
      () => null,
      () => framePicture(LABELS[1], frame, placed.colors, null),
      async () => {
        if (source.recipe.shadow)
          bakedShadow = shadowFrame(await castShadow({ ...caster, levels: [{ indices: frame.indices }] }));
        return undefined;
      },
      () => framePicture(LABELS[2], frame, placed.colors, bakedShadow),
      () => pngPicture(LABELS[3], source, level),
      () => levelPicture(LABELS[4], level, palette ? source.made?.master.palettes[palette]?.colors : null, false),
    ]);
    if (!made) return;
    widths = picture.widths;
    outline = { ...caster, indices: frame.indices };
    pictures = made;
    element.hidden = false;
    fillChoices();
    draw();
  };

  return {
    element,
    /**
     * Show `picture`'s pictures, with its open source when it has one; a general picture shows none. Each picture is
     * made in a task of its own, so the page never waits on them all at once.
     */
    async show(picture: UsedPicture | null, source: OpenSource | null, palette: string | null = null) {
      const showing = ++showings;
      const current = () => showing === showings;
      if (picture?.baked) return showBaked(picture, source, palette, current);
      const original = picture?.original ? await readOriginal(picture.original) : null;
      if (!current()) return;
      if (!picture || picture.kind === 'general' || !original) {
        element.hidden = true;
        pictures = [];
        return;
      }
      // A product's master: the open source's import, else its saved image.
      const level =
        source?.made?.asset.levels[0] ??
        (picture.kind === 'product' ? (await pictureAsset(context, picture.name))?.levels[0] : undefined);
      if (!current()) return;
      const product = picture.kind === 'product' && source && level ? { source, level } : null;
      let placed: SlotFrame | null = null,
        shadow: SlotFrame | null = null;
      const made = await inTasks(current, [
        () => null,
        () => levelPicture(LABELS[1], original.levels[0]!, palette ? original.palettes[palette]?.colors : null),
        ...(product
          ? [
              // Picture 3 in three tasks: the placed body, its board shadow, and the picture of both.
              () => {
                const { source, level } = product;
                const body = spriteLayers(original.levels[0]!).body;
                placed = {
                  width: level.width,
                  height: level.height,
                  anchorX: level.anchorX,
                  anchorY: level.anchorY,
                  indices: placedOriginalBody(source.recipe, level, body).indices,
                };
                return undefined;
              },
              async () => {
                if (product.source.recipe.shadow)
                  shadow = shadowFrame(await castShadow({ ...placed!, levels: [{ indices: placed!.indices }] }));
                return undefined;
              },
              () => framePicture(LABELS[2], placed!, original.palettes[original.defaultPalette]!.colors, shadow),
              () => pngPicture(LABELS[3], product.source, product.level),
              () =>
                levelPicture(
                  LABELS[4],
                  product.level,
                  palette ? product.source.made?.master.palettes[palette]?.colors : null,
                  false,
                ),
            ]
          : []),
      ]);
      if (!made) return;
      widths = picture.widths;
      outline = placed;
      pictures = made;
      element.hidden = false;
      fillChoices();
      draw();
    },
  };
}

/**
 * Make the pictures, each step in a task of its own (a step making no picture, `undefined`, prepares the next); null
 * once `current` says a later showing has begun.
 */
async function inTasks(
  current: () => boolean,
  makers: readonly (() => Picture | null | undefined | Promise<undefined>)[],
): Promise<(Picture | null)[] | null> {
  const made: (Picture | null)[] = [];
  for (const maker of makers) {
    const picture = await maker();
    if (picture !== undefined) made.push(picture);
    await nextTask();
    if (!current()) return null;
  }
  return made;
}

function outlinePath(frame: SlotFrame, x0: number, y0: number, z: number): Path2D {
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < frame.width && y < frame.height && frame.indices[y * frame.width + x]! > 0;
  const path = new Path2D();
  for (let y = 0; y <= frame.height; y++)
    for (let x = 0; x <= frame.width; x++) {
      if (at(x, y) !== at(x - 1, y)) path.rect(x0 + x * z, y0 + y * z, 1, z);
      if (at(x, y) !== at(x, y - 1)) path.rect(x0 + x * z, y0 + y * z, z, 1);
    }
  return path;
}

function shadowFrame(shadow: SpriteShadowDocument): SlotFrame {
  return { ...shadow, indices: shadow.levels[0]!.indices };
}

/**
 * A course image level: its body in its colors (or `colors`, another palette's) over its shadow; an original's master
 * holds its shadow's texels, a product picture's does not (`shadowInMaster` false).
 */
function levelPicture(
  label: string,
  level: SpriteLevel,
  colors: readonly number[] | null | undefined,
  shadowInMaster = true,
): Picture {
  const { body, shadow } = spriteLayers(level, false, shadowInMaster);
  return framePicture(label, body, colors ?? level.paletteRgb555, shadow);
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
