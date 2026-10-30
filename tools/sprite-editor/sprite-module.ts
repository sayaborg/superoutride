import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { createComparison, type OpenSource } from './sprite-comparison.js';
import { createSpriteImporter } from './sprite-importer.js';
import { createPictureList } from './sprite-picture-list.js';
import type { UsedPicture } from './sprite-pictures.js';
import { createProductControls } from './sprite-product-controls.js';
import { mountSourceView } from './sprite-source-view.js';

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The sprite module: the chosen product course's pictures and the other sprite sources beside an original or product
 * picture's comparison and controls and the import, where a source PNG and its recipe make a course image master. Every
 * edit goes through the sprite operations and is one step of the page's history.
 */
export const spriteModule: EditorModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: EditorContext) {
    const side = make('div'),
      main = make('div', '', { class: 'sprite-main', tabindex: '-1' }),
      note = make('p', '', { role: 'status', class: 'hint' });
    // Imports run in a worker, shared by the import screen and the controls.
    const importer = createSpriteImporter();
    const controls = createProductControls(context, importer, (name) => void list.chooseUsed(name));
    const comparison = createComparison(context, (dx, dy) => controls.move(dx, dy));
    element.classList.add('sprite-editor');
    element.append(side, main);
    main.append(note, comparison.element, controls.element);
    // The chosen entry of the course's list (null for another sprite source) and the course it was chosen in.
    let chosen: { readonly picture: UsedPicture; readonly course: string } | null = null;
    const showPicture = (source: OpenSource | null) => {
      void comparison.show(chosen?.picture ?? null, source);
      void controls.show(chosen && { ...chosen, source });
    };
    const view = mountSourceView(
      main,
      context,
      importer,
      (name) => void list.choose(name),
      (source) => {
        const picture = chosen?.picture ?? null;
        if (!picture || source?.name === picture.source || (!source && !picture.source)) showPicture(source);
      },
    );
    const list = createPictureList(context, ({ source, picture, course }) => {
      chosen = picture && course ? { picture, course } : null;
      // An original picture has no source: it opens none.
      note.textContent =
        picture?.kind === 'original'
          ? `${picture.name} is an original picture, which no page edits; the course shows it until it has a product picture.`
          : '';
      void view.open(source);
    });
    side.append(list.element);
    // The arrow keys move the base point one texel, outside a field.
    main.addEventListener('keydown', (event) => {
      const step = ARROWS[event.key];
      if (!step || (event.target as HTMLElement).closest('input, select, textarea')) return;
      event.preventDefault();
      controls.move(...step);
    });
  },
};
