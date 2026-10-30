import type { EditorContext, EditorModule } from '../browser-shared/editor-context.js';
import { make } from '../browser-shared/dom.js';
import { createComparison } from './sprite-comparison.js';
import { createPictureList } from './sprite-picture-list.js';
import type { UsedPicture } from './sprite-pictures.js';
import { mountSourceView } from './sprite-source-view.js';

/**
 * The sprite module: the chosen product course's pictures and the other sprite sources beside the comparison of an
 * original or product picture's pictures and the import, where a source PNG and its recipe make a course image master.
 * Every edit goes through the sprite operations and is one step of the page's history.
 */
export const spriteModule: EditorModule = {
  id: 'sprites',
  title: 'Sprites',
  mount(element: HTMLElement, context: EditorContext) {
    const side = make('div'),
      main = make('div', '', { class: 'sprite-main' }),
      note = make('p', '', { role: 'status', class: 'hint' });
    const comparison = createComparison(context);
    element.classList.add('sprite-editor');
    element.append(side, main);
    main.append(note, comparison.element);
    // The chosen entry of the course's list; null for another sprite source.
    let chosen: UsedPicture | null = null;
    const view = mountSourceView(
      main,
      context,
      (name) => void list.choose(name),
      (source) => {
        if (chosen === null || source?.name === chosen.source || (!source && !chosen.source))
          void comparison.show(chosen, source);
      },
    );
    const list = createPictureList(context, ({ source, picture }) => {
      chosen = picture;
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
