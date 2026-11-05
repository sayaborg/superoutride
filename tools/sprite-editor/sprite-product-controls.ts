import { contentDigest } from '../../src/core/content-digest.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import { coursePathIn, imageNameOfPath, imagePathIn, inOriginalsPlace } from '../authoring/content-places.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { confirmField, drawField, finiteNumber } from '../browser-shared/pending-edit.js';
import { SPRITE_DITHERS } from '../graphics/sprite-colors.js';
import {
  readSpriteRecipe,
  recipeOriginal,
  SPRITE_SOURCES_DIRECTORY,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import { masterAnchor, withMasterAnchor, type SourceImage } from '../graphics/sprite-source-compiler.js';
import { sourceLowResolution } from '../graphics/sprite-source-size.js';
import type { OpenSource } from './sprite-comparison.js';
import type { CourseEdit } from './sprite-course-edits.js';
import type { CourseReadings } from './sprite-course-readings.js';
import type { SpriteImporter } from './sprite-importer.js';
import { pictureMaster, type UsedPicture } from './sprite-pictures.js';
import type { PictureLooks } from './sprite-picture-looks.js';

/** The picture the controls edit: a chosen entry of the product course's list and, for a product, its open source. */
export interface ControlTarget {
  readonly picture: UsedPicture;
  readonly course: string;
  readonly source: OpenSource | null;
}

/**
 * The recipe an edit begins from: a product's open source, or for an original the product picture its first edit
 * makes, or the one already there (`first`: the course's placements are renamed to it). `made`, the PNG of a product
 * picture made now, is written by the first edit alone; `png`, a PNG imported now, is written with this recipe.
 */
export interface Reading {
  readonly target: ControlTarget;
  readonly name: string;
  readonly recipe: SpriteRecipe;
  readonly revision: number;
  readonly image: SourceImage;
  readonly key: string;
  readonly png: Uint8Array<ArrayBuffer> | null;
  readonly made: Uint8Array<ArrayBuffer> | null;
  readonly first: boolean;
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
  looks: PictureLooks,
  courses: CourseReadings,
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
  // The controls, and why a picture's could not be read (shown in their place).
  const controls = make('div');
  const unread = make('p', '', { role: 'status', class: 'hint' });
  const labelled = (text: string, control: HTMLElement, after: (HTMLElement | string)[] = []) => {
    const label = make('label', `${text} `);
    label.append(control, ...after);
    return label;
  };
  element.append(unread, controls);
  controls.append(
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
  // An original's product source (by its image and whether the course shows it reflected), made once for the original
  // image's latest revision alone.
  const firsts = new Map<
    string,
    {
      readonly revision: number;
      readonly made: Promise<{ png: Uint8Array<ArrayBuffer>; recipe: SpriteRecipe; image: SourceImage }>;
    }
  >();

  const read = async (target: ControlTarget): Promise<Reading | null> => {
    const { picture } = target;
    if (picture.kind === 'product' && target.source)
      return { target, ...target.source, png: null, made: null, first: false };
    if (picture.kind !== 'original') return null;
    const name = `product-${picture.name}`;
    const recipePath = `${SPRITE_SOURCES_DIRECTORY}/${name}.json`;
    if (context.paths().includes(recipePath)) {
      // The original's product picture is there already while the course still names the original: it is not made
      // again; the first edit renames the course's placements to it.
      const [png, read] = await Promise.all([
        context.store.read(`${SPRITE_SOURCES_DIRECTORY}/${name}.png`),
        context.readFile(recipePath),
      ]);
      return {
        target,
        name,
        recipe: readSpriteRecipe(JSON.parse(new TextDecoder().decode(read.bytes))),
        revision: read.revision,
        image: await importInWorker.decode(png),
        key: `${name} ${await contentDigest(png)}`,
        png: null,
        made: null,
        first: true,
      };
    }
    const path = imagePathIn(context.paths(), picture.name);
    const key = `${path} ${picture.mirrored}`,
      revision = context.revision(path);
    // Made off the page's thread from the original's saved image; a failure is not kept, so the next showing asks again.
    if (firsts.get(key)?.revision !== revision) {
      const made = context.store
        .read(path)
        .then((bytes) => importInWorker.originalProduct({ bytes, name: picture.name, mirrored: picture.mirrored }));
      firsts.set(key, { revision, made });
      made.catch(() => firsts.get(key)?.made === made && firsts.delete(key));
    }
    const first = await firsts.get(key)!.made;
    return {
      target,
      name,
      recipe: first.recipe,
      revision: context.revision(`${SPRITE_SOURCES_DIRECTORY}/${name}.json`),
      image: first.image,
      key: `${name} ${await contentDigest(first.png)}`,
      png: null,
      made: first.png,
      first: true,
    };
  };

  /**
   * One edit of `from`: its recipe changed by `change` with the images its import makes, and the course changed by
   * `course` at the picture's placements; an original's product picture made with it. The edit is made in its turn from
   * the recipe, PNG and course as they stand then (`EditorContext.change`): built on this page's own edits since the
   * screen read them, refused when another page has changed them. A PNG the edit writes (`from.png`, imported now, or
   * `from.made`) comes with its own recipe. An original's edit is its first only while the course still names the
   * original: once this page's own edit has renamed it, the next is an ordinary edit of the product picture, which
   * neither writes the made PNG again nor renames.
   */
  const edit = async (
    from: Reading,
    change: ((recipe: SpriteRecipe) => SpriteRecipe) | null,
    label: string,
    course: ((images: readonly string[]) => CourseEdit) | null = null,
  ) => {
    const paths = context.paths();
    const base = `${SPRITE_SOURCES_DIRECTORY}/${from.name}`;
    const recipePath = `${base}.json`,
      pngPath = `${base}.png`;
    const { picture, course: courseId } = from.target;
    const coursePath = coursePathIn(paths, courseId);
    const writesSource = !!change || !!from.png || !!from.made || (from.first && picture.mirrored),
      editsCourse = from.first || !!course;
    const existed = paths.includes(recipePath);
    let made = '',
      lowResolution = false,
      // Whether the edit, as it is made, renamed the course's placements of the original: its history step's name says so.
      renaming = false;
    try {
      const written = await context.change(
        [
          ...(writesSource
            ? ([
                [recipePath, from.revision],
                [pngPath, context.revision(pngPath)],
              ] as const)
            : []),
          ...(editsCourse ? ([[coursePath, picture.courseRevision]] as const) : []),
        ],
        async (files) => {
          const writes: (readonly [string, Uint8Array<ArrayBuffer> | null])[] = [];
          // The course's edit, made off the page's thread: an original's first edit renames every placement of the
          // original to the product picture (it is the first while the course still names the original), and `course`
          // changes the placements by the names they show the picture by once the edit is made.
          let courseBytes: Uint8Array<ArrayBuffer> | null = null,
            renamed = 0;
          if (editsCourse) {
            const bytes = files.get(coursePath);
            if (!bytes) throw new RangeError(`${courseId} is gone`);
            const names = [from.first ? from.name : picture.name];
            if (picture.mirrored) names.push(`${names[0]}-mirrored`);
            const renames: [string, string][] = [[picture.name, from.name]];
            if (picture.mirrored) renames.push([`${picture.name}-mirrored`, `${from.name}-mirrored`]);
            const edited = await courses.edit(courseId, bytes, [
              ...(from.first ? [{ kind: 'rename' as const, renames, optional: true }] : []),
              ...(course ? [course(names)] : []),
            ]);
            renamed = from.first ? edited.changes[0]! : 0;
            if (renamed || course) courseBytes = edited.bytes;
          }
          const standing = writesSource ? files.get(recipePath) : null;
          const first = renamed > 0;
          renaming = first;
          if (from.made && !first && !standing) throw new RangeError(`${courseId} names neither picture`);
          const writesPng = from.png ?? (first ? from.made : null);
          if (writesPng) writes.push([pngPath, writesPng]);
          if (change || writesPng || (first && picture.mirrored)) {
            // The recipe and PNG as they stand, unless this edit writes a PNG with its own recipe.
            const before =
              !writesPng && standing ? readSpriteRecipe(JSON.parse(new TextDecoder().decode(standing))) : from.recipe;
            // The first edit of a picture the course also shows reflected gives a product picture without `mirror` (one
            // there already) its reflection, so no placement names a picture that is not there.
            const addsMirror = first && picture.mirrored && !before.mirror;
            let { image, key } = from;
            const png = writesPng ? null : files.get(pngPath);
            if (png) {
              const found = `${from.name} ${await contentDigest(png)}`;
              if (found !== key) [key, image] = [found, await importInWorker.decode(png)];
            }
            const changed = change ? change(before) : before;
            if (change || writesPng || addsMirror) {
              const recipe = readSpriteRecipe(
                JSON.parse(JSON.stringify(addsMirror ? { ...changed, mirror: true } : changed)),
              );
              // A redrawn picture enlarged beyond its saved PNG asks for the PNG again.
              lowResolution = sourceLowResolution(recipe) && picture.marks.includes('REDRAWN');
              const { files: images } = await importInWorker(key, image, recipe, from.name);
              const taken = images
                .map((image) => imagePathIn(paths, imageNameOfPath(image.path)!))
                .find(inOriginalsPlace);
              if (taken) throw new RangeError(`content/${taken} is an original picture, which no page writes`);
              writes.push(
                [recipePath, new TextEncoder().encode(formatSavedJson(recipe))],
                ...images.map((image) => [image.path, image.bytes] as const),
              );
            }
            if (addsMirror && existed) made = `; it writes its reflection now`;
          }
          if (first)
            made = existed
              ? `${from.name} was there already, so it was not made again${made}; ${renamed} names in ${courseId} now name it.`
              : `Made ${from.name}; ${renamed} names in ${courseId} now name it.`;
          if (courseBytes) writes.push([coursePath, courseBytes]);
          return writes;
        },
        () => (renaming ? `${existed ? 'Use' : 'Make'} ${from.name}: ${label}` : `${label} (${from.name})`),
      );
      if (written === null) return;
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

  /** Set the collision width of the picture's placements with a body (or change each one's), from `from`. */
  const setWidth = (from: Reading, width: number | { readonly step: number }, label = 'Set collision width') =>
    edit(from, null, label, (images) =>
      typeof width === 'number' ? { kind: 'widths', images, width } : { kind: 'step widths', images, step: width.step },
    );

  /**
   * The original course's collision widths of the picture's original over its width (m); null without them. It rejects
   * when the original course or picture could not be read.
   */
  const originalRatio = async (picture: UsedPicture, course: string) => {
    const original = picture.original;
    const paths = context.paths();
    const originalCourse = coursePathIn(paths, course.replace(/-product$/, ''));
    if (!original || !inOriginalsPlace(originalCourse) || !paths.includes(originalCourse)) return null;
    // Read off the page's thread (`courseWidthsOf`).
    const counts = new Map(
      await courses.widthsOf(originalCourse, [original, `${original}-mirrored`, original.replace(/-mirrored$/, '')]),
    );
    if (!counts.size) return null;
    const read = await pictureMaster(context, looks, original);
    // The most common width, the smaller on a tie.
    const [width] = [...counts].sort(([a, m], [b, n]) => n - m || a - b)[0]!;
    return { ratio: width / read.asset.worldWidthMeters, widths: [...counts.keys()].sort((a, b) => a - b) };
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
      const { anchorY } = masterAnchor(recipe);
      if (!(height > 0)) throw new RangeError('A height above the ground is more than 0');
      return {
        ...recipe,
        widthMeters: (recipe.widthMeters * height * SPRITE_SOURCE_TEXELS_PER_METER) / (anchorY + 0.5),
      };
    },
    'Set height',
  );
  field(fields.across, (recipe, x) => withMasterAnchor(recipe, x, masterAnchor(recipe).anchorY), 'Set base point');
  field(fields.ground, (recipe, y) => withMasterAnchor(recipe, masterAnchor(recipe).anchorX, y), 'Set ground row');
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
    let found: Awaited<ReturnType<typeof originalRatio>>;
    try {
      found = await originalRatio(from.target.picture, from.target.course);
    } catch (error) {
      note.textContent = `The original could not be read (${error instanceof Error ? error.message : error}); press it again to read it again.`;
      return;
    }
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
      // Only finding no placement of the baked picture leaves the course as it is; a failure stops the whole revert.
      const unbaked = await courses.edit(course, document.bytes, [
        {
          kind: 'unbake',
          image: from.name,
          pieces: placed.map((placement) => ({
            image: placement!.image,
            across: placement!.across,
            up: placement!.up,
          })),
          optional: true,
        },
      ]);
      if (unbaked.changes[0]) {
        back.push([coursePath, unbaked.bytes, document.revision]);
        renamedNote = `; its ${pieces.length} pieces stand again at ${unbaked.changes[0]} placements in ${course}`;
      }
    } else if (!inBuild && basis) {
      const renames: [string, string][] = [
        [from.name, basis.image],
        [`${from.name}-mirrored`, `${basis.image}-mirrored`],
      ];
      const coursePath = coursePathIn(paths, course);
      const document = await context.readFile(coursePath);
      // Only finding no placement naming the picture leaves the course as it is; a failure stops the whole revert.
      const renamed = await courses.edit(course, document.bytes, [{ kind: 'rename', renames, optional: true }]);
      if (renamed.changes[0]) {
        back.push([coursePath, renamed.bytes, document.revision]);
        renamedNote = `; ${renamed.changes[0]} names in ${course} name ${basis.image} again`;
      }
    }
    if (!back.length) {
      note.textContent = `${from.name} is as the build has it.`;
      return;
    }
    if ((await context.setFiles(back, `Revert picture ${from.name}`)) === null) {
      note.textContent = `Not reverted: nothing was written.`;
      return;
    }
    note.textContent = `Reverted ${from.name}${renamedNote}; collision widths are left as they are.`;
    if (!inBuild) choose(basis ? basis.image : pieces[0]!.placement!.image);
  };

  const draw = () => {
    if (!reading) return;
    const { anchorX, anchorY } = masterAnchor(reading.recipe);
    const values = {
      height: String(Math.round(((anchorY + 0.5) / SPRITE_SOURCE_TEXELS_PER_METER) * 1e4) / 1e4),
      across: String(Math.round(anchorX * 1e3) / 1e3),
      ground: String(Math.round(anchorY * 1e3) / 1e3),
    };
    const follows = (held: Reading, next: Reading) =>
      held.name === next.name &&
      context.follows(`${SPRITE_SOURCES_DIRECTORY}/${next.name}.json`, held.revision, next.revision);
    for (const [key, value] of Object.entries(values))
      drawField(fields[key as keyof typeof values], value, reading, drawnFrom, follows);
    texels.textContent = `(${Math.round((anchorY + 0.5) * 100) / 100} texels)`;
    const { widths, parted } = reading.target.picture;
    fields.width.disabled = ratio.disabled = !widths.length;
    // The width is the course's: a held reading moves on past this page's own edits of the course.
    drawField(fields.width, widths.length === 1 ? String(widths[0]) : '', reading, drawnFrom, (held, next) => {
      const path = coursePathIn(context.paths(), next.target.course);
      return (
        held.target.picture.name === next.target.picture.name &&
        context.follows(path, held.target.picture.courseRevision, next.target.picture.courseRevision)
      );
    });
    widthNote.textContent = [
      !widths.length
        ? parted
          ? ''
          : 'no placement has a body'
        : widths.length > 1
          ? `placements differ (${widths.join(', ')}); a width entered sets them all`
          : '',
      parted ? 'a body of several parts is left as it is' : '',
    ]
      .filter(Boolean)
      .join('; ');
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
        drawnFrom.clear();
        element.hidden = true;
      }
      const showing = ++shown;
      let next: Reading | null = null,
        failure: string | null = null;
      try {
        next = target ? await read(target) : null;
      } catch (error) {
        failure = `${target!.picture.name} could not be read (${error instanceof Error ? error.message : error}); choose it again to read it again.`;
      }
      if (showing !== shown) return;
      reading = next;
      element.hidden = !next && !failure;
      controls.hidden = !next;
      unread.hidden = !failure;
      unread.textContent = failure ?? '';
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
      // From the base point as the recipe stands when the edit is made, so moves in a row add up.
      void edit(
        from,
        (recipe) => {
          const { anchorX, anchorY } = masterAnchor(recipe);
          return withMasterAnchor(recipe, anchorX + dx, anchorY + dy);
        },
        'Move base point',
      );
    },
    /**
     * An arrow key: the base point by a texel, or each collision line a texel out (right, up) or in (left, down), at
     * every placement from its own width, so widths that differ keep their differences.
     */
    arrow(dx: number, dy: number) {
      const from = reading;
      if (arrows.value === 'point') return this.move(dx, dy);
      if (!from?.target.picture.widths.length) return;
      const step = ((dx || -dy) * 2) / SPRITE_SOURCE_TEXELS_PER_METER;
      void setWidth(from, { step }, 'Move collision lines');
    },
    /** Set the collision width (m) of the picture shown, as a dragged line says. */
    resize(width: number) {
      if (reading && width > 0) void setWidth(reading, width);
    },
  };
}
