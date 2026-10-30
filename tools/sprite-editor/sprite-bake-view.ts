import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { readSpriteLodAsset, SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodAsset } from '../../src/image/sprite.js';
import { coursePathIn, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import { bakeCoursePieces, findBakeEntries, siteCombination, type BakeEntry } from '../authoring/course-bake.js';
import { savedCourseDocument } from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { alternatePiecePalettes, composePieces, type ComposedPieces } from '../graphics/sprite-bake.js';
import { spriteBodyPng } from '../graphics/sprite-body-png.js';
import {
  importedImageFiles,
  readSpriteRecipe,
  recipeOriginal,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
  type SpriteRecipePiece,
} from '../graphics/sprite-import.js';
import { spriteRaster } from '../graphics/sprite-layers.js';
import { encodeSpritePng } from '../graphics/sprite-png.js';
import { spriteMasterWidth } from '../graphics/sprite-source-compiler.js';
import type { SpriteImporter } from './sprite-importer.js';

/** Screen pixels per texel in the composition's preview. */
const ZOOM = 2;

/** A piece's picture as the composition reads it: its asset and, for a product picture, its recipe's one original. */
interface PiecePicture {
  readonly asset: SpriteLodAsset;
  readonly recipe: SpriteRecipe | null;
}

/**
 * Baking ([NEXT](../../docs/NEXT.md)'s Baking): the chosen product course's bake entries (`findBakeEntries`), each
 * groups of one arrangement with their count. A chosen entry is composed as its pieces look now (`composePieces`, the
 * first site's palettes), each piece kept or left out and moved by texels, the base point moved too, and the name
 * given. Baking writes in one edit the product picture (the composition's PNG at master texels and its recipe: its
 * width, base point, the palettes `alternatePiecePalettes` makes for every site's combination, a board shadow when a
 * piece standing on the ground has a shadow, and `basedOn` each piece with its original, digest, transform and
 * placement), its images, and the course with each site's pieces given way to one placement; `baked` hears the name.
 */
export function createBakeView(
  context: EditorContext,
  importInWorker: SpriteImporter,
  course: () => string | null,
  baked: (name: string) => void,
) {
  const entrySelect = make('select');
  const pieceList = make('div', '', { class: 'bake-pieces' });
  const name = make('input', '', { size: '36' });
  const bake = make('button', 'Bake', { type: 'button' });
  const canvas = make('canvas', '', { class: 'bake-preview', tabindex: '0' });
  const status = make('p', '', { role: 'status', class: 'hint' });
  const element = make('details', '', { class: 'bake' });
  const nameLabel = make('label', 'Name ');
  nameLabel.append(name);
  element.append(
    make('summary', 'Baking'),
    entrySelect,
    pieceList,
    nameLabel,
    ' ',
    bake,
    make('p', 'Arrow keys on the picture move the chosen piece, or the base point.', { class: 'hint' }),
    canvas,
    status,
  );

  let entries: readonly BakeEntry[] = [],
    entry: BakeEntry | null = null,
    pictures: PiecePicture[] = [],
    included: boolean[] = [],
    moved: { x: number; y: number }[] = [],
    anchorMove = { x: 0, y: 0 },
    // Whether K has named the picture.
    named = false,
    // The piece the arrow keys move; −1 for the base point.
    target = -1,
    composed: ComposedPieces | null = null;

  const readPicture = async (image: string): Promise<PiecePicture> => {
    const paths = context.paths();
    const asset = readSpriteLodAsset(
      JSON.parse(new TextDecoder().decode(await context.store.read(imagePathIn(paths, image)))),
    );
    const recipePath = `${SPRITE_SOURCES_DIRECTORY}/${image}.json`;
    const recipe = paths.includes(recipePath)
      ? readSpriteRecipe(JSON.parse(new TextDecoder().decode(await context.store.read(recipePath))))
      : null;
    return { asset, recipe };
  };

  /** The included pieces of the first site, measured from the first included piece's lateral. */
  const compose = () => {
    if (!entry) return null;
    const site = entry.sites[0]!;
    const first = site.pieces.find((_, i) => included[i]);
    if (!first) return null;
    const chosen = site.pieces.flatMap((piece, i) => (included[i] ? [{ piece, i }] : []));
    return composePieces(
      chosen.map(({ piece, i }) => {
        const { asset } = pictures[i]!;
        return {
          frame: spriteRaster(asset.levels[0]!),
          colors: asset.palettes[piece.palette]!.colors,
          across: piece.offset - first.offset,
          up: piece.groundOffset,
          moved: moved[i]!,
        };
      }),
    );
  };

  const draw = () => {
    composed = compose();
    if (!composed) {
      canvas.width = canvas.height = 0;
      return;
    }
    const { image } = composed;
    canvas.width = image.width * ZOOM;
    canvas.height = image.height * ZOOM;
    const data = new ImageData(
      new Uint8ClampedArray(image.pixels.slice().buffer as ArrayBuffer),
      image.width,
      image.height,
    );
    const scratch = new OffscreenCanvas(image.width, image.height);
    scratch.getContext('2d')!.putImageData(data, 0, 0);
    const graphics = canvas.getContext('2d')!;
    graphics.imageSmoothingEnabled = false;
    graphics.fillStyle = '#20262e';
    graphics.fillRect(0, 0, canvas.width, canvas.height);
    graphics.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    // Each piece's frame, the chosen one brighter, and the base point.
    let n = 0;
    entry!.sites[0]!.pieces.forEach((_, i) => {
      if (!included[i]) return;
      const origin = composed!.origins[n++]!;
      const level = pictures[i]!.asset.levels[0]!;
      graphics.strokeStyle = i === target ? '#ffffff' : '#77ffe055';
      graphics.strokeRect(
        origin.x * ZOOM + 0.5,
        origin.y * ZOOM + 0.5,
        level.width * ZOOM - 1,
        level.height * ZOOM - 1,
      );
    });
    const ax = (composed.anchorX + anchorMove.x + 0.5) * ZOOM,
      ay = (composed.anchorY + anchorMove.y + 0.5) * ZOOM;
    graphics.strokeStyle = target < 0 ? '#ffffff' : '#ffd33d';
    graphics.beginPath();
    graphics.moveTo(ax - 8, ay);
    graphics.lineTo(ax + 8, ay);
    graphics.moveTo(ax, ay - 8);
    graphics.lineTo(ax, ay + 8);
    graphics.stroke();
  };

  const showPieces = () => {
    pieceList.replaceChildren();
    if (!entry) return;
    const choice = (label: string, index: number) => {
      const radio = make('input', '', { type: 'radio', name: 'bake-target' });
      radio.checked = target === index;
      radio.addEventListener('change', () => {
        target = index;
        draw();
      });
      const box = make('label', '');
      box.append(radio, ` ${label}`);
      return box;
    };
    entry.sites[0]!.pieces.forEach((piece, i) => {
      const keep = make('input', '', { type: 'checkbox' });
      keep.checked = included[i]!;
      keep.addEventListener('change', () => {
        included[i] = keep.checked;
        defaultName();
        draw();
      });
      const row = make('div');
      row.append(keep, ' ', choice(`${piece.image} (${piece.palette}) moved ${moved[i]!.x}, ${moved[i]!.y}`, i));
      pieceList.append(row);
    });
    pieceList.append(choice(`Base point moved ${anchorMove.x}, ${anchorMove.y}`, -1));
  };

  /** The default name: the leftmost included piece's original's, until K names it. */
  const defaultName = () => {
    if (!entry || named) return;
    const pieces = entry.sites[0]!.pieces;
    const chosen = pieces.filter((_, i) => included[i]);
    if (!chosen.length) return;
    const leftmost = chosen.reduce((left, piece) => (piece.offset < left.offset ? piece : left));
    const { recipe } = pictures[pieces.indexOf(leftmost)]!;
    name.value = `product-${(recipe && recipeOriginal(recipe)?.image) ?? leftmost.image}-baked`;
  };

  const choose = async () => {
    entry = entries[Number(entrySelect.value)] ?? null;
    named = false;
    if (!entry) {
      pictures = [];
      showPieces();
      draw();
      return;
    }
    const pieces = entry.sites[0]!.pieces;
    pictures = await Promise.all(pieces.map((piece) => readPicture(piece.image)));
    included = pieces.map(() => true);
    moved = pieces.map(() => ({ x: 0, y: 0 }));
    anchorMove = { x: 0, y: 0 };
    target = -1;
    defaultName();
    showPieces();
    draw();
  };

  const show = async () => {
    const id = course();
    if (!id) return;
    const document = JSON.parse(
      new TextDecoder().decode(await context.store.read(coursePathIn(context.paths(), id))),
    ) as Json;
    const found = findBakeEntries(document);
    const labels = found.map((candidate) => {
      const pieces = candidate.sites[0]!.pieces;
      const combinations = new Set(candidate.sites.map((site) => site.pieces.map((p) => p.palette).join('+')));
      return `${pieces.map((piece) => piece.image).join(', ')} ×${candidate.sites.length}${combinations.size > 1 ? `, ${combinations.size} color combinations` : ''}`;
    });
    if (labels.join('\n') === [...entrySelect.options].map((option) => option.textContent).join('\n')) return;
    entries = found;
    const chosen = entrySelect.value;
    entrySelect.replaceChildren(
      make('option', '— choose pieces to bake —', { value: '' }),
      ...labels.map((label, i) => make('option', label, { value: String(i) })),
    );
    entrySelect.value = labels.length > Number(chosen) ? chosen : '';
    await choose();
  };
  let showing = Promise.resolve();
  const refresh = () => (showing = showing.then(show).catch((error) => void (status.textContent = String(error))));
  element.addEventListener('toggle', () => element.open && void refresh());
  context.subscribe(() => element.open && void refresh());
  entrySelect.addEventListener('change', () => {
    status.textContent = '';
    void choose();
  });
  name.addEventListener('input', () => (named = true));
  canvas.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step || !entry) return;
    event.preventDefault();
    const move = target < 0 ? anchorMove : moved[target]!;
    move.x += step[0]!;
    move.y += step[1]!;
    showPieces();
    draw();
  });

  bake.addEventListener('click', async () => {
    const id = course();
    if (!entry || !composed || !id) return;
    try {
      const product = name.value.trim();
      const paths = context.paths();
      if (!/^product-[a-z0-9][a-z0-9_-]*$/i.test(product)) throw new RangeError('The name starts with product-');
      if (
        paths.includes(`${SPRITE_SOURCES_DIRECTORY}/${product}.json`) ||
        paths.some((p) => p.endsWith(`/${product}.json`))
      )
        throw new RangeError(`${product} is taken`);
      const site = entry.sites[0]!;
      const chosen = site.pieces.flatMap((piece, i) => (included[i] ? [{ piece, i }] : []));
      const first = chosen[0]!.piece;
      const anchorX = composed.anchorX + anchorMove.x,
        anchorY = composed.anchorY + anchorMove.y;
      const across = composed.across + anchorMove.x / SPRITE_SOURCE_TEXELS_PER_METER,
        up = composed.up - anchorMove.y / SPRITE_SOURCE_TEXELS_PER_METER;
      // Each piece: its original, that original's body digest, and the map from the PNG's pixels to its body.
      const basedOn: SpriteRecipePiece[] = [];
      for (const [n, { piece, i }] of chosen.entries()) {
        const { asset, recipe } = pictures[i]!;
        const origin = composed.origins[n]!;
        const placement = {
          image: piece.image,
          palette: piece.palette,
          across: fine(piece.offset - first.offset - across),
          up: fine(piece.groundOffset - up),
          moved: { ...moved[i]! },
        };
        if (!recipe) {
          // A piece without a recipe is an original (a product picture's reflection is not one).
          if (!inOriginalsPlace(imagePathIn(paths, piece.image)))
            throw new RangeError(`${piece.image} is neither an original nor a product picture's source`);
          basedOn.push({
            image: piece.image,
            bodySha256: await contentDigest(spriteBodyPng(asset)),
            transform: { scale: 1, x: -origin.x, y: -origin.y },
            placement,
          });
          continue;
        }
        const one = recipeOriginal(recipe);
        if (!one) throw new RangeError(`${piece.image} is based on no one original`);
        const texel = recipe.crop.width / spriteMasterWidth(recipe.widthMeters);
        const { scale, x, y } = one.transform;
        basedOn.push({
          image: one.image,
          bodySha256: one.bodySha256,
          transform: {
            scale: scale * texel,
            x: scale * (recipe.crop.x - origin.x * texel) + x,
            y: scale * (recipe.crop.y - origin.y * texel) + y,
          },
          placement,
        });
      }
      // A board shadow when a piece standing on the ground has a shadow.
      const shadow = chosen.some(({ piece, i }) => piece.groundOffset === 0 && pictures[i]!.asset.levels[0]!.shadow);
      const png = encodeSpritePng(composed.image, PNG);
      const key = `${product} ${await contentDigest(png)}`;
      const recipe: SpriteRecipe = {
        format: SPRITE_RECIPE_FORMAT,
        version: SPRITE_RECIPE_VERSION,
        crop: { x: 0, y: 0, width: composed.image.width, height: composed.image.height },
        widthMeters: composed.image.width / SPRITE_SOURCE_TEXELS_PER_METER,
        anchor: { x: anchorX, y: anchorY },
        mask: [],
        palettes: null,
        ...(shadow ? { shadow: 'board' as const } : {}),
        basedOn,
      };
      // The colors chosen once, and a palette for each site's combination of the pieces' palettes.
      const { master } = await importInWorker(key, composed.image, recipe, product);
      const level = master.levels[0]!;
      const palettes = alternatePiecePalettes(
        { width: master.width, height: master.height, indices: level.indices, palette: level.paletteRgb555 },
        composed.provenance,
        chosen.map(({ i }) => ({
          palettes: Object.fromEntries(
            Object.entries(pictures[i]!.asset.palettes).map(([palette, { colors }]) => [palette, colors]),
          ),
        })),
        siteCombination(site, included),
        entry.sites.map((other) => siteCombination(other, included)),
      );
      const finished = readSpriteRecipe(JSON.parse(JSON.stringify({ ...recipe, palettes })));
      const made = await importInWorker(key, composed.image, finished, product);
      const coursePath = coursePathIn(paths, id);
      const document = await context.readFile(coursePath);
      const edited = bakeCoursePieces(
        JSON.parse(new TextDecoder().decode(document.bytes)) as Json,
        entry,
        included,
        product,
        across,
        up,
      );
      if (!edited.ok) throw new RangeError(edited.reason);
      const base = `${SPRITE_SOURCES_DIRECTORY}/${product}`;
      context.setFiles(
        [
          [`${base}.png`, png, context.revision(`${base}.png`)],
          [`${base}.json`, new TextEncoder().encode(formatSavedJson(finished)), context.revision(`${base}.json`)],
          ...importedImageFiles(finished, made.master).map(
            (file) => [file.path, file.bytes, context.revision(file.path)] as const,
          ),
          [
            coursePath,
            new TextEncoder().encode(formatSavedJson(savedCourseDocument(edited.document))),
            document.revision,
          ],
        ],
        `Bake ${product}`,
      );
      status.textContent = `Baked ${product}: ${chosen.length} pieces at ${entry.sites.length} site${entry.sites.length === 1 ? '' : 's'} are one placement each; palettes ${Object.keys(palettes).join(', ')}.`;
      baked(product);
    } catch (error) {
      status.textContent = `Not baked: ${error instanceof Error ? error.message : error}`;
    }
  });

  return { element };
}

function fine(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
