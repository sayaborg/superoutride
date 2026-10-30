import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { createPictureList } from './sprite-picture-list.js';
import { mountSourceView } from './sprite-source-view.js';

/**
 * The sprite module: the chosen product course's pictures and the other sprite sources beside the import, where a
 * source PNG and its recipe make a course image master. Every edit goes through the sprite operations and is one step
 * of the page's history.
 */
export const spriteModule: EditorModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: EditorContext) {
    const side = make('div'),
      main = make('div', '', { class: 'sprite-main' }),
      note = make('p', '', { role: 'status', class: 'hint' });
    element.classList.add('sprite-editor');
    element.append(side, main);
    main.append(note);
    const view = mountSourceView(main, context, (name) => void list.choose(name));
    const list = createPictureList(context, ({ source, picture }) => {
      // An original picture has no source: it opens none.
      note.textContent =
        picture?.kind === 'original'
          ? `${picture.name} is an original picture, which no page edits; the course shows it until it has a product picture.`
          : '';
      void view.open(source);
    });
    side.append(list.element);
  },
};
