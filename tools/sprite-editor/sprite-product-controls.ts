import { PNG } from 'pngjs';
import { contentDigest } from '../../src/core/content-digest.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { readSpriteLodAsset, SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodAsset } from '../../src/image/sprite.js';
import { coursePathIn, imageNameOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import { unbakeCoursePieces } from '../authoring/course-bake.js';
import {
  renameCoursePictures,
  savedCourseDocument,
  setCoursePictureWidths,
  type CourseEditResult,
} from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { confirmField, finiteNumber } from '../browser-shared/pending-edit.js';
import { SPRITE_DITHERS } from '../graphics/sprite-colors.js';
import {
  importedImageFiles,
  readSpriteRecipe,
  recipeOriginal,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import { originalProductSource } from '../graphics/sprite-product.js';
import { spriteMasterWidth, type SourceImage } from '../graphics/sprite-source-compiler.js';
import { sourceLowResolution } from '../graphics/sprite-source-size.js';
import type { OpenSource } from './sprite-comparison.js';
import type { SpriteImporter } from './sprite-importer.js';
import type { UsedPicture } from './sprite-pictures.js';

/** The picture the controls edit: a chosen entry of the product course's list and, for a product, its open source. */
export interface ControlTarget {
  readonly picture: UsedPicture;
  readonly course: string;
  readonly source: OpenSource | null;
}

/**
 * The recipe an edit begins from: a product's open source, or for an original the product picture its first edit
 * makes (`first`: the course's placements are renamed to it). `png`, when there is one, is written too.
 */
export interface Reading {
  readonly target: ControlTarget;
  readonly name: string;
  readonly recipe: SpriteRecipe;
  readonly revision: number;
  readonly image: SourceImage;
  readonly key: string;
  readonly png: Uint8Array<ArrayBuffer> | null;
  readonly first: boolean;
}

/** A recipe's base point and extent in its master's texels. */
function masterFrame(recipe: SpriteRecipe) {
  const width = spriteMasterWidth(recipe.widthMeters);
  const texel = recipe.crop.width / width;
  const height = Math.ceil(recipe.crop.height / texel);
  return {
    texel,
    anchorX: (recipe.anchor.x + 0.5 - recipe.crop.x) / texel - 0.5,
    anchorY: recipe.anchor.y === undefined ? height - 0.5 : (recipe.anchor.y + 0.5 - recipe.crop.y) / texel - 0.5,
  };
}

/** The recipe with its base point at master texel `(x, y)`. */
function withAnchor(recipe: SpriteRecipe, x: number, y: number): SpriteRecipe {
  const { texel } = masterFrame(recipe);
  const fine = (value: number) => Math.round(value * 1e9) / 1e9;
  return {
    ...recipe,
    anchor: { x: fine(recipe.crop.x + (x + 0.5) * texel - 0.5), y: fine(recipe.crop.y + (y + 0.5) * texel - 0.5) },
  };
}

/**
 * The controls of an original or product picture: its height above the ground (m, with texels), its base point across
 * and its ground row (master texels; by number, by a click on a picture, or by the arrow keys one texel at a time), its
 * shadow and its dither; the collision width of its placements with a body (by number, by dragging a line, by the
 * arrow keys, or back to its original's ratio in the original course); the palette shown (said to `palette`); and
 * Revert picture. Each change is one edit writing the recipe and the course images its import makes, or the course's
 * widths. The first change of an original picture first makes its product picture in the same edit: the original's
 * body PNG and recipe (`originalProductSource`), its images, and the course's placements renamed to it. `choose`
 * hears the picture the list should open after making or reverting one.
 */
export function createProductControls(
  context: EditorContext,
  importInWorker: SpriteImporter,
  choose: (name: string) => void,
  palette: (name: string | null) => void,
) {
  const fields = {
    height: make('input', '', { type: 'number', step: 'any', size: '6' }),
    across: make('input', '', { type: 'number', step: '1', size: '6' }),
    ground: make('input', '', { type: 'number', step: '1', size: '6' }),
    width: make('input', '', { type: 'number', step: '0.025', size: '6' }),
  };
  const widthNote = make('span', '', { class: 'hint' });
  const ratio = make('button', "Original's ratio", { type: 'button' });
  const arrows = make('select');
  arrows.append(
    make('option', 'base point', { value: 'point' }),
    make('option', 'collision lines', { value: 'lines' }),
  );
  const shownPalette = make('select');
  const revert = make('button', 'Revert picture', { type: 'button' });
  const texels = make('span', '', { class: 'hint' });
  const shadow = make('input', '', { type: 'checkbox' });
  const dither = make('select');
  dither.append(...['none', ...SPRITE_DITHERS.filter((d) => d !== 'none')].map((d) => make('option', d, { value: d })));
  const note = make('p', '', { role: 'status', class: 'hint' });
  const originalHint = make('p', 'An original picture: its first change makes its product picture.', { class: 'hint' });
  const element = make('div', '', { class: 'product-controls' });
  const labelled = (text: string, control: HTMLElement, after: (HTMLElement | string)[] = []) => {
    const label = make('label', `${text} `);
    label.append(control, ...after);
    return label;
  };
  element.append(
    originalHint,
    labelled('Height above the ground (m)', fields.height, [' ', texels]),
    ' ',
    labelled('Base point across', fields.across),
    ' ',
    labelled('ground row', fields.ground),
    ' ',
    labelled('Shadow', shadow),
    ' ',
    labelled('Dither', dither),
    make('br'),
    labelled('Collision width (m)', fields.width, [' ', ratio, ' ', widthNote]),
    ' ',
    labelled('Arrow keys move the', arrows),
    ' ',
    labelled('Palette shown', shownPalette),
    ' ',
    revert,
    note,
  );
  element.hidden = true;

  let reading: Reading | null = null,
    // The latest showing asked for; an earlier one finishing later is dropped.
    shown = 0;
  // The reading each field was drawn from, which its edit is made from.
  const drawnFrom = new Map<HTMLElement, Reading | null>();
  // An original's product source, made once per original image revision.
  const firsts = new Map<string, Promise<{ png: Uint8Array<ArrayBuffer>; recipe: SpriteRecipe; image: SourceImage }>>();

  const read = async (target: ControlTarget): Promise<Reading | null> => {
    const { picture } = target;
    if (picture.kind === 'product' && target.source) return { target, ...target.source, png: null, first: false };
    if (picture.kind !== 'original' || !picture.asset) return null;
    const path = imagePathIn(context.paths(), picture.name);
    const key = `${path} ${context.revision(path)} ${picture.mirrored}`;
    if (!firsts.has(key))
      firsts.set(
        key,
        originalProductSource(picture.asset, picture.name, picture.mirrored).then(async (first) => ({
          ...first,
          image: await decodeSpritePng(first.png, PNG),
        })),
      );
    const first = await firsts.get(key)!;
    const name = `product-${picture.name}`;
    return {
      target,
      name,
      recipe: first.recipe,
      revision: context.revision(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`),
      image: first.image,
      key: `${name} ${await contentDigest(first.png)}`,
      png: first.png,
      first: true,
    };
  };

  /**
   * One edit of `from`: its recipe changed by `change` with the images its import makes, and the course changed by
   * `course` at the picture's placements; an original's product picture made with it.
   */
  const edit = async (
    from: Reading,
    change: ((recipe: SpriteRecipe) => SpriteRecipe) | null,
    label: string,
    course: ((document: Json, images: readonly string[]) => CourseEditResult) | null = null,
  ) => {
    try {
      const paths = context.paths();
      const files: (readonly [string, Uint8Array<ArrayBuffer> | null, number])[] = [];
      const base = `${SPRITE_SOURCES_DIRECTORY}/${from.name}`;
      let lowResolution = false;
      if (from.png) files.push([`${base}.png`, from.png, context.revision(`${base}.png`)]);
      if (change || from.png) {
        const recipe = readSpriteRecipe(JSON.parse(JSON.stringify(change ? change(from.recipe) : from.recipe)));
        // A redrawn picture enlarged beyond its saved PNG asks for the PNG again.
        lowResolution = sourceLowResolution(recipe) && from.target.picture.marks.includes('REDRAWN');
        const { master } = await importInWorker(from.key, from.image, recipe, from.name);
        const images = importedImageFiles(recipe, master);
        const taken = images.map((image) => imagePathIn(paths, imageNameOfPath(image.path)!)).find(inOriginalsPlace);
        if (taken) throw new RangeError(`content/${taken} is an original picture, which no page writes`);
        files.push(
          [`${base}.json`, new TextEncoder().encode(formatSavedJson(recipe)), from.revision],
          ...images.map((image) => [image.path, image.bytes, context.revision(image.path)] as const),
        );
      }
      const { picture, course: courseId } = from.target;
      // The names the course's placements show the picture by, once the edit is made.
      const names = [from.first ? from.name : picture.name];
      if (picture.mirrored) names.push(`${names[0]}-mirrored`);
      let made = '';
      if (from.first || course) {
        const coursePath = coursePathIn(paths, courseId);
        const document = await context.readFile(coursePath);
        let value = JSON.parse(new TextDecoder().decode(document.bytes)) as Json;
        if (from.first) {
          // The first edit of an original: every placement of the course renamed to the product picture.
          const renames = new Map([[picture.name, from.name]]);
          if (picture.mirrored) renames.set(`${picture.name}-mirrored`, `${from.name}-mirrored`);
          const renamed = renameCoursePictures(value, renames);
          if (!renamed.ok) throw new RangeError(`${courseId}: ${renamed.reason}`);
          value = renamed.document;
          made = `Made ${from.name}; ${renamed.changes.length} names in ${courseId} now name it.`;
        }
        if (course) {
          const changed = course(value, names);
          if (!changed.ok) throw new RangeError(`${courseId}: ${changed.reason}`);
          value = changed.document;
        }
        files.push([
          coursePath,
          new TextEncoder().encode(formatSavedJson(savedCourseDocument(value))),
          document.revision,
        ]);
      }
      context.setFiles(files, from.first ? `Make ${from.name}: ${label}` : `${label} (${from.name})`);
      note.textContent = `${made}${
        lowResolution
          ? ' The saved PNG holds fewer than two pixels across each texel now: import the PNG again (Import PNG…).'
          : ''
      }`.trim();
      if (from.first) choose(from.name);
    } catch (error) {
      note.textContent = `${from.name}: ${error instanceof Error ? error.message : error}`;
    }
  };

  /** Set the collision width of the picture's placements with a body, from `from`. */
  const setWidth = (from: Reading, width: number, label = 'Set collision width') =>
    edit(from, null, label, (document, images) => setCoursePictureWidths(document, images, width));

  /** The original course's collision widths of the picture's original over its width (m); null without them. */
  const originalRatio = async (picture: UsedPicture, course: string) => {
    const original = picture.original;
    const paths = context.paths();
    const originalCourse = coursePathIn(paths, course.replace(/-product$/, ''));
    if (!original || !inOriginalsPlace(originalCourse) || !paths.includes(originalCourse)) return null;
    const document = JSON.parse(new TextDecoder().decode(await context.store.read(originalCourse))) as Json;
    const names = new Set([original, `${original}-mirrored`, original.replace(/-mirrored$/, '')]);
    const counts = new Map<number, number>();
    const visit = (value: Json | undefined): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (typeof value === 'object' && value !== null) {
        const body = value.body as { width?: Json } | null | undefined;
        if (value.kind === 'sprite' && names.has(value.image as string) && typeof body?.width === 'number')
          counts.set(body.width, (counts.get(body.width) ?? 0) + 1);
        Object.values(value).forEach(visit);
      }
    };
    visit(document);
    if (!counts.size) return null;
    const asset: SpriteLodAsset =
      picture.kind === 'original' && picture.asset
        ? picture.asset
        : readSpriteLodAsset(
            JSON.parse(new TextDecoder().decode(await context.store.read(imagePathIn(paths, original)))),
          );
    // The most common width, the smaller on a tie.
    const [width] = [...counts].sort(([a, m], [b, n]) => n - m || a - b)[0]!;
    return { ratio: width / asset.worldWidthMeters, widths: [...counts.keys()].sort((a, b) => a - b) };
  };

  const field = (
    input: HTMLInputElement,
    apply: (recipe: SpriteRecipe, value: number) => SpriteRecipe,
    label: string,
  ) =>
    confirmField(
      input,
      finiteNumber,
      (value, from) => from && void edit(from, (recipe) => apply(recipe, value), label),
      () => drawnFrom.get(input) ?? null,
      () => void draw(),
    );
  field(
    fields.height,
    (recipe, height) => {
      const { anchorY } = masterFrame(recipe);
      if (!(height > 0)) throw new RangeError('A height above the ground is more than 0');
      return {
        ...recipe,
        widthMeters: (recipe.widthMeters * height * SPRITE_SOURCE_TEXELS_PER_METER) / (anchorY + 0.5),
      };
    },
    'Set height',
  );
  field(fields.across, (recipe, x) => withAnchor(recipe, x, masterFrame(recipe).anchorY), 'Set base point');
  field(fields.ground, (recipe, y) => withAnchor(recipe, masterFrame(recipe).anchorX, y), 'Set ground row');
  confirmField(
    fields.width,
    finiteNumber,
    (width, from) => from && void setWidth(from, width),
    () => drawnFrom.get(fields.width) ?? null,
    () => void draw(),
  );
  ratio.addEventListener('click', async () => {
    const from = reading;
    if (!from) return;
    const found = await originalRatio(from.target.picture, from.target.course).catch(() => null);
    if (!found) {
      note.textContent = 'The original course has no collision width for this picture.';
      return;
    }
    const width = Math.round(found.ratio * from.recipe.widthMeters * 1e4) / 1e4;
    await setWidth(from, width, "Collision width at the original's ratio");
    if (found.widths.length > 1)
      note.textContent = `The original course has several widths (${found.widths.join(', ')} m); the most common gave ${width} m.`;
  });
  shownPalette.addEventListener('change', () => palette(shownPalette.value || null));
  revert.addEventListener('click', () =>
    revertPicture().catch((error: Error) => (note.textContent = `Not reverted: ${error.message}`)),
  );
  shadow.addEventListener('change', () => {
    const from = drawnFrom.get(shadow);
    if (!from) return;
    const { shadow: _, ...rest } = from.recipe;
    void edit(from, () => (shadow.checked ? { ...rest, shadow: 'board' } : rest), 'Set shadow');
  });
  dither.addEventListener('change', () => {
    const from = drawnFrom.get(dither);
    if (!from) return;
    const { dither: _, ...rest } = from.recipe;
    const chosen = dither.value as SpriteRecipe['dither'];
    void edit(from, () => (chosen === 'none' ? rest : { ...rest, dither: chosen }), 'Set dither');
  });

  /**
   * Return a product picture's files to the build's: its PNG, recipe and images. One this working state made is
   * removed, and the course's placements name its original again (a baked picture's: its pieces stand again where
   * each placement is, `unbakeCoursePieces`); collision widths are left as they are. A redrawing in the working state
   * goes only once K confirms.
   */
  const revertPicture = async () => {
    const from = reading;
    const pieces = from?.recipe.basedOn ?? [];
    const basis = from && recipeOriginal(from.recipe);
    const baked = pieces.length > 1;
    if (!from || from.first || (!basis && !baked)) return;
    const { picture, course } = from.target;
    const paths = context.paths();
    const source = `${SPRITE_SOURCES_DIRECTORY}/${from.name}`;
    const changes = context.changes();
    const built = (path: string) => context.published.read(path).catch(() => null);
    const files = [
      `${source}.png`,
      `${source}.json`,
      imagePathIn(paths, from.name),
      imagePathIn(paths, `${from.name}-mirrored`),
    ];
    const back: (readonly [string, Uint8Array<ArrayBuffer> | null, number])[] = [];
    for (const path of files.filter((path) => changes.has(path)))
      back.push([path, await built(path), context.revision(path)]);
    const inBuild = (await built(`${source}.json`)) !== null;
    if (
      picture.marks.includes('REDRAWN') &&
      changes.has(`${source}.png`) &&
      !confirm(`${from.name} has been redrawn in this working state; reverting it removes the redrawing. Revert?`)
    )
      return;
    let renamedNote = '';
    if (!inBuild && baked) {
      const placed = pieces.map((piece) => piece.placement);
      if (!placed.every(Boolean)) throw new RangeError(`${from.name}'s pieces keep no placements to put back`);
      const coursePath = coursePathIn(paths, course);
      const document = await context.readFile(coursePath);
      const unbaked = unbakeCoursePieces(
        JSON.parse(new TextDecoder().decode(document.bytes)) as Json,
        from.name,
        placed.map((placement) => ({ image: placement!.image, across: placement!.across, up: placement!.up })),
      );
      if (unbaked.ok) {
        back.push([
          coursePath,
          new TextEncoder().encode(formatSavedJson(savedCourseDocument(unbaked.document))),
          document.revision,
        ]);
        renamedNote = `; its ${pieces.length} pieces stand again at ${unbaked.changes.length} placements in ${course}`;
      }
    } else if (!inBuild && basis) {
      const renames = new Map([
        [from.name, basis.image],
        [`${from.name}-mirrored`, `${basis.image}-mirrored`],
      ]);
      const coursePath = coursePathIn(paths, course);
      const document = await context.readFile(coursePath);
      const renamed = renameCoursePictures(JSON.parse(new TextDecoder().decode(document.bytes)) as Json, renames);
      if (renamed.ok) {
        back.push([
          coursePath,
          new TextEncoder().encode(formatSavedJson(savedCourseDocument(renamed.document))),
          document.revision,
        ]);
        renamedNote = `; ${renamed.changes.length} names in ${course} name ${basis.image} again`;
      }
    }
    if (!back.length) {
      note.textContent = `${from.name} is as the build has it.`;
      return;
    }
    context.setFiles(back, `Revert picture ${from.name}`);
    note.textContent = `Reverted ${from.name}${renamedNote}; collision widths are left as they are.`;
    if (!inBuild) choose(basis ? basis.image : pieces[0]!.placement!.image);
  };

  const draw = () => {
    if (!reading) return;
    const { anchorX, anchorY } = masterFrame(reading.recipe);
    const values = {
      height: String(Math.round(((anchorY + 0.5) / SPRITE_SOURCE_TEXELS_PER_METER) * 1e4) / 1e4),
      across: String(Math.round(anchorX * 1e3) / 1e3),
      ground: String(Math.round(anchorY * 1e3) / 1e3),
    };
    for (const [key, value] of Object.entries(values)) {
      const input = fields[key as keyof typeof values];
      if (document.activeElement !== input) {
        input.value = value;
        drawnFrom.set(input, reading);
      }
    }
    texels.textContent = `(${Math.round((anchorY + 0.5) * 100) / 100} texels)`;
    const { widths } = reading.target.picture;
    fields.width.disabled = ratio.disabled = !widths.length;
    if (document.activeElement !== fields.width) {
      fields.width.value = widths.length === 1 ? String(widths[0]) : '';
      drawnFrom.set(fields.width, reading);
    }
    widthNote.textContent = !widths.length
      ? 'no placement has a body'
      : widths.length > 1
        ? `placements differ (${widths.join(', ')}); a width entered sets them all`
        : '';
    const names = Object.keys(reading.recipe.palettes ?? reading.target.source?.made?.master.palettes ?? {});
    if (names.join() !== [...shownPalette.options].map((option) => option.value).join()) {
      const chosen = shownPalette.value;
      shownPalette.replaceChildren(...names.map((name) => make('option', name, { value: name })));
      if (names.includes(chosen)) shownPalette.value = chosen;
    }
    revert.hidden = reading.target.picture.kind !== 'product';
    shadow.checked = reading.recipe.shadow === 'board';
    dither.value = reading.recipe.dither ?? 'none';
    drawnFrom.set(shadow, reading);
    drawnFrom.set(dither, reading);
  };

  return {
    element,
    /** Show the controls of `target`, or none. */
    async show(target: ControlTarget | null) {
      // Another picture's controls are put away at once, so nothing is typed into them while this one is read.
      if (reading && reading.target.picture.name !== target?.picture.name) {
        reading = null;
        element.hidden = true;
      }
      const showing = ++shown;
      const next = target ? await read(target).catch(() => null) : null;
      if (showing !== shown) return;
      reading = next;
      element.hidden = !next;
      originalHint.hidden = !next?.first;
      draw();
    },
    /** The reading shown, which an edit begins from. */
    reading: () => reading,
    /** Write `from` as it is (its recipe, PNG and images, the course renamed for a first edit): one edit. */
    write: (from: Reading, label: string) => edit(from, null, label),
    /** One edit of the reading shown, its recipe changed by `change`. */
    change(change: (recipe: SpriteRecipe) => SpriteRecipe, label: string) {
      if (reading) void edit(reading, change, label);
    },
    /** The palette shown, null for the default. */
    palette: () => shownPalette.value || null,
    /** Move the base point by whole texels, from the reading shown. */
    move(dx: number, dy: number) {
      const from = reading;
      if (!from || (!dx && !dy)) return;
      const { anchorX, anchorY } = masterFrame(from.recipe);
      void edit(from, (recipe) => withAnchor(recipe, anchorX + dx, anchorY + dy), 'Move base point');
    },
    /** An arrow key: the base point by a texel, or each collision line a texel out (right, up) or in (left, down). */
    arrow(dx: number, dy: number) {
      const from = reading;
      if (arrows.value === 'point') return this.move(dx, dy);
      const [width] = from?.target.picture.widths ?? [];
      if (!from || width === undefined) return;
      const next = Math.round((width + ((dx || -dy) * 2) / SPRITE_SOURCE_TEXELS_PER_METER) * 1e4) / 1e4;
      if (next > 0) void setWidth(from, next);
    },
    /** Set the collision width (m) of the picture shown, as a dragged line says. */
    resize(width: number) {
      if (reading && width > 0) void setWidth(reading, width);
    },
  };
}
