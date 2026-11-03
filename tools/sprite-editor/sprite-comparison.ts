import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLevel } from '../../src/image/sprite.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { piecePosition } from '../graphics/sprite-alternate-palettes.js';
import { maskedSource, type SpriteRecipe } from '../graphics/sprite-import.js';
import { masterMapping, type SourceImage } from '../graphics/sprite-source-compiler.js';
import type { OriginalShape, PictureData } from './sprite-comparison-pictures.js';
import type { SpriteImport } from './sprite-importer.js';
import type { PictureLooks } from './sprite-picture-looks.js';
import { originalFiles, type UsedPicture } from './sprite-pictures.js';
import type { RomExtracts } from './sprite-rom-extract.js';

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
  readonly image: CanvasImageSource;
}

/** A frame of palette slots with its base point, as a shadow is. */
interface SlotFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: ArrayLike<number>;
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
  looks: PictureLooks,
  roms: RomExtracts,
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
  // The ROM zips K drops on the page or chooses here give picture 1; they stay in this page alone.
  const romFile = make('input', '', { type: 'file', accept: '.zip,application/zip', multiple: '' });
  romFile.hidden = true;
  const romChoose = make('button', 'ROM zips…', { type: 'button' });
  const romStatus = make('span', roms.status(), { class: 'hint' });
  romChoose.addEventListener('click', () => romFile.click());
  romFile.addEventListener('change', () => {
    const chosen = [...(romFile.files ?? [])];
    romFile.value = '';
    if (chosen.length) void roms.load(chosen);
  });
  controls.append(' ', romChoose, romFile, ' ', romStatus);
  element.append(controls, panes);
  element.hidden = true;

  let checker: OffscreenCanvas | null = null;
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
      graphics.fillStyle =
        background.value === 'road' ? ROAD : graphics.createPattern((checker ??= checkerTile()), 'repeat')!;
      graphics.fillRect(0, 0, width, height);
      layers.forEach((picture, i) => {
        graphics.globalAlpha = i ? 0.5 : 1;
        graphics.drawImage(
          picture.image,
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
        // Picture 1 says what the ROM extract lacks: the zips, or a set they do not make whole.
        if (i === 0) missing.textContent = roms.status();
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
  // The last showing asked for, shown again when zips are read.
  let shownArgs: [UsedPicture | null, OpenSource | null, string | null] = [null, null, null];

  const comparison = {
    element,
    /**
     * Show `picture`'s pictures, with its open source when it has one; a general picture shows none. Pictures 2, 3 and
     * 5 are made off the page's thread (`comparisonPictures`); picture 1 is the ROM extract's and picture 4 the open
     * source's crop. A product picture without its open source shows 1 and 2, a baked one none.
     */
    async show(picture: UsedPicture | null, source: OpenSource | null, palette: string | null = null) {
      shownArgs = [picture, source, palette];
      const showing = ++showings;
      const current = () => showing === showings;
      const hide = () => {
        element.hidden = true;
        closeBitmaps(pictures);
        pictures = [];
      };
      const made = picture?.kind === 'product' && source?.made ? source.made : null;
      const recipe = made ? source!.recipe : null;
      const names = recipe && picture?.baked ? (recipe.basedOn ?? []).map((piece) => piece.image) : [picture?.original];
      if (!picture || picture.kind === 'general' || !names.every(Boolean) || (picture.baked && !made)) return hide();
      const answer = await originalFiles(context, names as string[])
        .then((originals) => looks.pictures({ originals, product: made, recipe, palette }))
        .catch(() => null);
      // The worker's pictures of an answer no longer wanted are let go at once.
      const answered = answer ? [answer.original, answer.placed, answer.product] : [];
      if (!current()) return closeBitmaps(answered);
      if (!answer) return hide();
      const level = made?.asset.levels[0];
      const shapes = answer.originals;
      const extracts = await Promise.all(
        names.map((name, i) =>
          roms.extract(name!, recipe?.basedOn?.[i]?.placement?.palette ?? shapes[i]!.defaultPalette),
        ),
      );
      if (!current()) return closeBitmaps(answered);
      const extract = !extracts.every(Boolean)
        ? null
        : picture.baked
          ? bakedExtractPicture(recipe!, level!, shapes, extracts as ImageData[])
          : extractPicture(extracts[0]!, shapes[0]!);
      const labelled = (label: string, data: PictureData | null): Picture | null => data && { label, ...data };
      closeBitmaps(pictures);
      pictures = [
        extract,
        labelled(LABELS[1], answer.original),
        ...(made && level
          ? [
              labelled(LABELS[2], answer.placed),
              pngPicture(LABELS[3], source!, level),
              labelled(LABELS[4], answer.product),
            ]
          : []),
      ];
      widths = picture.widths;
      outline = answer.outline;
      element.hidden = false;
      fillChoices();
      draw();
    },
  };
  // Zips read show picture 1 of what is shown.
  roms.subscribe(() => {
    romStatus.textContent = roms.status();
    void comparison.show(...shownArgs);
  });
  return comparison;
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

/**
 * A ROM extract over its original's grid: the extract's columns span the original picture's width and its rows the
 * grid's height, which is the shadow frame's where the original has one (the whole grid, its top and left the
 * picture's), else the picture's, without the extract's rows below that hold pens 0 and 15 alone. Each is stretched
 * evenly, so a ROM pixel lies within a texel of the one the original's chosen lines give it.
 */
function extractGrid(extract: ImageData, level: OriginalShape) {
  const clear = (row: number) => {
    for (let x = 0; x < extract.width; x++) if (extract.data[(row * extract.width + x) * 4 + 3]) return false;
    return true;
  };
  let rows = extract.height;
  if (level.shadowHeight === null) while (rows > 1 && clear(rows - 1)) rows--;
  return { rows, width: level.width, height: level.shadowHeight ?? level.height };
}

/** Let go of the pictures' bitmaps (the worker's pictures 2, 3 and 5) once they are no longer shown. */
function closeBitmaps(pictures: readonly ({ readonly image: CanvasImageSource } | null)[]): void {
  for (const picture of pictures) if (picture?.image instanceof ImageBitmap) picture.image.close();
}

/**
 * Picture 1 of an original: its ROM extract (the ROM's own pixels, pen 10 in its color) over its grid (`extractGrid`),
 * top and left on the master's and its base point the master's; the rows below the master lie below picture 2.
 */
function extractPicture(extract: ImageData, level: OriginalShape): Picture {
  const { rows, width, height } = extractGrid(extract, level);
  const canvas = new OffscreenCanvas(extract.width, rows);
  canvas.getContext('2d')!.putImageData(extract, 0, 0);
  return { label: LABELS[0], width, height, anchorX: level.anchorX, anchorY: level.anchorY, image: canvas };
}

/**
 * Picture 1 of a baked picture: at each texel of its master and below it, the ROM extract of each piece whose original
 * grid (`extractGrid`) its transform places there (`piecePosition`), a later piece over an earlier one.
 */
function bakedExtractPicture(
  recipe: SpriteRecipe,
  level: { readonly width: number; readonly height: number; readonly anchorX: number; readonly anchorY: number },
  originals: readonly OriginalShape[],
  extracts: readonly ImageData[],
): Picture {
  const width = level.width;
  // Each piece's ROM pixel under a master column and row: the map is separable, so it is worked out once for each.
  const pieces = (recipe.basedOn ?? []).map((piece, i) => {
    const position = piecePosition(recipe, piece, width);
    const extract = extracts[i]!,
      grid = extractGrid(extract, originals[i]!);
    // The master row where the piece's grid ends: a transform moves rows evenly.
    const top = position(0, 0)[1],
      step = position(0, 1)[1] - top;
    const columns = Int32Array.from({ length: width }, (_, mx) =>
      Math.floor((position(mx, 0)[0] * extract.width) / grid.width),
    );
    return { position, grid, extract, columns, bottom: Math.ceil((grid.height - top) / step) };
  });
  const height = Math.max(level.height, ...pieces.map((piece) => piece.bottom));
  const data = new ImageData(width, height);
  const out = new Uint32Array(data.data.buffer);
  for (const { position, grid, extract, columns } of pieces) {
    const from = new Uint32Array(extract.data.buffer, extract.data.byteOffset, extract.width * extract.height);
    for (let my = 0; my < height; my++) {
      const py = Math.floor((position(0, my)[1] * grid.rows) / grid.height);
      if (py < 0 || py >= grid.rows) continue;
      for (let mx = 0; mx < width; mx++) {
        const px = columns[mx]!;
        if (px < 0 || px >= extract.width) continue;
        const pixel = from[py * extract.width + px]!;
        // A pixel with any alpha is drawn: a clear pen's alpha is 0.
        if (extract.data[(py * extract.width + px) * 4 + 3]) out[my * width + mx] = pixel;
      }
    }
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return { label: LABELS[0], width, height, anchorX: level.anchorX, anchorY: level.anchorY, image: canvas };
}

/** The saved PNG's crop with its mask applied, at its own pixels, in the master's frame. */
function pngPicture(label: string, source: OpenSource, level: SpriteLevel): Picture {
  const { recipe } = source;
  const masked = maskedSource(source.image, recipe.mask);
  const { crop } = recipe;
  const data = new ImageData(crop.width, crop.height);
  // The source's pixels are words as an ImageData holds them (`rgba`): each row of the crop is copied whole.
  const pixels = new Uint32Array(data.data.buffer),
    across = Math.max(0, Math.min(crop.width, masked.width - crop.x));
  for (let y = 0; y < crop.height && crop.y + y < masked.height; y++) {
    const from = (crop.y + y) * masked.width + crop.x;
    pixels.set(masked.pixels.subarray(from, from + across), y * crop.width);
  }
  const canvas = new OffscreenCanvas(recipe.crop.width, recipe.crop.height);
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  return {
    label,
    width: level.width,
    height: recipe.crop.height * masterMapping(recipe, level.width).scale,
    anchorX: level.anchorX,
    anchorY: level.anchorY,
    image: canvas,
  };
}
