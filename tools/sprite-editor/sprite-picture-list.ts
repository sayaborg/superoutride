import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { SpriteLodAsset } from '../../src/image/sprite.js';
import type { EditorContext } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { spriteLayers } from '../graphics/sprite-layers.js';
import { productCourses, readPictureLists, spriteSources, type UsedPicture } from './sprite-pictures.js';

/** A chosen picture: the sprite source to open, if any, and the list entry and course it was chosen from. */
export interface PictureChoice {
  readonly source: string | null;
  readonly picture: UsedPicture | null;
  readonly course: string | null;
}

/** The browser's memory of the chosen product course. */
const CHOSEN_COURSE = 'superoutride.sprite-editor.course';
/** A thumbnail's longer side, in screen pixels. */
const THUMBNAIL = 48;

/**
 * The sprite editor's lists: a chosen product course, the pictures it uses (a mirror pair as one) with their kind and
 * marks, how many placements still use an original picture, and every other sprite source. Choosing an entry calls
 * `open`; the lists follow the working state, and the chosen entry read again is said to `reread`.
 */
export function createPictureList(
  context: EditorContext,
  open: (choice: PictureChoice) => void,
  reread: (picture: UsedPicture) => void,
) {
  const course = make('select');
  const summary = make('p', '', { class: 'hint' });
  const used = make('ul', '', { class: 'picture-list' });
  const others = make('ul', '', { class: 'picture-list' });
  const label = make('label', 'Product course ');
  label.append(course);
  const element = make('div', '', { class: 'picture-lists' });
  element.append(
    label,
    summary,
    make('h2', 'Pictures the course uses'),
    used,
    make('h2', 'Other sprite sources'),
    others,
  );
  let chosen: string | null = null,
    // An entry to open once the lists show it, as after a product picture is made.
    opening: string | null = null;
  const cache = new Map<string, Promise<unknown>>();
  let usedPictures: readonly UsedPicture[] = [];

  const entry = (key: string, content: (HTMLElement | string)[], choice: PictureChoice) => {
    const item = make('li', '', { tabindex: '0', 'data-key': key });
    item.classList.toggle('chosen', key === chosen);
    item.append(...content);
    const choose = () => {
      chosen = key;
      for (const other of element.querySelectorAll('li')) other.classList.toggle('chosen', other === item);
      open(choice);
    };
    item.addEventListener('click', choose);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose();
      }
    });
    return item;
  };

  const show = async () => {
    const courses = productCourses(context.paths());
    if (courses.join() !== [...course.options].map((option) => option.value).join()) {
      const remembered = course.value || storedCourse();
      course.replaceChildren(...courses.map((id) => make('option', id, { value: id })));
      if (remembered && courses.includes(remembered)) course.value = remembered;
    }
    if (!course.value) {
      summary.textContent = 'No product course (`<original id>-product`) is in this build.';
      used.replaceChildren();
    } else
      try {
        const lists = await readPictureLists(context, course.value, cache);
        usedPictures = lists.used;
        summary.textContent = `${lists.originalPlacements} placement${lists.originalPlacements === 1 ? '' : 's'} still use an original picture.`;
        used.replaceChildren(
          ...lists.used.map((picture) =>
            entry(
              `used ${picture.name}`,
              [
                thumbnail(picture.asset),
                make('span', picture.mirrored ? `${picture.name} (and mirrored)` : picture.name, { class: 'name' }),
                badge(picture.kind === 'general' ? 'GENERAL' : picture.kind === 'original' ? 'ORIGINAL' : 'PRODUCT'),
                ...picture.marks.map(badge),
                make('span', `×${picture.placements}`, { class: 'hint' }),
              ],
              { source: picture.source, picture, course: course.value },
            ),
          ),
        );
        const waited = lists.used.find((picture) => `used ${picture.name}` === opening);
        if (waited) {
          opening = null;
          open({ source: waited.source, picture: waited, course: course.value });
        } else {
          const current = lists.used.find((picture) => `used ${picture.name}` === chosen);
          if (current) reread(current);
        }
        others.replaceChildren(
          ...lists.others.map((name) =>
            entry(`source ${name}`, [make('span', name, { class: 'name' })], {
              source: name,
              picture: null,
              course: null,
            }),
          ),
        );
        return;
      } catch (error) {
        summary.textContent = `${course.value}: ${error instanceof Error ? error.message : error}`;
        used.replaceChildren();
      }
    others.replaceChildren(
      ...spriteSources(context.paths()).map((name) =>
        entry(`source ${name}`, [make('span', name, { class: 'name' })], { source: name, picture: null, course: null }),
      ),
    );
  };
  let showing = Promise.resolve();
  const refresh = () => (showing = showing.then(show));
  context.subscribe(() => void refresh());
  course.addEventListener('change', () => {
    try {
      localStorage.setItem(CHOSEN_COURSE, course.value);
    } catch {
      // Without the browser's storage the choice lasts as long as the page.
    }
    void refresh();
  });
  void refresh();
  return {
    element,
    /** The pictures the chosen course uses, as last read. */
    used: () => usedPictures,
    /** The chosen product course, if any. */
    course: () => course.value || null,
    /** Mark a sprite source chosen, as when the page adds one. */
    choose(source: string) {
      chosen = `source ${source}`;
      return refresh();
    },
    /** Choose and open the course's picture `name` once the lists show it, as when the page makes it. */
    chooseUsed(name: string) {
      chosen = opening = `used ${name}`;
      return refresh();
    },
  };
}

function storedCourse(): string | null {
  try {
    return localStorage.getItem(CHOSEN_COURSE);
  } catch {
    return null;
  }
}

function badge(text: string): HTMLElement {
  return make('span', text, { class: `badge badge-${text.toLowerCase()}` });
}

/** The saved image's level 0 as the game colors it, its shadow dimmed, fitted into a small square. */
function thumbnail(asset: SpriteLodAsset | null): HTMLElement {
  const canvas = make('canvas', '', { class: 'thumbnail', width: String(THUMBNAIL), height: String(THUMBNAIL) });
  if (!asset) return canvas;
  const level = asset.levels[0]!;
  const { body, shadow } = spriteLayers(level);
  const scale = Math.min(1, THUMBNAIL / Math.max(body.width, body.height));
  const image = new ImageData(body.width, body.height);
  body.indices.forEach((slot, i) => {
    if (!slot) return;
    const { r, g, b } = unpackRgba(rgb555ToRgba(level.paletteRgb555[slot]!));
    image.data.set([r, g, b, 255], i * 4);
  });
  if (shadow) {
    const dx = shadow.anchorX - body.anchorX,
      dy = shadow.anchorY - body.anchorY;
    for (let y = 0; y < body.height; y++)
      for (let x = 0; x < body.width; x++) {
        const sx = x + dx,
          sy = y + dy;
        const i = y * body.width + x;
        if (sx >= 0 && sy >= 0 && sx < shadow.width && sy < shadow.height && shadow.indices[sy * shadow.width + sx])
          image.data.set([0, 0, 0, 96], i * 4);
      }
  }
  const scratch = new OffscreenCanvas(body.width, body.height);
  scratch.getContext('2d')!.putImageData(image, 0, 0);
  const graphics = canvas.getContext('2d')!;
  graphics.imageSmoothingEnabled = scale < 1;
  const width = body.width * scale,
    height = body.height * scale;
  graphics.drawImage(scratch, (THUMBNAIL - width) / 2, THUMBNAIL - height, width, height);
  return canvas;
}
