import { formatSavedJson } from '../../src/content/saved-json.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodAsset } from '../../src/image/sprite.js';
import { coursePathIn, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import { bakeRefusal, sameBakeEntry, siteCombination, type BakeEntry } from '../authoring/course-bake.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { bakedPieceTransform, composePieces, type BakePiece, type ComposedPieces } from '../graphics/sprite-bake.js';
import {
  readSpriteRecipe,
  recipeOriginal,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
  type SpriteRecipePiece,
} from '../graphics/sprite-import.js';
import { spriteRaster } from '../graphics/sprite-layers.js';
import type { SpriteImporter } from './sprite-importer.js';
import type { CourseReadings } from './sprite-course-readings.js';
import type { PictureLooks } from './sprite-picture-looks.js';
import { pictureMaster } from './sprite-pictures.js';

/** Screen pixels per texel in the composition's preview. */
const ZOOM = 2;

/**
 * A piece's picture as the composition reads it: its master and its body's digest, read off the page's thread
 * (`pictureMaster`), and, for a product picture (or its reflection, `mirrored`), the recipe of its source.
 */
interface PiecePicture {
  readonly asset: SpriteLodAsset;
  readonly bodySha256: string;
  readonly recipe: SpriteRecipe | null;
  readonly mirrored: boolean;
}

const MIRRORED = '-mirrored';
/** The reflection's name of an original picture, or the unreflected one's of a reflection. */
const reflection = (name: string) => (name.endsWith(MIRRORED) ? name.slice(0, -MIRRORED.length) : `${name}${MIRRORED}`);

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
  looks: PictureLooks,
  courses: CourseReadings,
  course: () => string | null,
  baked: (name: string) => void,
) {
  const entrySelect = make('select');
  const pieceList = make('div', '', { class: 'bake-pieces' });
  const name = make('input', '', { size: '36' });
  const bake = make('button', 'Bake', { type: 'button' });
  bake.disabled = true;
  const align = make('button', 'Align pieces', { type: 'button' });
  const reset = make('button', 'Reset moves', { type: 'button' });
  // What Align pieces last found: each piece's move and each seam's difference before and after.
  const aligned = make('p', '', { class: 'hint' });
  const canvas = make('canvas', '', { class: 'bake-preview', tabindex: '0' });
  const status = make('p', '', { role: 'status', class: 'hint' });
  // Why Bake is disabled for the pieces as chosen.
  const hint = make('span', '', { class: 'hint' });
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
    ' ',
    hint,
    make('p', 'Arrow keys on the picture move the chosen piece, or the base point.', { class: 'hint' }),
    align,
    ' ',
    reset,
    aligned,
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
    // The pieces' pictures' names and revisions they were read at.
    picturesKey = '',
    composed: ComposedPieces | null = null,
    // Each showing of an entry (K's choice, or a reading again after a change) is numbered; one read after a later
    // showing is dropped, and Bake waits for the latest. K's own choices are counted apart.
    choices = 0,
    picks = 0,
    reading = false;

  const readPicture = async (image: string): Promise<PiecePicture> => {
    const paths = context.paths();
    const read = await pictureMaster(context, looks, image).catch((error: unknown) => {
      throw new RangeError(`${image} could not be read (${error instanceof Error ? error.message : error})`);
    });
    // A product picture's reflection comes from its source's recipe (with `mirror`).
    const source = [image, ...(image.endsWith(MIRRORED) ? [image.slice(0, -MIRRORED.length)] : [])].find((name) =>
      paths.includes(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`),
    );
    const recipe = source
      ? readSpriteRecipe(
          JSON.parse(new TextDecoder().decode(await context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${source}.json`))),
        )
      : null;
    return { ...read, recipe, mirrored: !!source && source !== image };
  };

  /** The included pieces of the first site, measured from the first included piece's lateral, with their indices. */
  const chosenPieces = (): { readonly pieces: BakePiece[]; readonly indices: number[] } | null => {
    if (!entry) return null;
    const site = entry.sites[0]!;
    const first = site.pieces.find((_, i) => included[i]);
    if (!first) return null;
    const chosen = site.pieces.flatMap((piece, i) => (included[i] ? [{ piece, i }] : []));
    return {
      pieces: chosen.map(({ piece, i }) => {
        const { asset } = pictures[i]!;
        return {
          frame: spriteRaster(asset.levels[0]!),
          colors: asset.palettes[piece.palette]!.colors,
          across: piece.offset - first.offset,
          up: piece.groundOffset,
          moved: moved[i]!,
        };
      }),
      indices: chosen.map(({ i }) => i),
    };
  };
  const compose = () => {
    const chosen = chosenPieces();
    return chosen && composePieces(chosen.pieces, anchorMove);
  };

  /**
   * Why the composition as chosen cannot be baked, or null: fewer than two pieces kept (one piece is a picture of its
   * own), or the base point moved off the picture.
   */
  const refusal = () => {
    if (!entry) return 'Choose pieces to bake.';
    if (included.filter(Boolean).length < 2) return 'Keep two pieces or more: one piece alone is a picture already.';
    if (!composed) return null;
    const { anchorX, anchorY, image } = composed;
    const off = (at: number, size: number) => (at < -0.5 ? -0.5 - at : at > size - 0.5 ? at - size + 0.5 : 0);
    const [x, y] = [off(anchorX, image.width), off(anchorY, image.height)];
    return x || y
      ? `The base point is ${[x && `${x} texels ${anchorX < 0 ? 'left' : 'right'}`, y && `${y} texels ${anchorY < 0 ? 'above' : 'below'}`].filter(Boolean).join(' and ')} of the picture: move it back onto it to bake.`
      : null;
  };

  const draw = () => {
    composed = reading ? null : compose();
    const reason = reading ? 'Reading the pieces…' : refusal();
    bake.disabled = reason !== null;
    align.disabled = reset.disabled = reading || included.filter(Boolean).length < 2;
    hint.textContent = entry || reading ? (reason ?? '') : '';
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
    const ax = (composed.anchorX + 0.5) * ZOOM,
      ay = (composed.anchorY + 0.5) * ZOOM;
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
    name.value = `product-${pieceOriginal(pieces.indexOf(leftmost)) ?? leftmost.image}-baked`;
  };

  /** The original a piece stands for: its own name, its product picture's original, or that original's reflection. */
  const pieceOriginal = (i: number) => {
    const { recipe, mirrored } = pictures[i]!;
    const one = recipe && recipeOriginal(recipe);
    return one ? (mirrored ? reflection(one.image) : one.image) : null;
  };

  /**
   * Show the entry chosen in the list. K's choices for it (the pieces kept, their moves, the base point's, the name)
   * start afresh only when K chooses another entry (`fresh`); a reading again of the same arrangement keeps them, and
   * only its pictures are read again. Until the chosen entry's pictures are read, Bake waits and nothing of the entry
   * before is shown or baked; a choice overtaken by a later one is dropped.
   */
  const choose = async (fresh: boolean) => {
    const choice = ++choices;
    // "Choose pieces to bake" is no entry: nothing is read, and nothing can be baked.
    const next = entrySelect.value === '' ? null : (entries[Number(entrySelect.value)] ?? null);
    const pieces = next?.sites[0]!.pieces ?? [];
    // The pieces' pictures are read again only when one of their files has changed.
    const paths = context.paths();
    const key = pieces
      .flatMap((piece) => [piece.image, ...[imagePathIn(paths, piece.image)].map((path) => context.revision(path))])
      .join(' ');
    let read = pictures;
    if (next && (fresh || key !== picturesKey)) {
      reading = true;
      if (fresh) entry = null;
      showPieces();
      draw();
      try {
        read = await Promise.all(pieces.map((piece) => readPicture(piece.image))).finally(() => {
          if (choice === choices) reading = false;
        });
      } catch (error) {
        // Nothing of the entry is shown or baked; choosing it again reads its pictures again.
        if (choice !== choices) return;
        entry = null;
        pictures = [];
        picturesKey = '';
        entrySelect.value = '';
        showPieces();
        draw();
        status.textContent = `Not read: ${error instanceof Error ? error.message : error}. Choose the entry again to read it again.`;
        return;
      }
      if (choice !== choices) return;
    }
    entry = next;
    pictures = next ? read : [];
    picturesKey = next ? key : '';
    if (next && fresh) {
      aligned.textContent = '';
      named = false;
      included = pieces.map(() => true);
      moved = pieces.map(() => ({ x: 0, y: 0 }));
      anchorMove = { x: 0, y: 0 };
      target = -1;
      defaultName();
    }
    showPieces();
    draw();
  };

  const show = async () => {
    const id = course();
    if (!id) return;
    // The entries of the course's reading for its revision, which the list shares.
    const found = (await courses.read(id)).entries;
    const labels = found.map((candidate) => {
      const pieces = candidate.sites[0]!.pieces;
      const combinations = new Set(candidate.sites.map((site) => site.pieces.map((p) => p.palette).join('+')));
      return `${pieces.map((piece) => piece.image).join(', ')} ×${candidate.sites.length}${combinations.size > 1 ? `, ${combinations.size} color combinations` : ''}`;
    });
    // The chosen entry is found again by its arrangement; once it is gone, K's choices for it go too.
    const kept = entry ? found.findIndex((candidate) => sameBakeEntry(candidate, entry!)) : -1;
    entries = found;
    entrySelect.replaceChildren(
      make('option', '— choose pieces to bake —', { value: '' }),
      ...labels.map((label, i) => make('option', label, { value: String(i) })),
    );
    entrySelect.value = kept < 0 ? '' : String(kept);
    await choose(kept < 0);
  };
  let showing = Promise.resolve();
  // The entries are found again only when the chosen course or a chosen piece's picture has changed (or the section is
  // opened): a compile or another file's change reads nothing again.
  const inputs = () => {
    const id = course(),
      paths = context.paths();
    if (!id) return '';
    const pieces = entry?.sites[0]!.pieces ?? [];
    return [coursePathIn(paths, id), ...pieces.map((piece) => imagePathIn(paths, piece.image))]
      .map((path) => `${path}@${context.revision(path)}`)
      .join(' ');
  };
  let shownInputs: string | null = null;
  const refresh = (force = false) => {
    const now = inputs();
    if (!force && now === shownInputs) return;
    shownInputs = now;
    showing = showing.then(show).catch((error) => void (status.textContent = String(error)));
  };
  element.addEventListener('toggle', () => element.open && refresh(true));
  context.subscribe(() => element.open && refresh());
  entrySelect.addEventListener('change', () => {
    picks++;
    status.textContent = '';
    // What is shown now names the chosen entry's pieces: a later notification reads again only when they change.
    void choose(true).then(() => (shownInputs = inputs()));
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

  // Align pieces: the included pieces' moves from the worker (`alignBakePieces`), unless K chose another entry or the
  // pieces were read again meanwhile; the base point and the pieces left out keep theirs.
  align.addEventListener('click', async () => {
    const chosen = chosenPieces();
    if (!chosen || reading) return;
    const choice = choices;
    const names = chosen.indices.map((i) => entry!.sites[0]!.pieces[i]!.image);
    align.disabled = true;
    aligned.textContent = 'Aligning…';
    try {
      const { moves, seams } = await importInWorker.align(chosen.pieces);
      if (choice !== choices) return;
      chosen.indices.forEach((i, n) => (moved[i] = { ...moves[n]! }));
      const difference = (value: number | null) => (value === null ? '—' : value.toFixed(3));
      aligned.textContent =
        `Aligned: ${chosen.indices.map((_, n) => `${names[n]} ${moves[n]!.x}, ${moves[n]!.y}`).join('; ')}. ` +
        `Seams (mean linear-light difference, before → after): ${
          seams
            .map(
              ({ pieces, before, after }) =>
                `${names[pieces[0]]}–${names[pieces[1]]} ${difference(before)} → ${difference(after)}`,
            )
            .join('; ') || 'none'
        }.`;
    } catch (error) {
      if (choice === choices) aligned.textContent = `Not aligned: ${error instanceof Error ? error.message : error}`;
    } finally {
      if (choice === choices) {
        showPieces();
        draw();
      }
    }
  });
  reset.addEventListener('click', () => {
    if (!entry) return;
    moved = moved.map(() => ({ x: 0, y: 0 }));
    aligned.textContent = '';
    showPieces();
    draw();
  });

  bake.addEventListener('click', async () => {
    const id = course();
    if (!entry || !composed || !id || reading || refusal()) return;
    // What is baked is taken at once: the entry, its pictures, the pieces kept and moved, the composition and the name.
    const choice = choices,
      pick = picks;
    const taken = {
      entry,
      pictures,
      included: [...included],
      moved: moved.map((move) => ({ ...move })),
      composed,
    };
    try {
      const product = name.value.trim();
      const paths = context.paths();
      if (!/^product-[a-z0-9][a-z0-9_-]*$/i.test(product)) throw new RangeError('The name starts with product-');
      if (
        paths.includes(`${SPRITE_SOURCES_DIRECTORY}/${product}.json`) ||
        paths.some((p) => p.endsWith(`/${product}.json`))
      )
        throw new RangeError(`${product} is taken`);
      // The entry as the course stands now: K's arrangement found again, so its places are the document's own.
      // The course's reading for its revision now (made off the page's thread, as the list's) finds it.
      const coursePath = coursePathIn(paths, id);
      const reading = await courses.read(id);
      const now = reading.entries.find((candidate) => sameBakeEntry(candidate, taken.entry));
      if (
        !now ||
        siteCombination(now.sites[0]!, taken.included).join() !==
          siteCombination(taken.entry.sites[0]!, taken.included).join()
      )
        throw new RangeError('The pieces changed in the course since they were drawn here; look again and bake');
      const refusal = bakeRefusal(now, taken.included);
      if (refusal) throw new RangeError(refusal);
      const site = now.sites[0]!;
      const chosen = site.pieces.flatMap((piece, i) => (taken.included[i] ? [{ piece, i }] : []));
      const first = chosen[0]!.piece;
      const { anchorX, anchorY, across, up } = taken.composed;
      // Each piece: its original, that original's body digest, and the map from the PNG's pixels to its body.
      const basedOn: SpriteRecipePiece[] = [];
      for (const [n, { piece, i }] of chosen.entries()) {
        const { bodySha256, recipe, mirrored } = taken.pictures[i]!;
        const origin = taken.composed.origins[n]!;
        const placement = {
          image: piece.image,
          palette: piece.palette,
          across: fine(piece.offset - first.offset - across),
          up: fine(piece.groundOffset - up),
          moved: { ...taken.moved[i]! },
        };
        if (!recipe) {
          // A piece without a recipe is an original.
          if (!inOriginalsPlace(imagePathIn(paths, piece.image)))
            throw new RangeError(`${piece.image} is neither an original nor a product picture`);
          basedOn.push({
            image: piece.image,
            bodySha256,
            transform: bakedPieceTransform(origin, null),
            placement,
          });
          continue;
        }
        const one = recipeOriginal(recipe);
        if (!one) throw new RangeError(`${piece.image} is based on no one original`);
        // A product picture's reflection stands for its original's reflection, an original of its own.
        const original = mirrored ? reflection(one.image) : one.image;
        const body = mirrored ? await pictureMaster(context, looks, original) : null;
        if (mirrored && !inOriginalsPlace(imagePathIn(paths, original)))
          throw new RangeError(`${piece.image} reflects ${one.image}, whose reflection is no original picture`);
        basedOn.push({
          image: original,
          bodySha256: body ? body.bodySha256 : one.bodySha256,
          transform: bakedPieceTransform(origin, {
            recipe,
            mirrored,
            bodyWidth: body ? body.asset.levels[0]!.width : 0,
          }),
          placement,
        });
      }
      // A board shadow when a piece standing on the ground has a shadow.
      const shadow = chosen.some(
        ({ piece, i }) => piece.groundOffset === 0 && taken.pictures[i]!.asset.levels[0]!.shadow,
      );
      // The PNG, its colors and palettes and its course images are made off the page's thread (`bakePicture`).
      const recipe: SpriteRecipe = {
        format: SPRITE_RECIPE_FORMAT,
        version: SPRITE_RECIPE_VERSION,
        crop: { x: 0, y: 0, width: taken.composed.image.width, height: taken.composed.image.height },
        widthMeters: taken.composed.image.width / SPRITE_SOURCE_TEXELS_PER_METER,
        anchor: { x: anchorX, y: anchorY },
        mask: [],
        palettes: null,
        ...(shadow ? { shadow: 'board' as const } : {}),
        basedOn,
      };
      const {
        png,
        recipe: finished,
        palettes,
        files,
      } = await importInWorker.bake({
        image: taken.composed.image,
        recipe,
        name: product,
        provenance: taken.composed.provenance,
        pieces: chosen.map(({ i }) => ({
          palettes: Object.fromEntries(
            Object.entries(taken.pictures[i]!.asset.palettes).map(([palette, { colors }]) => [palette, colors]),
          ),
        })),
        base: siteCombination(site, taken.included),
        combinations: now.sites.map((other) => siteCombination(other, taken.included)),
      });
      const made = { files };
      // The course's edit, off the page's thread, from the bytes of the revision the entry was found in.
      const document = await context.readFile(coursePath);
      if (document.revision !== reading.revision)
        throw new RangeError('The course changed while baking; look again and bake');
      const edited = await courses.edit(id, document.bytes, [
        { kind: 'bake', entry: now, included: taken.included, image: product, across, up },
      ]);
      // K's choosing another entry, or the entry read again after its course or a piece's picture changed.
      if (pick !== picks) throw new RangeError('Another entry was chosen while baking; bake again');
      if (choice !== choices)
        throw new RangeError(
          context.revision(coursePath) !== document.revision
            ? 'The course changed while baking; look again and bake'
            : "A piece's picture changed while baking; look again and bake",
        );
      const base = `${SPRITE_SOURCES_DIRECTORY}/${product}`;
      const written = await context.setFiles(
        [
          [`${base}.png`, png, context.revision(`${base}.png`)],
          [`${base}.json`, new TextEncoder().encode(formatSavedJson(finished)), context.revision(`${base}.json`)],
          ...made.files.map((file) => [file.path, file.bytes, context.revision(file.path)] as const),
          [coursePath, edited.bytes, document.revision],
        ],
        `Bake ${product}`,
      );
      if (written === null) {
        status.textContent = 'Not baked: nothing was written.';
        return;
      }
      status.textContent = `Baked ${product}: ${chosen.length} pieces at ${now.sites.length} site${now.sites.length === 1 ? '' : 's'} are one placement each; palettes ${Object.keys(palettes).join(', ')}.`;
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
